const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Replace with your Home Assistant URL and token
const HOME_ASSISTANT_URL = 'http://homeassistant.local:8123';
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJiZTFhZDM0NDcyMzQ0ZmY3YWMyOTlhYjMzODMxZmY4YiIsImlhdCI6MTc0ODEwMDA0NiwiZXhwIjoyMDYzNDYwMDQ2fQ.bgHQsNRrnXuP0gxHotnR3J9hlt1bZjTkwZxq5BLDa-I';

// Middleware to add auth headers to all Home Assistant requests
const haAuthHeaders = {
  Authorization: `Bearer ${TOKEN}`,
  'Content-Type': 'application/json',
};

// Proxy POST to Home Assistant for service calls
app.post('/api/:domain/:service', async (req, res) => {
  const { domain, service } = req.params;

  try {
    const response = await axios.post(
      `${HOME_ASSISTANT_URL}/api/services/${domain}/${service}`,
      req.body,
      { headers: haAuthHeaders }
    );
    res.status(response.status).json(response.data);
  } catch (error) {
    // Improved error logging for POST requests
    if (error.response) {
      console.error(`Error forwarding service call for ${domain}/${service}:`);
      console.error(`Status: ${error.response.status}`);
      console.error(`Data: ${JSON.stringify(error.response.data)}`);
      res.status(error.response.status).json({ error: error.response.data });
    } else if (error.request) {
      console.error('Error: No response received from Home Assistant for service call.');
      res.status(500).json({ error: 'Home Assistant is unreachable for service calls' });
    } else {
      console.error('Error: Failed to set up service call request.', error.message);
      res.status(500).json({ error: error.message });
    }
  }
});

// Proxy GET to Home Assistant for a specific entity's state
app.get('/api/states/:entity_id', async (req, res) => {
  const { entity_id } = req.params;

  try {
    const response = await axios.get(
      `${HOME_ASSISTANT_URL}/api/states/${entity_id}`,
      { headers: haAuthHeaders }
    );
    res.status(response.status).json(response.data);
  } catch (error) {
    // Improved error logging to pinpoint the issue
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error(`Error fetching state for ${entity_id}:`);
      console.error(`Status: ${error.response.status}`);
      console.error(`Data: ${JSON.stringify(error.response.data)}`);
      res.status(error.response.status).json({ error: error.response.data });
    } else if (error.request) {
      // The request was made but no response was received
      console.error('Error: No response received from Home Assistant.');
      res.status(500).json({ error: 'Home Assistant is unreachable' });
    } else {
      // Something happened in setting up the request that triggered an Error
      console.error('Error: Failed to set up request to Home Assistant.', error.message);
      res.status(500).json({ error: error.message });
    }
  }
});

// Start the server
const PORT = 3001;

// --- FIX: Wrap server startup in try/catch to ensure errors are logged ---
try {
    app.listen(PORT, () => {
        console.log(`Proxy server running at http://localhost:${PORT}`);
    });
} catch (e) {
    // This will capture errors related to module loading or port binding failure
    console.error(`FATAL STARTUP ERROR: ${e.message}`);
}
