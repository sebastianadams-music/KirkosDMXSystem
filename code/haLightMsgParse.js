const axios = require('axios');
const maxApi = require('max-api');

const DICT_ID = "lightCmd"; // name of your dict in Max
const TEMP_DICT_ID = "singleLightCmd"; // name of your dict in Max
const previousStates = {};  // Store previous states to avoid duplicates

maxApi.addHandler('bang', async () => {
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

    for (const light of lights) {
      if (!light.entity) {
        await maxApi.post("❗ Each light object must have an 'entity' key");
        continue;
      }

      const entities = Array.isArray(light.entity) ? light.entity : [light.entity];

      // Remove entity key from data payload
      const data = {};

      for (const [key, value] of Object.entries(light)) {
        if (key !== "entity") {
          data[key] = value;
        }
      }

      // Normalize all entity IDs to have "light." prefix
      const entity_ids = entities.map(id => id.startsWith("light.") ? id : `light.${id}`);
      data.entity_id = entity_ids;

      // Check if any of these lights have a state change
      const combinedKey = entity_ids.join(",");
      const prevState = previousStates[combinedKey];
      const hasChanged = !prevState || Object.keys(data).some(key => {
        return JSON.stringify(prevState[key]) !== JSON.stringify(data[key]);
      });

      if (!hasChanged) {
        await maxApi.post(`⏩ Skipped ${combinedKey} (no change)`);
        continue;
      }

      // Send one request for the group
      const url = `http://localhost:3001/api/${domain}/${command}`;

      try {
        const response = await axios.post(url, data);
        await maxApi.post(`✅ Sent to [${entity_ids.join(", ")}] — Status: ${response.status}`);
        previousStates[combinedKey] = { ...data }; // Save state
      } catch (err) {
        const errMsg = err.response?.data?.message || err.message || "Unknown error";
        await maxApi.post(`❌ Error sending to [${entity_ids.join(", ")}]: ${errMsg}`);
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
        
        if (haState && haState.state) {
          // Update the light object in the dictionary with the new attributes
          light.brightness = haState.attributes.brightness;
          light.rgb_color = haState.attributes.rgb_color;
          light.color_temp_kelvin = haState.attributes.color_temp_kelvin;
          

          
          
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