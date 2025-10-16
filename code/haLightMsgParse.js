const axios = require('axios');
const maxApi = require('max-api');

const DICT_ID = "lightCmd"; // name of your dict in Max
const TEMP_DICT_ID = "singleLightCmd"; // name of your dict in Max
// previousStates will store both batch states (using a combined key) and single light states (using entity_id)
const previousStates = {}; 

maxApi.addHandler('bang', async () => {
    // This handler processes the fast batch commands (presets)
    try {
        const dict = await maxApi.getDict(DICT_ID);

        const command = dict.command;
        const lights = dict.lights;

        if (!command) {
            await maxApi.post("❗ Dictionary must include 'command'");
            return;
        }
        if (!Array.isArray(lights) || lights.length === 0) {
            await maxApi.post("❗ Dictionary must include a 'lights' array with at least one light");
            return;
        }

        const domain = "light";
        const url = `http://localhost:3001/api/${domain}/${command}`;

        // === FAST BATCH FIX: Group lights by UNIQUE STATE (Mode + Attributes) ===
        // Using a Map where the key is a string representation of the sanitized light data.
        const groups = new Map();

        // Step 1: Group lights by unique state payload
        for (const light of lights) {
            if (!light.entity) {
                await maxApi.post("❗ Each light object must have an 'entity' key");
                continue;
            }

            const entities = Array.isArray(light.entity) ? light.entity : [light.entity];
            const entity_ids = entities.map(id => id.startsWith("light.") ? id : `light.${id}`);
            
            // CRITICAL FIX: Deep copy via JSON to ensure 'lightData' is a pure JS object
            let lightData = {};
            try {
                lightData = JSON.parse(JSON.stringify(light));
            } catch (e) {
                await maxApi.post(`❌ Error purifying light data for ${entities[0]}: ${e.message}`);
                continue;
            }

            // Remove the entity key and null values before processing
            delete lightData.entity;
            Object.keys(lightData).forEach(key => lightData[key] === null && delete lightData[key]);
            
            // --- CRITICAL SANITIZATION AND GROUP KEY GENERATION ---
            
            // 1. Enforce mode priority by deleting the opposite mode
            if (lightData.hasOwnProperty('rgb_color')) {
                // Enforce RGB mode
                delete lightData.color_temp_kelvin;
                delete lightData.color_temp;
            } else if (lightData.hasOwnProperty('color_temp_kelvin')) {
                // Enforce Kelvin mode
                delete lightData.rgb_color;
                delete lightData.xy_color;
                delete lightData.hs_color;
            }
            // Add command for state tracking (must be done before key generation)
            lightData.command = command; 

            // 2. Create a unique key based on the sanitized attributes
            const attributeKey = JSON.stringify(lightData);
            
            if (!groups.has(attributeKey)) {
                // If a unique state isn't found, create a new group for it
                groups.set(attributeKey, {
                    entities: [], 
                    data: lightData
                });
            }
            
            // Add entity(s) to the unique state group
            groups.get(attributeKey).entities.push(...entity_ids);
        }
        
        // Step 2: Process and send one API request per unique state group (FAST BATCH)
        for (const [attributeKey, group] of groups.entries()) {
            if (group.entities.length === 0) continue;

            let payload = {
                entity_id: group.entities,
                ...group.data
            };
            
            // Remove the command attribute from the body, as it's only for state tracking
            delete payload.command; 

            // --- Optimized State Check ---
            const sortedEntities = group.entities.sort().join(','); 
            const combinedKey = `${attributeKey}-${sortedEntities}`; // Use the attributeKey (state) as the base
            const prevStateData = previousStates[combinedKey];

            // Use the payload data (without entity_id) for comparison
            const currentPayloadData = { ...payload };
            delete currentPayloadData.entity_id; 

            // Compare only the attributes that will be sent in the payload
            const attributesChanged = !prevStateData || Object.keys(currentPayloadData).some(key => {
                return JSON.stringify(prevStateData[key]) !== JSON.stringify(currentPayloadData[key]);
            });
            const commandChanged = !prevStateData || prevStateData.command !== command;
            const keysChanged = !prevStateData || Object.keys(prevStateData || {}).length !== Object.keys(currentPayloadData).length;

            if (!attributesChanged && !commandChanged && !keysChanged) {
                await maxApi.post(`⏩ Skipped group [${group.entities.join(", ")}] (no change)`);
                continue;
            }
            
            // Send the request for this specific group
            try {
                const response = await axios.post(url, payload);
                await maxApi.post(`✅ Sent group [${group.entities.join(", ")}] — Status: ${response.status}`);
                
                // Save the current state for consistency (including the command for state check)
                previousStates[combinedKey] = { ...currentPayloadData, command: command }; 

                // Update individual light states for UI/single light consistency
                for (const entityId of group.entities) {
                    previousStates[entityId] = { ...currentPayloadData, command: command };
                }

            } catch (err) {
                // Enhanced error logging
                const errMsg = err.response?.data?.error || err.response?.data?.message || err.message || "Unknown error";
                const errStatus = err.response?.status ? ` (Status: ${err.response.status})` : '';
                await maxApi.post(`❌ Error sending group [${group.entities.join(", ")}]: ${errMsg}${errStatus}`);
            }
        }
        // END OF BATCH LOOP

    } catch (error) {
        const errMsg = error.message || "Unknown error";
        await maxApi.post(`❌ Error: ${errMsg}`);
    }
});

