"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupLightSwitch = void 0;
const Switch_1 = require("../HomeAssistant/Switch");
const buildEntityConfig_1 = require("../Common/buildEntityConfig");
const logger_1 = require("../Utils/logger");
const extractFeaturesFromData_1 = require("./extractFeaturesFromData");
const extractPacketFromMessage_1 = require("./extractPacketFromMessage");
const setupLightSwitch = (mqtt, controller, initialState = false) => {
    (0, logger_1.logInfo)('[Octo] Setting up light switch');
    try {
        // Create cache if needed
        if (!controller.cache.lightSwitch) {
            // Use the exact command formats from ESPHome config
            const ON_COMMAND = {
                command: [0x20, 0x72],
                data: [0x00, 0x01, 0x02, 0x01, 0x01, 0x01, 0x01, 0x01]
            };
            const OFF_COMMAND = {
                command: [0x20, 0x72],
                data: [0x00, 0x01, 0x02, 0x01, 0x01, 0x01, 0x01, 0x00]
            };
            // Create the light switch
            controller.cache.lightSwitch = new Switch_1.Switch(mqtt, controller.deviceData, (0, buildEntityConfig_1.buildEntityConfig)('UnderBedLights', { icon: 'mdi:lightbulb' }), async (state) => {
                (0, logger_1.logInfo)(`[Octo] Light switch ${state ? 'ON' : 'OFF'} command received`);
                try {
                    // Use the exact command format from ESPHome
                    const command = state ? ON_COMMAND : OFF_COMMAND;
                    await controller.writeCommand(command);
                    (0, logger_1.logInfo)(`[Octo] Light switch command sent successfully`);
                    // Store state in cache for state recovery
                    controller.cache.lightState = state;
                    return true;
                }
                catch (error) {
                    (0, logger_1.logError)(`[Octo] Error sending light command: ${error}`);
                    return false;
                }
            });
            // Set initial state
            controller.cache.lightSwitch.setState(initialState);
            (0, logger_1.logInfo)(`[Octo] Light switch created with initial state: ${initialState}`);
        }
        controller.on('feedback', (message) => {
            const packet = (0, extractPacketFromMessage_1.extractPacketFromMessage)(message);
            if (!packet)
                return;
            const { command, data } = packet;
            if (command[0] == 0x21 && command[1] == 0x71) {
                // feature
                const featureValuePair = (0, extractFeaturesFromData_1.extractFeatureValuePairFromData)(data);
                if (!featureValuePair)
                    return;
                const { feature, value } = featureValuePair;
                if (feature == 0x3 && controller.cache.lightSwitch) {
                    controller.cache.lightSwitch.setState(value[0] == 0x01);
                }
            }
        });
    }
    catch (error) {
        (0, logger_1.logError)(`[Octo] Error setting up light switch: ${error}`);
    }
};
exports.setupLightSwitch = setupLightSwitch;
//# sourceMappingURL=setupLightSwitch.js.map