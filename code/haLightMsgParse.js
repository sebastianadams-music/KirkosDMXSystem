const axios = require('axios');
const maxApi = require('max-api');

const DICT_ID = "lightCmd"; // name of your dict in Max
const TEMP_DICT_ID = "singleLightCmd"; // name of your dict in Max
// previousStates will store both batch states (using a combined key) and single light states (using entity_id)
const previousStates = {}; 

maxApi.addHandler('bang', async () => {
    // REMOVED: Object.keys(previousStates).forEach(key => delete previousStates[key]);
    // This line was causing individual light control to break and is no longer needed 
    // because the new state key logic is robust enough.

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

            // Include command for state tracking consistency (e.g., tracking a 'turn_off' preset)
            data.command = command;

            groups[groupKey].entities.push(...entity_ids);
            // Merge data: ensure the final group data includes all parameters from all lights in that group
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

            // --- FIX FOR HANG & STABILITY ---
            // 1. Create a stable, non-expensive key
            const sortedEntities = group.entities.sort().join(','); 
            const combinedKey = `${groupKey}-${sortedEntities}`;
            
            // 2. Compare the previous state data (just the attributes)
            const prevStateData = previousStates[combinedKey];

            // 3. Check for change
            const hasChanged = !prevStateData || Object.keys(group.data).some(key => {
                // Check if any attribute has changed compared to the last sent state
                return JSON.stringify(prevStateData[key]) !== JSON.stringify(group.data[key]);
            });

            // If the command itself changes (e.g., from 'turn_on' to 'turn_off'), we must send.
            const commandHasChanged = !prevStateData || prevStateData.command !== command;

            if (!hasChanged && !commandHasChanged) {
                await maxApi.post(`⏩ Skipped group [${group.entities.join(", ")}] (no change)`);
                continue;
            }
            
            try {
                const response = await axios.post(url, payload);
                await maxApi.post(`✅ Sent group [${group.entities.join(", ")}] — Status: ${response.status}`);
                
                // Save the combined state for the group (important for batch consistency)
                previousStates[combinedKey] = { ...group.data }; 

                // Also update the state for each light individually (important for single light consistency)
                for (const entityId of group.entities) {
                    previousStates[entityId] = { ...group.data };
                }

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

// The rest of your haLightMsgParse.js handlers ('find', 'recall') remain as they were, 
// but will now benefit from the more stable state tracking logic above.
// If you're controlling individual lights through the TEMP_DICT_ID, you'll need a separate handler:

maxApi.addHandler('single_light_update', async () => {
    try {
        const dict = await maxApi.getDict(TEMP_DICT_ID);

        // Assuming TEMP_DICT_ID is structured to look like a single light from lightCmd's array
        const command = dict.command;
        const entity = dict.entity;
        
        if (!command || !entity) {
            await maxApi.post("❗ Single light dictionary must include 'command' and 'entity'");
            return;
        }

        const domain = "light";
        const entity_id = entity.startsWith("light.") ? entity : `light.${entity}`;

        // Create the data payload by copying all keys except 'command' and 'entity'
        const data = {};
        for (const [key, value] of Object.entries(dict)) {
            if (key !== "command" && key !== "entity") {
                data[key] = value;
            }
        }
        data.entity_id = [entity_id];
        data.command = command; // Include command for state tracking

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
            previousStates[combinedKey] = { ...data }; // Save state
        } catch (err) {
            const errMsg = err.response?.data?.message || err.message || "Unknown error";
            await maxApi.post(`❌ Error sending single light [${entity_id}]: ${errMsg}`);
        }
    } catch (error) {
        const errMsg = error.message || "Unknown error";
        await maxApi.post(`❌ Error in single light handler: ${errMsg}`);
    }
});