// Single light command handler (REQUIRED for reliable UI control)
maxApi.addHandler('single_light_update', async (entity, command, ...args) => {
    try {
        const entity_id = entity.startsWith("light.") ? entity : `light.${entity}`;
        const domain = "light";
        
        // Build data payload from args
        let data = { entity_id: [entity_id] };
        for (let i = 0; i < args.length; i += 2) {
            data[args[i]] = args[i+1];
        }
        
        // CRITICAL FIX: Deep copy data to ensure it is a pure JS object before sanitation
        data = JSON.parse(JSON.stringify(data));

        // --- Sanitize single light data (Crucial to prevent 400 errors here too) ---
        if (data.hasOwnProperty('rgb_color')) {
            // Force deletion of Kelvin
            delete data.color_temp_kelvin;
            delete data.color_temp;
        } else if (data.hasOwnProperty('color_temp_kelvin')) {
            // Force deletion of RGB
            delete data.rgb_color;
            delete data.xy_color;
            delete data.hs_color;
        }

        // --- Use entity_id as the key for single lights ---
        const combinedKey = entity_id; 
        const prevStateData = previousStates[combinedKey];
        
        // --- Single Light Change Detection ---
        const attributesChanged = !prevStateData || Object.keys(data).some(key => {
             if (key === 'entity_id') return false; 
             return JSON.stringify(prevStateData[key]) !== JSON.stringify(data[key]);
        });
        const commandChanged = !prevStateData || prevStateData.command !== command;

        if (!attributesChanged && !commandChanged) {
            await maxApi.post(`⏩ Skipped single light ${combinedKey} (no change)`);
            return;
        }

        // Send request
        const url = `http://localhost:3001/api/${domain}/${command}`;

        try {
            const response = await axios.post(url, data);
            await maxApi.post(`✅ Sent single light [${entity_id}] — Status: ${response.status}`);
            previousStates[combinedKey] = { ...data, command: command }; // Save state with command
        } catch (err) {
            const errMsg = err.response?.data?.error || err.response?.data?.message || err.message || "Unknown error";
            const errStatus = err.response?.status ? ` (Status: ${err.response.status})` : '';
            await maxApi.post(`❌ Error sending single light [${entity_id}]: ${errMsg}${errStatus}`);
        }
    } catch (error) {
        await maxApi.post(`❌ Error in single light handler: ${error.message}`);
    }
});


