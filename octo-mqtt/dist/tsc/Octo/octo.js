"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.octo = void 0;
const buildDictionary_1 = require("../Utils/buildDictionary");
const deferred_1 = require("../Utils/deferred");
const logger_1 = require("../Utils/logger");
const BLEController_1 = require("../BLE/BLEController");
const setupDeviceInfoSensor_1 = require("../BLE/setupDeviceInfoSensor");
const buildMQTTDeviceData_1 = require("../Common/buildMQTTDeviceData");
const calculateChecksum_1 = require("./calculateChecksum");
const extractFeaturesFromData_1 = require("./extractFeaturesFromData");
const extractPacketFromMessage_1 = require("./extractPacketFromMessage");
const options_1 = require("./options");
const setupLightSwitch_1 = require("./setupLightSwitch");
const setupMotorEntities_1 = require("./setupMotorEntities");
const byte_1 = require("../Utils/byte");
const buildComplexCommand = ({ command, data }) => {
    const dataLen = data?.length || 0;
    const bytes = [
        0x40,
        ...command,
        dataLen >> 8,
        dataLen,
        0x0, // checksum byte
        ...(data || []),
        0x40,
    ].map(byte_1.byte);
    bytes[5] = (0, calculateChecksum_1.calculateChecksum)(bytes);
    return bytes;
};
// Add a timeout for feature requests - time to wait for features before moving on
const FEATURE_REQUEST_TIMEOUT_MS = 15000; // 15 seconds
// Add maximum retry attempts
const MAX_FEATURE_REQUEST_ATTEMPTS = 3;
const octo = async (mqtt, esphome) => {
    const devices = (0, options_1.getDevices)();
    if (!devices.length)
        return (0, logger_1.logInfo)('[Octo] No devices configured');
    const devicesMap = (0, buildDictionary_1.buildDictionary)(devices, (device) => ({ key: device.name.toLowerCase(), value: device }));
    const deviceNames = Object.keys(devicesMap);
    if (deviceNames.length !== devices.length)
        return (0, logger_1.logError)('[Octo] Duplicate name detected in configuration');
    const bleDevices = await esphome.getBLEDevices(deviceNames);
    for (const bleDevice of bleDevices) {
        const { name, mac, address, connect, disconnect, getCharacteristic, getDeviceInfo } = bleDevice;
        const { pin, ...device } = devicesMap[mac] || devicesMap[name.toLowerCase()];
        const deviceData = (0, buildMQTTDeviceData_1.buildMQTTDeviceData)({ ...device, address }, 'Octo');
        await connect();
        const characteristic = await getCharacteristic('0000ffe0-0000-1000-8000-00805f9b34fb', '0000ffe1-0000-1000-8000-00805f9b34fb');
        if (!characteristic) {
            (0, logger_1.logWarn)(`[Octo] Could not find required characteristic for device ${name}`);
            await disconnect();
            continue;
        }
        (0, logger_1.logInfo)(`[Octo] Found characteristic with handle: ${characteristic.handle}`);
        // Create the BLE controller
        const controller = new BLEController_1.BLEController(deviceData, bleDevice, characteristic.handle, (command) => buildComplexCommand(Array.isArray(command) ? { command: command } : command), {
            feedback: characteristic.handle,
        }, pin);
        // Set up feature detection
        const featureState = { hasLight: false, lightState: false, hasPin: false, pinLock: false };
        let currentAttempt = 0;
        let featuresReceived = false;
        // Function to request features and wait with retry logic
        const requestFeatures = async () => {
            currentAttempt++;
            (0, logger_1.logInfo)(`[Octo] Requesting features for device ${name} (attempt ${currentAttempt}/${MAX_FEATURE_REQUEST_ATTEMPTS})`);
            const allFeaturesReturned = new deferred_1.Deferred();
            // Add timeout for feature request
            const featureRequestTimeout = setTimeout(() => {
                if (!featuresReceived) {
                    (0, logger_1.logWarn)(`[Octo] Timeout waiting for features from device ${name}, attempt ${currentAttempt}/${MAX_FEATURE_REQUEST_ATTEMPTS}`);
                    allFeaturesReturned.resolve();
                }
            }, FEATURE_REQUEST_TIMEOUT_MS);
            const loadFeatures = (message) => {
                (0, logger_1.logInfo)(`[Octo] Received data from device: ${Array.from(message).map(b => b.toString(16)).join(' ')}`);
                const packet = (0, extractPacketFromMessage_1.extractPacketFromMessage)(message);
                if (!packet) {
                    (0, logger_1.logWarn)(`[Octo] Failed to extract packet from message`);
                    return;
                }
                const { command, data } = packet;
                (0, logger_1.logInfo)(`[Octo] Extracted packet - command: ${command.map(b => b.toString(16)).join(' ')}, data length: ${data.length}`);
                if (command[0] == 0x21 && command[1] == 0x71) {
                    // features
                    (0, logger_1.logInfo)(`[Octo] Received feature data: ${JSON.stringify(Array.from(data))}`);
                    const featureValue = (0, extractFeaturesFromData_1.extractFeatureValuePairFromData)(data);
                    if (featureValue == null) {
                        (0, logger_1.logWarn)(`[Octo] Failed to extract feature value from data`);
                        return;
                    }
                    featuresReceived = true;
                    const { feature, value } = featureValue;
                    (0, logger_1.logInfo)(`[Octo] Parsed feature: ${feature.toString(16)}, value: ${JSON.stringify(Array.from(value))}`);
                    switch (feature) {
                        case 0x3:
                            featureState.hasPin = value[0] == 0x1;
                            featureState.pinLock = value[1] !== 0x1;
                            (0, logger_1.logInfo)(`[Octo] Has PIN: ${featureState.hasPin}, PIN locked: ${featureState.pinLock}`);
                            return;
                        case 0x102:
                            featureState.hasLight = true;
                            featureState.lightState = value[0] == 0x1;
                            (0, logger_1.logInfo)(`[Octo] Has light: ${featureState.hasLight}, light state: ${featureState.lightState}`);
                            return;
                        case 0xffffff:
                            (0, logger_1.logInfo)(`[Octo] End of features marker received`);
                            clearTimeout(featureRequestTimeout);
                            return allFeaturesReturned.resolve();
                    }
                }
                else {
                    (0, logger_1.logInfo)(`[Octo] Received non-feature packet with command: ${command.map(b => b.toString(16)).join(' ')}`);
                }
            };
            controller.on('feedback', loadFeatures);
            try {
                // Send the feature request command
                await controller.writeCommand([0x20, 0x71]);
                await allFeaturesReturned;
            }
            catch (error) {
                (0, logger_1.logError)(`[Octo] Error requesting features: ${error}`);
            }
            finally {
                clearTimeout(featureRequestTimeout);
                controller.off('feedback', loadFeatures);
            }
            // If we didn't receive any features and haven't reached max attempts, try again
            if (!featuresReceived && currentAttempt < MAX_FEATURE_REQUEST_ATTEMPTS) {
                (0, logger_1.logInfo)(`[Octo] Retrying feature request for device ${name}`);
                return requestFeatures();
            }
            // If we tried max attempts and still didn't get features, continue with defaults
            if (!featuresReceived) {
                (0, logger_1.logWarn)(`[Octo] Failed to get features after ${MAX_FEATURE_REQUEST_ATTEMPTS} attempts, continuing with defaults`);
            }
        };
        // Request features
        await requestFeatures();
        // Handle PIN if needed
        if (featureState.hasPin && featureState.pinLock) {
            if (pin?.length !== 4) {
                (0, logger_1.logError)('[Octo] 4 Digit Numeric Pin Required But Not Provided');
                await disconnect();
                continue;
            }
            (0, logger_1.logInfo)('[Octo] Sending PIN to unlock device');
            try {
                // Set PIN for keep-alive
                controller.setPin(pin);
                // Send initial PIN command
                await controller.writeCommand({ command: [0x20, 0x43], data: pin.split('').map((c) => parseInt(c)) });
                (0, logger_1.logInfo)('[Octo] PIN sent successfully, device unlocked');
            }
            catch (error) {
                (0, logger_1.logError)(`[Octo] Error sending PIN: ${error}`);
                await disconnect();
                continue;
            }
        }
        (0, logger_1.logInfo)('[Octo] Setting up entities for device:', name);
        const deviceInfo = await getDeviceInfo();
        if (deviceInfo)
            (0, setupDeviceInfoSensor_1.setupDeviceInfoSensor)(mqtt, controller, deviceInfo);
        if (featureState.hasLight) {
            (0, setupLightSwitch_1.setupLightSwitch)(mqtt, controller, featureState.lightState);
        }
        (0, setupMotorEntities_1.setupMotorEntities)(mqtt, {
            cache: controller.cache,
            deviceData: controller.deviceData,
            writeCommand: (command, count, waitTime) => controller.writeCommand(command),
            writeCommands: (commands, count, waitTime) => controller.writeCommands(commands, count),
            cancelCommands: () => controller.cancelCommands()
        });
    }
};
exports.octo = octo;
//# sourceMappingURL=octo.js.map