"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.connect = void 0;
const logger_1 = require("../Utils/logger");
const connect = (connection) => {
    return new Promise((resolve, reject) => {
        (0, logger_1.logInfo)(`[ESPHome] Attempting to connect to ${connection.host}:${connection.port}`);
        const timeout = setTimeout(() => {
            (0, logger_1.logWarn)(`[ESPHome] Connection timeout for ${connection.host}:${connection.port}`);
            reject(new Error(`Connection timeout for ${connection.host}:${connection.port}`));
        }, 10000); // 10 second timeout
        const errorHandler = (error) => {
            clearTimeout(timeout);
            (0, logger_1.logError)('[ESPHome] Failed Connecting:', error);
            (0, logger_1.logError)(`[ESPHome] Connection details: host=${connection.host}, port=${connection.port}, password=${connection.password ? 'set' : 'not set'}`);
            if (error.code) {
                (0, logger_1.logError)(`[ESPHome] Error code: ${error.code}`);
            }
            reject(error);
        };
        connection.once('authorized', async () => {
            clearTimeout(timeout);
            (0, logger_1.logInfo)('[ESPHome] Connected:', connection.host);
            connection.off('error', errorHandler);
            try {
                // TODO: Fix next two lines after new version of esphome-native-api is released
                const deviceInfo = await connection.deviceInfoService();
                (0, logger_1.logInfo)('[ESPHome] Device info retrieved:', JSON.stringify(deviceInfo));
                const { bluetoothProxyFeatureFlags } = deviceInfo;
                if (!bluetoothProxyFeatureFlags) {
                    (0, logger_1.logWarn)(`[ESPHome] No Bluetooth proxy features detected on ${connection.host}`);
                    return reject(new Error(`No Bluetooth proxy features on ${connection.host}`));
                }
                resolve(connection);
            }
            catch (error) {
                (0, logger_1.logError)('[ESPHome] Error getting device info:', error);
                reject(error);
            }
        });
        const doConnect = (handler) => {
            try {
                connection.once('error', handler);
                (0, logger_1.logInfo)(`[ESPHome] Initiating connection to ${connection.host}:${connection.port}`);
                connection.connect();
                connection.off('error', handler);
                connection.once('error', errorHandler);
            }
            catch (err) {
                clearTimeout(timeout);
                (0, logger_1.logError)('[ESPHome] Exception during connection attempt:', err);
                errorHandler(err);
            }
        };
        const retryHandler = (error) => {
            (0, logger_1.logWarn)('[ESPHome] Failed Connecting (will retry once):', error);
            if (error.code) {
                (0, logger_1.logWarn)(`[ESPHome] First attempt error code: ${error.code}`);
            }
            doConnect(errorHandler);
        };
        doConnect(retryHandler);
    });
};
exports.connect = connect;
//# sourceMappingURL=connect.js.map