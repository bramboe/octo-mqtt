"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.testConnection = void 0;
const esphome_native_api_1 = require("@2colors/esphome-native-api");
const logger_1 = require("../Utils/logger");
/**
 * A simple utility to test if an ESPHome device is accessible
 * This can be called from the command line with:
 * ts-node src/ESPHome/testConnection.ts <host> <port>
 */
const testConnection = async (host, port) => {
    (0, logger_1.logInfo)(`[ESPHome] Testing connection to ${host}:${port}`);
    const connection = new esphome_native_api_1.Connection({
        host,
        port,
    });
    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            (0, logger_1.logError)(`[ESPHome] Connection timeout for ${host}:${port}`);
            connection.disconnect();
            resolve(false);
        }, 5000);
        connection.once('error', (error) => {
            clearTimeout(timeout);
            (0, logger_1.logError)(`[ESPHome] Connection error: ${error}`);
            if (error.code) {
                (0, logger_1.logError)(`[ESPHome] Error code: ${error.code}`);
            }
            connection.disconnect();
            resolve(false);
        });
        connection.once('authorized', () => {
            clearTimeout(timeout);
            (0, logger_1.logInfo)(`[ESPHome] Successfully connected to ${host}:${port}`);
            connection.disconnect();
            resolve(true);
        });
        try {
            connection.connect();
        }
        catch (error) {
            clearTimeout(timeout);
            (0, logger_1.logError)(`[ESPHome] Connection exception: ${error}`);
            resolve(false);
        }
    });
};
exports.testConnection = testConnection;
// Allow running from command line
if (require.main === module) {
    const args = process.argv.slice(2);
    const host = args[0] || '192.168.2.102';
    const port = parseInt(args[1] || '6053', 10);
    testConnection(host, port)
        .then((success) => {
        if (success) {
            (0, logger_1.logInfo)('[ESPHome] Connection test successful');
            process.exit(0);
        }
        else {
            (0, logger_1.logError)('[ESPHome] Connection test failed');
            process.exit(1);
        }
    })
        .catch((error) => {
        (0, logger_1.logError)('[ESPHome] Test error:', error);
        process.exit(2);
    });
}
//# sourceMappingURL=testConnection.js.map