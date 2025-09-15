const axios = require('axios');
const maxApi = require('max-api');

const DICT_ID = "lightCmd"; // name of your dict in Max
const TEMP_DICT_ID = "singleLightCmd"; // name of your dict in Max
const previousStates = {};  // Store previous states to avoid duplicates
maxApi.addHandler('bang', async () => {
    // Clear the previous state cache before processing a new command.
    // This ensures a new preset is always sent, regardless of grouping.
    Object.keys(previousStates).forEach(key => delete previousStates[key]);

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
        const groups = {
            rgb: { entities: [], data: {} },
            colorTemp: { entities: [], data: {} },
            default: { entities: [], data: {} }
        };

        // Step 1: Group lights based on color mode and clean up data
        for (const light of lights) {
            if (!light.entity) {
                await maxApi.post("❗ Each light object must have an 'entity' key");
                continue;
            }

            const entity_ids = Array.isArray(light.entity) ? light.entity.map(id => id.startsWith("light.") ? id : `light.${id}`) : [`light.${light.entity}`];
            
            const data = {};
            let groupKey = "default";

            if (light.hasOwnProperty('rgb_color') && light.rgb_color !== null) {
                groupKey = "rgb";
                data.rgb_color = light.rgb_color;
            } else if (light.hasOwnProperty('color_temp_kelvin') && light.color_temp_kelvin !== null) {
                groupKey = "colorTemp";
                data.color_temp_kelvin = light.color_temp_kelvin;
            }
            
            if (light.hasOwnProperty('brightness') && light.brightness !== null) {
                data.brightness = light.brightness;
            }

            groups[groupKey].entities.push(...entity_ids);
            groups[groupKey].data = { ...groups[groupKey].data, ...data };
        }
        
        const url = `http://localhost:3001/api/${domain}/${command}`;

        // Step 2: Send a single request for each group
        for (const [groupKey, group] of Object.entries(groups)) {
            if (group.entities.length === 0) continue;

            const payload = {
                entity_id: group.entities,
                ...group.data
            };

            // The `hasChanged` check is now simpler because the cache is cleared.
            const combinedKey = `${groupKey}-${JSON.stringify(payload)}`;
            const hasChanged = !previousStates[combinedKey];
            
            if (!hasChanged) {
                await maxApi.post(`⏩ Skipped group [${group.entities.join(", ")}] (no change)`);
                continue;
            }
            
            try {
                const response = await axios.post(url, payload);
                await maxApi.post(`✅ Sent group [${group.entities.join(", ")}] — Status: ${response.status}`);
                previousStates[combinedKey] = true; // Mark this specific state as sent
            } catch (err) {
                const errMsg = err.response?.data?.message || err.message || "Unknown error";
                await maxApi.post(`❌ Error sending group [${group.entities.join(", ")}]: ${errMsg}`);
            }
        }
    } catch (error) {
        const errMsg = error.message || "Unknown error";
        await maxApi.post(`❌ Error: ${errMsg}`);
    }
});

// Find the index of an entity in the lights array
maxApi.addHandler("find", async (entityName) => {
  try {
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
          // Update the light object in the dictionary with the new attributes, discarding nulls
          if (haState.attributes.brightness !== null) {
            light.brightness = haState.attributes.brightness;
          } else {
            delete light.brightness;
          }

          if (haState.attributes.rgb_color !== null) {
            light.rgb_color = haState.attributes.rgb_color;
          } else {
            delete light.rgb_color;
          }
          
          if (haState.attributes.color_temp_kelvin !== null) {
            light.color_temp_kelvin = haState.attributes.color_temp_kelvin;
          } else {
            delete light.color_temp_kelvin;
          }
          
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