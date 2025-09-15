const maxApi = require("max-api");
const WebSocket = require('ws');

// Replace with your Home Assistant URL and token
const HOME_ASSISTANT_URL = "ws://homeassistant.local:8123/api/websocket";
const TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJiZTFhZDM0NDcyMzQ0ZmY3YWMyOTlhYjMzODMxZmY4YiIsImlhdCI6MTc0ODEwMDA0NiwiZXhwIjoyMDYzNDYwMDQ2fQ.bgHQsNRrnXuP0gxHotnR3J9hlt1bZjTkwZxq5BLDa-I";

// The entity ID of the automation button you want to listen for
const AUTOMATION_ENTITY_ID = "automation.button4";

let ws;
let messageId = 1;

function connectWebSocket() {
    ws = new WebSocket(HOME_ASSISTANT_URL);

    ws.onopen = () => {
        maxApi.post("✅ WebSocket connection to Home Assistant established.");
        // Authenticate with the Home Assistant API
        const authMessage = {
            "type": "auth",
            "access_token": TOKEN
        };
        ws.send(JSON.stringify(authMessage));
    };

ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    maxApi.post(`🔄 Received message: ${JSON.stringify(message, null, 2)}`);

    // Handle the authentication response
    if (message.type === "auth_ok") {
        maxApi.post("✅ Authentication successful. Subscribing to automation triggers...");

        const subscribeMessage = {
            "id": messageId++,
            "type": "subscribe_trigger",
            "trigger": {
                "platform": "state",
                "entity_id": AUTOMATION_ENTITY_ID
            }
        };
        ws.send(JSON.stringify(subscribeMessage));
    }

    // This block now specifically handles 'trigger' events
    if (
  message.type === "event" &&
  message.event.variables &&
  message.event.variables.trigger
) {
  maxApi.outlet("automation_pressed", "bang");
  maxApi.post(`✅ Automation "${AUTOMATION_ENTITY_ID}" was triggered!`);
}

};
    ws.onclose = () => {
        maxApi.post("❌ WebSocket connection closed. Attempting to reconnect...");
        setTimeout(connectWebSocket, 5000); // Attempt to reconnect after 5 seconds
    };

    ws.onerror = (error) => {
        maxApi.post(`❌ WebSocket error: ${error.message}`);
    };
}

// Handler to start the connection when receiving a 'bang' from Max
maxApi.addHandler('bang', () => {
    maxApi.post("Connecting to Home Assistant WebSocket...");
    connectWebSocket();
});

maxApi.addHandler('disconnect', () => {
    if (ws) {
        ws.close();
        maxApi.post("WebSocket manually disconnected.");
    }
});