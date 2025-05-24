"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BLEDevice = void 0;
const logger_1 = require("../../Utils/logger");
const READ_CHARACTERISTIC_TIMEOUT = 5000; // 5 second timeout for reads
// Type guard to check if an object is an EventEmitter
function isEventEmitter(obj) {
    return obj && typeof obj === 'object' &&
        typeof obj.on === 'function' &&
        typeof obj.once === 'function' &&
        typeof obj.removeAllListeners === 'function';
}
class BLEDevice {
    constructor(name, advertisement, connection) {
        this.name = name;
        this.advertisement = advertisement;
        this.connection = connection;
        this.connected = false;
        this.pendingReads = new Map();
        this.emitter = null;
        this.connect = async () => {
            const { addressType } = this.advertisement;
            await this.connection.connectBluetoothDeviceService(this.address, addressType);
            this.connected = true;
        };
        this.disconnect = async () => {
            this.cleanup();
            this.connected = false;
            await this.connection.disconnectBluetoothDeviceService(this.address);
        };
        this.writeCharacteristic = async (handle, bytes, response = true) => {
            await this.connection.writeBluetoothGATTCharacteristicService(this.address, handle, bytes, response);
        };
        this.getCharacteristic = async (serviceUuid, characteristicUuid) => {
            const services = await this.getServices();
            const service = services.find(s => s.uuid === serviceUuid);
            if (!service) {
                (0, logger_1.logInfo)('[BLE] Could not find expected service for device:', serviceUuid, this.name);
                return undefined;
            }
            const characteristic = service.characteristicsList.find(c => c.uuid === characteristicUuid);
            if (!characteristic) {
                (0, logger_1.logInfo)('[BLE] Could not find expected characteristic for device:', characteristicUuid, this.name);
                return undefined;
            }
            return characteristic;
        };
        this.subscribeToCharacteristic = async (handle, notify) => {
            this.connection.on('message.BluetoothGATTNotifyDataResponse', (message) => {
                if (message.address != this.address || message.handle != handle)
                    return;
                notify(new Uint8Array([...Buffer.from(message.data, 'base64')]));
            });
            await this.connection.notifyBluetoothGATTCharacteristicService(this.address, handle);
        };
        this.getServices = async () => {
            const { servicesList } = await this.connection.listBluetoothGATTServicesService(this.address);
            return servicesList;
        };
        this.getDeviceInfo = async () => {
            const services = await this.getServices();
            const service = services.find(s => s.uuid === '0000180a-0000-1000-8000-00805f9b34fb');
            if (!service)
                return undefined;
            const deviceInfo = {};
            const setters = {
                '00002a24-0000-1000-8000-00805f9b34fb': (value) => (deviceInfo.modelNumber = value),
                '00002a25-0000-1000-8000-00805f9b34fb': (value) => (deviceInfo.serialNumber = value),
                '00002a26-0000-1000-8000-00805f9b34fb': (value) => (deviceInfo.firmwareRevision = value),
                '00002a27-0000-1000-8000-00805f9b34fb': (value) => (deviceInfo.hardwareRevision = value),
                '00002a28-0000-1000-8000-00805f9b34fb': (value) => (deviceInfo.softwareRevision = value),
                '00002a29-0000-1000-8000-00805f9b34fb': (value) => (deviceInfo.manufacturerName = value),
            };
            for (const { uuid, handle } of service.characteristicsList) {
                const setter = setters[uuid];
                if (!setter)
                    continue;
                try {
                    const value = await this.readCharacteristic(handle);
                    setter(Buffer.from(value).toString());
                }
                catch { }
            }
            return deviceInfo;
        };
        this.readCharacteristic = async (handle) => {
            // Clear any existing timeout for this handle
            if (this.pendingReads.has(handle)) {
                clearTimeout(this.pendingReads.get(handle));
                this.pendingReads.delete(handle);
            }
            return new Promise((resolve, reject) => {
                // Set up timeout to prevent hanging
                const timeoutId = setTimeout(() => {
                    // Clean up the listener when timeout occurs
                    if (this.emitter) {
                        this.emitter.removeAllListeners('message.BluetoothGATTReadResponse');
                    }
                    this.pendingReads.delete(handle);
                    reject(new Error(`Timeout reading characteristic handle ${handle}`));
                }, READ_CHARACTERISTIC_TIMEOUT);
                this.pendingReads.set(handle, timeoutId);
                // Set up one-time listener for this read request
                if (this.emitter) {
                    this.emitter.once('message.BluetoothGATTReadResponse', (response) => {
                        // Only handle responses for this specific read request
                        if (response.address === this.address && response.handle === handle) {
                            clearTimeout(timeoutId);
                            this.pendingReads.delete(handle);
                            resolve(new Uint8Array([...Buffer.from(response.data, 'base64')]));
                        }
                    });
                }
                // Send the read request
                this.connection.readBluetoothGATTCharacteristicService(this.address, handle)
                    .catch(error => {
                    clearTimeout(timeoutId);
                    this.pendingReads.delete(handle);
                    if (this.emitter) {
                        this.emitter.removeAllListeners('message.BluetoothGATTReadResponse');
                    }
                    reject(error);
                });
            });
        };
        // Add cleanup method
        this.cleanup = () => {
            // Clear all pending read timeouts
            for (const [handle, timeoutId] of this.pendingReads.entries()) {
                clearTimeout(timeoutId);
                if (this.emitter) {
                    this.emitter.removeAllListeners('message.BluetoothGATTReadResponse');
                }
            }
            this.pendingReads.clear();
        };
        this.mac = this.address.toString(16).padStart(12, '0');
        // Check if connection is an EventEmitter
        if (isEventEmitter(connection)) {
            this.emitter = connection;
        }
        else {
            (0, logger_1.logWarn)('[BLE] Connection does not implement EventEmitter interface');
        }
    }
    get address() {
        return this.advertisement.address;
    }
}
exports.BLEDevice = BLEDevice;
//# sourceMappingURL=BLEDevice.js.map