// Find and Recall handlers are kept identical to the last stable versions.
maxApi.addHandler("find", async (...args) => {
    try {
        const entityName = args[0]; // Assume the entity name is the first argument after 'find'
        
        if (!entityName) {
            await maxApi.post("❗ Find handler requires an entity name.");
            maxApi.outlet("selectedIndex", -1);
            return;
        }

        const dict = await maxApi.getDict(DICT_ID);

        if (!dict || !Array.isArray(dict.lights)) {
            await maxApi.post("❗ No lights array found in dictionary");
            maxApi.outlet("selected light", -1);
            return;
        }

        const index = dict.lights.findIndex(light => light.entity === entityName);

        if (index !== -1) {
            await maxApi.post(`✅ Entity "${entityName}" found at index ${index}`);
        } else {
            await maxApi.post(`❌ Entity "${entityName}" not found`);
        }

        maxApi.outlet("selectedIndex", index);
    } catch (error) {
        await maxApi.post(`❌ Error in find handler: ${error.message}`);
        maxApi.outlet("selected light", -1);
    }
});

maxApi.addHandler("recall", async () => {
  try {
    const dict = await maxApi.getDict(DICT_ID);
    const lights = dict.lights;

    if (!Array.isArray(lights) || lights.length === 0) {
      await maxApi.post("❗ Dictionary must include a 'lights' array with at least one light");
      return;
    }

    for (const light of lights) {
      const entity = Array.isArray(light.entity) ? light.entity[0] : light.entity;

      if (!entity) {
        await maxApi.post("❗ Each light object must have an 'entity' key");
        continue;
      }

      const entity_id = entity.startsWith("light.") ? entity : `light.${entity}`;

      try {
        // Fetch the current state from the proxy server
        const url = `http://localhost:3001/api/states/${entity_id}`;
        const response = await axios.get(url);
        const haState = response.data;
        
        if (haState && haState.attributes) {
          // Get the original Dict keypath for this light
             // We need to determine the index in the 'lights' array (0-based)
             const lightIndex = lights.findIndex(l => (Array.isArray(l.entity) ? l.entity[0] : l.entity) === entity);
             if (lightIndex === -1) {
                 await maxApi.post(`⚠️ Recall failed: Could not find light index for entity ${entity}`);
                 continue;
             }
             const keyPath = DICT_ID + "::lights[" + lightIndex + "]";

          // Update the light object in the dictionary with the new attributes, discarding nulls
          const newState = {};

          if (haState.attributes.brightness !== null) {
            light.brightness = haState.attributes.brightness;
            newState.brightness = haState.attributes.brightness;
          } else {
                // Suppress Dict errors: We rely on the controlling Max object to handle key removal.
                // We only ensure the local JS object is cleaned up.
                delete light.brightness;
          }

          if (haState.attributes.rgb_color !== null) {
            light.rgb_color = haState.attributes.rgb_color;
            newState.rgb_color = haState.attributes.rgb_color;
          } else {
                delete light.rgb_color;
          }
          
          if (haState.attributes.color_temp_kelvin !== null) {
            light.color_temp_kelvin = haState.attributes.color_temp_kelvin;
            newState.color_temp_kelvin = haState.attributes.color_temp_kelvin;
          } else {
                delete light.color_temp_kelvin;
          }
          
            // Save state for single light control consistency
            previousStates[entity_id] = newState;

          await maxApi.post(`✅ Recalled state for ${entity_id}`);
        } else {
          await maxApi.post(`❌ No state data received for ${entity_id}`);
        }
      } catch (err) {
        const errMsg = err.response?.data?.message || err.message || "Unknown error";
        await maxApi.post(`❌ Error recalling state for ${entity_id}: ${errMsg}`);
      }
    }
    
    // After recalling all states, update the dictionary in Max
    await maxApi.setDict(DICT_ID, dict);
	await maxApi.setDict(TEMP_DICT_ID, dict);


  } catch (error) {
    const errMsg = error.message || "Unknown error";
    await maxApi.post(`❌ Error in recall handler: ${errMsg}`);
    }
});
