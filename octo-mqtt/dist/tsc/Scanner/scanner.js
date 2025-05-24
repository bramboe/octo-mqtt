"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scanner = void 0;
const logger_1 = require("../Utils/logger");
const options_1 = require("./options");
const characteristicPropertyValues = {
    BROADCAST: 0x01,
    READ: 0x02,
    WRITE_NO_RESPONSE: 0x04,
    WRITE: 0x08,
    NOTIFY: 0x10,
    INDICATE: 0x20,
    AUTHENTICATED: 0x40,
    EXTENDED: 0x80,
};
const extractPropertyNames = (properties) => {
    const propertiesList = [];
    for (const [name, value] of Object.entries(characteristicPropertyValues)) {
        if ((properties & value) === value) {
            properties -= value;
            propertiesList.push(name);
            if (properties === 0)
                break;
        }
    }
    return propertiesList.sort();
};
const scanner = async (esphome) => {
    const devices = (0, options_1.getDevices)().filter((d) => !!d.name);
    if (devices.length === 0) {
        (0, logger_1.logInfo)('[Scanner] No devices configured');
        return;
    }
    // Create a map of device names to their configs
    const deviceMap = {};
    devices.forEach(device => {
        deviceMap[device.name.toLowerCase()] = device;
    });
    const deviceNames = devices.map(d => d.name.toLowerCase());
    if (deviceNames.length !== devices.length) {
        return (0, logger_1.logError)('[Scanner] Duplicate name detected in configuration');
    }
    const bleDevices = await esphome.getBLEDevices(deviceNames);
    for (const bleDevice of bleDevices) {
        const { name, mac } = bleDevice;
        (0, logger_1.logInfo)(`[Scanner] Found device: ${name} (${mac})`);
        try {
            const { connect, disconnect, getDeviceInfo, getServices } = bleDevice;
            (0, logger_1.logInfo)(`[Scanner] Connecting to ${name}`);
            await connect();
            (0, logger_1.logInfo)('[Scanner] Querying GATT services');
            const services = await getServices();
            (0, logger_1.logInfo)('[Scanner] Extracting device info');
            const deviceInfo = await getDeviceInfo();
            const servicesList = await Promise.all(services.map(async (service) => {
                const characteristicList = await Promise.all(service.characteristicsList.map(async (characteristic) => {
                    const { properties, handle } = characteristic;
                    const propertyList = [properties, ...extractPropertyNames(properties)];
                    let data = undefined;
                    if ((properties & 2) === 2) {
                        try {
                            const value = await bleDevice.readCharacteristic(handle);
                            const buffer = Buffer.from(value);
                            data = {
                                base64: buffer.toString('base64'),
                                ascii: buffer.toString(),
                                raw: Array.from(value),
                            };
                        }
                        catch {
                            data = 'Read Error';
                            console.error(`Couldn't read characteristic 0x${handle.toString(16)}`);
                        }
                    }
                    return { ...characteristic, properties: propertyList, ...(data ? { data } : {}) };
                }));
                return {
                    ...service,
                    characteristicsList: characteristicList.sort(({ uuid: uuidA }, { uuid: uuidB }) => uuidA.localeCompare(uuidB)),
                };
            }));
            const { address, addressType, rssi } = bleDevice.advertisement;
            const deviceData = {
                name,
                mac,
                address,
                addressType,
                rssi,
                ...(deviceInfo ? { deviceInfo } : {}),
                servicesList: servicesList.sort(({ uuid: uuidA }, { uuid: uuidB }) => uuidA.localeCompare(uuidB)),
            };
            (0, logger_1.logInfo)(`[Scanner] Output:\n${JSON.stringify(deviceData, null, 2)}`);
            await disconnect();
        }
        catch (error) {
            (0, logger_1.logError)(`[Scanner] Error scanning device ${name}:`, error);
        }
    }
    esphome.disconnect();
    (0, logger_1.logInfo)('[Scanner] Done');
};
exports.scanner = scanner;
//# sourceMappingURL=scanner.js.map