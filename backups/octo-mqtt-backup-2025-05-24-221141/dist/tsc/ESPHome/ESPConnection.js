"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ESPConnection = void 0;
const esphome_native_api_1 = require("@2colors/esphome-native-api");
const deferred_1 = require("../Utils/deferred");
const logger_1 = require("../Utils/logger");
const connect_1 = require("./connect");
const BLEDevice_1 = require("./types/BLEDevice");
const events_1 = require("events");
class ESPConnection {
    constructor(connections) {
        this.connections = connections;
        this.advertisementPacketListener = null;
        this.isProxyScanning = false;
        this.scanTimeoutId = null;
        this.activeDevices = new Set();
        // Set higher maxListeners on all connections
        connections.forEach(connection => {
            if (connection instanceof events_1.EventEmitter) {
                connection.setMaxListeners(100); // Set a higher limit for all connections
            }
        });
    }
    async reconnect() {
        this.disconnect();
        (0, logger_1.logInfo)('[ESPHome] Reconnecting...');
        this.connections = await Promise.all(this.connections.map((connection) => (0, connect_1.connect)(new esphome_native_api_1.Connection({
            host: connection.host,
            port: connection.port
        }))));
    }
    disconnect() {
        this.cleanupScan().catch(error => {
            (0, logger_1.logError)('[ESPHome] Error during disconnect cleanup:', error);
        });
    }
    async getBLEDevices(deviceNames) {
        (0, logger_1.logInfo)(`[ESPHome] Searching for device(s): ${deviceNames.join(', ')}`);
        deviceNames = deviceNames.map((name) => name.toLowerCase());
        const bleDevices = [];
        const complete = new deferred_1.Deferred();
        await this.discoverBLEDevices((bleDevice) => {
            const { name, mac } = bleDevice;
            let index = deviceNames.indexOf(mac);
            if (index === -1)
                index = deviceNames.indexOf(name.toLowerCase());
            if (index === -1)
                return;
            deviceNames.splice(index, 1);
            (0, logger_1.logInfo)(`[ESPHome] Found device: ${name} (${mac})`);
            bleDevices.push(bleDevice);
            this.activeDevices.add(bleDevice);
            if (deviceNames.length)
                return;
            complete.resolve();
        }, complete);
        if (deviceNames.length) {
            (0, logger_1.logWarn)(`[ESPHome] Could not find address for device(s): ${deviceNames.join(', ')}`);
        }
        return bleDevices;
    }
    async discoverBLEDevices(onNewDeviceFound, complete) {
        const seenAddresses = [];
        const listenerBuilder = (connection) => ({
            connection,
            listener: (advertisement) => {
                let { name, address } = advertisement;
                if (seenAddresses.includes(address) || !name)
                    return;
                seenAddresses.push(address);
                onNewDeviceFound(new BLEDevice_1.BLEDevice(name, advertisement, connection));
            },
        });
        const listeners = this.connections.map(listenerBuilder);
        for (const { connection, listener } of listeners) {
            connection.on('message.BluetoothLEAdvertisementResponse', listener);
            connection.subscribeBluetoothAdvertisementService();
        }
        await complete;
        for (const { connection, listener } of listeners) {
            connection.off('message.BluetoothLEAdvertisementResponse', listener);
        }
    }
    convertAddressToMac(address) {
        if (!address) {
            (0, logger_1.logInfo)(`[ESPHome DEBUG] convertAddressToMac: address is falsy: ${address}`);
            return '';
        }
        // Convert numeric address to MAC address format
        const hex = address.toString(16).padStart(12, '0');
        const mac = hex.match(/.{2}/g)?.join(':') || '';
        (0, logger_1.logInfo)(`[ESPHome DEBUG] convertAddressToMac: ${address} -> ${hex} -> ${mac}`);
        return mac;
    }
    async startBleScan(durationMs, onDeviceDiscoveredDuringScan) {
        if (this.connections.length === 0) {
            (0, logger_1.logWarn)('[ESPHome] No active proxy connections to start scan.');
            throw new Error('No active proxy connections.');
        }
        const primaryConnection = this.connections[0];
        if (this.isProxyScanning) {
            (0, logger_1.logWarn)('[ESPHome] Scan already in progress. Stop it first or wait for it to complete.');
            throw new Error('Scan already in progress.');
        }
        // Clean up any existing scan state
        await this.cleanupScan();
        (0, logger_1.logInfo)(`[ESPHome] Starting BLE scan for ${durationMs}ms via primary proxy...`);
        (0, logger_1.logInfo)('[ESPHome] Looking specifically for devices named "RC2"...');
        const discoveredDevicesDuringScan = new Map();
        this.advertisementPacketListener = (data) => {
            // Log raw advertisement data for debugging
            (0, logger_1.logInfo)('[ESPHome DEBUG] Raw advertisement data:', JSON.stringify(data));
            // Debug the address conversion process
            const rawAddress = data.address;
            const macFromData = data.mac;
            const convertedMac = rawAddress ? this.convertAddressToMac(rawAddress) : '';
            const finalAddress = macFromData || convertedMac;
            (0, logger_1.logInfo)(`[ESPHome DEBUG] Address processing: raw=${rawAddress}, mac=${macFromData}, converted=${convertedMac}, final=${finalAddress}`);
            const isRC2Device = (
            // Primary check: device name must explicitly contain "RC2"
            (data.name && data.name.toUpperCase().includes('RC2')) ||
                // Secondary check: specific MAC address patterns for known RC2 beds
                (finalAddress && (finalAddress.toLowerCase().startsWith('c3:e7:63') ||
                    finalAddress.toLowerCase().startsWith('f6:21:dd'))));
            // Log all devices for debugging, but only process RC2 devices
            (0, logger_1.logInfo)(`[ESPHome DEBUG] Processing device: ${data.name || 'Unknown'} (${finalAddress}) - IsRC2: ${isRC2Device}`);
            const discoveredDevice = {
                name: data.name || (isRC2Device ? 'RC2' : 'Unknown Device'),
                address: finalAddress,
                rssi: data.rssi,
                service_uuids: data.serviceUuids || data.service_uuids || [],
            };
            if (isRC2Device) {
                if (!discoveredDevicesDuringScan.has(discoveredDevice.address)) {
                    (0, logger_1.logInfo)('[ESPHome SCAN] Found RC2 device!');
                    (0, logger_1.logInfo)(`[ESPHome SCAN] Name: ${discoveredDevice.name}`);
                    (0, logger_1.logInfo)(`[ESPHome SCAN] MAC Address: ${discoveredDevice.address}`);
                    (0, logger_1.logInfo)(`[ESPHome SCAN] RSSI: ${discoveredDevice.rssi}`);
                    (0, logger_1.logInfo)(`[ESPHome SCAN] Service UUIDs: ${discoveredDevice.service_uuids.join(', ') || 'None'}`);
                    discoveredDevicesDuringScan.set(discoveredDevice.address, discoveredDevice);
                }
                onDeviceDiscoveredDuringScan(discoveredDevice);
            }
        };
        try {
            primaryConnection.on('message.BluetoothLEAdvertisementResponse', this.advertisementPacketListener);
            await primaryConnection.subscribeBluetoothAdvertisementService();
            this.isProxyScanning = true;
            (0, logger_1.logInfo)('[ESPHome] Scan started successfully. Waiting for RC2 devices...');
            return new Promise((resolve, reject) => {
                this.scanTimeoutId = setTimeout(async () => {
                    const devices = Array.from(discoveredDevicesDuringScan.values());
                    (0, logger_1.logInfo)(`[ESPHome] Scan completed. Found ${devices.length} RC2 device(s).`);
                    await this.stopBleScan();
                    resolve(devices);
                }, durationMs);
            });
        }
        catch (error) {
            (0, logger_1.logError)('[ESPHome] Error during BLE scan:', error);
            await this.cleanupScan();
            throw error;
        }
    }
    async stopBleScan() {
        (0, logger_1.logInfo)('[ESPHome] Scan stopped prematurely via stopBleScan call.');
        await this.cleanupScan();
    }
    async cleanupScan() {
        (0, logger_1.logInfo)('[ESPHome] Attempting to stop BLE scan via primary proxy...');
        if (this.scanTimeoutId) {
            clearTimeout(this.scanTimeoutId);
            this.scanTimeoutId = null;
        }
        if (this.advertisementPacketListener && this.connections[0]) {
            this.connections[0].off('message.BluetoothLEAdvertisementResponse', this.advertisementPacketListener);
            this.advertisementPacketListener = null;
        }
        this.isProxyScanning = false;
        // Clean up any active devices
        for (const device of this.activeDevices) {
            try {
                await device.disconnect();
            }
            catch (error) {
                (0, logger_1.logError)('[ESPHome] Error disconnecting device during cleanup:', error);
            }
        }
        this.activeDevices.clear();
        (0, logger_1.logInfo)('[ESPHome] BLE scan stopped.');
    }
}
exports.ESPConnection = ESPConnection;
//# sourceMappingURL=ESPConnection.js.map