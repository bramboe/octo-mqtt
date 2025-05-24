"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const logger_1 = require("../Utils/logger");
// Get environment variables with fallbacks
const host = process.env.MQTTHOST || 'localhost';
const port = parseInt(process.env.MQTTPORT || '1883', 10);
const username = process.env.MQTTUSER || '';
const password = process.env.MQTTPASSWORD || '';
// Generate a unique client ID to avoid connection conflicts
const clientId = `octo_mqtt_${Math.random().toString(16).substring(2, 10)}`;
// Log MQTT configuration for debugging
(0, logger_1.logInfo)(`[MQTT] Connecting to ${host}:${port}`);
(0, logger_1.logInfo)(`[MQTT] Authentication: ${username ? 'Using credentials' : 'Anonymous'}`);
(0, logger_1.logInfo)(`[MQTT] Client ID: ${clientId}`);
// Create base configuration
const config = {
    protocol: 'mqtt',
    host,
    port,
    clientId,
    clean: true,
    reconnectPeriod: 5000,
    connectTimeout: 10000,
    rejectUnauthorized: false
};
// Only add auth if username is provided
if (username) {
    config.username = username;
    // Only set password if provided
    if (password) {
        config.password = password;
    }
    else {
        (0, logger_1.logWarn)('[MQTT] Username provided but password is empty');
    }
}
else {
    (0, logger_1.logInfo)('[MQTT] No authentication credentials provided, connecting anonymously');
}
exports.default = config;
//# sourceMappingURL=MQTTConfig.js.map