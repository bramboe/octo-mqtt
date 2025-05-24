"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectToMQTT = void 0;
const tslib_1 = require("tslib");
const logger_1 = require("../Utils/logger");
const mqtt_1 = tslib_1.__importDefault(require("../mqtt"));
const MQTTConfig_1 = tslib_1.__importDefault(require("./MQTTConfig"));
const MQTTConnection_1 = require("./MQTTConnection");
const connectToMQTT = () => {
    (0, logger_1.logInfo)('[MQTT] Connecting...');
    // Add more detailed logging of connection configuration
    const { host, port, username } = MQTTConfig_1.default;
    (0, logger_1.logInfo)(`[MQTT] Connecting to ${host}:${port} with ${username ? 'authentication' : 'no authentication'}`);
    const client = mqtt_1.default.connect(MQTTConfig_1.default);
    return new Promise((resolve, reject) => {
        // Set a connection timeout
        const connectionTimeout = setTimeout(() => {
            (0, logger_1.logError)('[MQTT] Connection timeout after 30 seconds');
            client.end(true);
            reject(new Error('Connection timeout'));
        }, 30000);
        client.once('connect', () => {
            clearTimeout(connectionTimeout);
            (0, logger_1.logInfo)('[MQTT] Connected successfully');
            resolve(new MQTTConnection_1.MQTTConnection(client));
        });
        client.once('error', (error) => {
            clearTimeout(connectionTimeout);
            (0, logger_1.logError)('[MQTT] Connect Error', error);
            // Try with anonymous connection if authentication fails
            if (error.message && error.message.includes('Not authorized')) {
                (0, logger_1.logWarn)('[MQTT] Authentication failed, trying anonymous connection');
                // Create new config without auth
                const anonymousConfig = { ...MQTTConfig_1.default };
                delete anonymousConfig.username;
                delete anonymousConfig.password;
                const anonymousClient = mqtt_1.default.connect(anonymousConfig);
                anonymousClient.once('connect', () => {
                    (0, logger_1.logInfo)('[MQTT] Connected anonymously');
                    resolve(new MQTTConnection_1.MQTTConnection(anonymousClient));
                });
                anonymousClient.once('error', (anonError) => {
                    (0, logger_1.logError)('[MQTT] Anonymous connection also failed', anonError);
                    reject(anonError);
                });
            }
            else {
                reject(error);
            }
        });
    });
};
exports.connectToMQTT = connectToMQTT;
//# sourceMappingURL=connectToMQTT.js.map