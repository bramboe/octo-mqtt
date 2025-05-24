"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectToESPHome = void 0;
const esphome_native_api_1 = require("@2colors/esphome-native-api");
const logger_1 = require("../Utils/logger");
const ESPConnection_1 = require("./ESPConnection");
const connect_1 = require("./connect");
const options_1 = require("./options");
const connectToESPHome = async () => {
    (0, logger_1.logInfo)('[ESPHome] Connecting...');
    const proxies = (0, options_1.getProxies)();
    if (proxies.length === 0) {
        (0, logger_1.logWarn)('[ESPHome] No BLE proxies configured. BLE functionality will not be available.');
        return new ESPConnection_1.ESPConnection([]);
    }
    (0, logger_1.logInfo)(`[ESPHome] Found ${proxies.length} BLE proxy configuration(s):`);
    proxies.forEach((proxy, index) => {
        (0, logger_1.logInfo)(`[ESPHome] Proxy #${index + 1}: host=${proxy.host}, port=${proxy.port}, password=${proxy.password ? 'set' : 'not set'}`);
    });
    try {
        const connections = await Promise.all(proxies.map(async (config) => {
            try {
                (0, logger_1.logInfo)(`[ESPHome] Creating connection to ${config.host}:${config.port}`);
                const connection = new esphome_native_api_1.Connection(config);
                return await (0, connect_1.connect)(connection);
            }
            catch (error) {
                (0, logger_1.logWarn)(`[ESPHome] Failed to connect to proxy at ${config.host}:${config.port}`);
                return null;
            }
        }));
        const validConnections = connections.filter(c => c !== null);
        if (validConnections.length === 0) {
            (0, logger_1.logWarn)('[ESPHome] Could not connect to any BLE proxies. BLE functionality will be limited.');
        }
        else {
            (0, logger_1.logInfo)(`[ESPHome] Successfully connected to ${validConnections.length} BLE proxies.`);
        }
        return new ESPConnection_1.ESPConnection(validConnections);
    }
    catch (error) {
        (0, logger_1.logWarn)('[ESPHome] Error connecting to BLE proxies. BLE functionality will be limited.');
        return new ESPConnection_1.ESPConnection([]);
    }
};
exports.connectToESPHome = connectToESPHome;
//# sourceMappingURL=connectToESPHome.js.map