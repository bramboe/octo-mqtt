"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BLEScanner = void 0;
const logger_1 = require("../Utils/logger");
const options_1 = require("../Utils/options");
class BLEScanner {
    constructor(esphomeConnection) {
        this.isScanning = false;
        this.scanStartTime = null;
        this.scanTimeout = null;
        this.SCAN_DURATION_MS = 30000; // 30 seconds scan duration
        this.discoveredDevices = new Map();
        this.esphomeConnection = esphomeConnection;
    }
    async startScan() {
        if (this.isScanning) {
            (0, logger_1.logWarn)('[BLEScanner] Scan already in progress');
            throw new Error('Scan already in progress');
        }
        try {
            // Clean up any previous scan state (including clearing devices for fresh start)
            this.cleanupScanState(true);
            // Initialize scan state
            this.isScanning = true;
            this.scanStartTime = Date.now();
            (0, logger_1.logInfo)('[BLEScanner] Starting BLE scan...');
            // Set up scan timeout
            this.scanTimeout = setTimeout(() => {
                (0, logger_1.logInfo)('[BLEScanner] Scan timeout reached');
                // Don't clear devices when timeout is reached - keep them for UI
                this.cleanupScanState(false);
            }, this.SCAN_DURATION_MS);
            // Start the actual scan
            await this.esphomeConnection.startBleScan(this.SCAN_DURATION_MS, (device) => {
                // Accept all devices that the ESPConnection considers RC2 devices
                // The filtering is now done in ESPConnection.ts with broader criteria
                this.discoveredDevices.set(device.address, device);
                (0, logger_1.logInfo)(`[BLEScanner] Discovered device: ${device.name || 'Unknown'} (${device.address})`);
            });
        }
        catch (error) {
            (0, logger_1.logError)('[BLEScanner] Error starting scan:', error);
            this.cleanupScanState(false);
            throw error;
        }
    }
    async stopScan() {
        if (!this.isScanning) {
            (0, logger_1.logWarn)('[BLEScanner] No scan in progress');
            return;
        }
        try {
            if (this.esphomeConnection.stopBleScan) {
                await this.esphomeConnection.stopBleScan();
            }
            // Don't clear devices when manually stopped - keep them for UI
            this.cleanupScanState(false);
            (0, logger_1.logInfo)('[BLEScanner] Scan stopped successfully');
        }
        catch (error) {
            (0, logger_1.logError)('[BLEScanner] Error stopping scan:', error);
            this.cleanupScanState(false);
            throw error;
        }
    }
    getScanStatus() {
        const timeRemaining = this.scanStartTime
            ? Math.max(0, this.SCAN_DURATION_MS - (Date.now() - this.scanStartTime))
            : 0;
        // Get configured devices from the addon configuration
        const config = (0, options_1.getRootOptions)();
        const configuredDevices = config.octoDevices || [];
        (0, logger_1.logInfo)(`[BLEScanner DEBUG] getScanStatus called. Found ${configuredDevices.length} configured devices:`);
        configuredDevices.forEach((device, index) => {
            (0, logger_1.logInfo)(`[BLEScanner DEBUG] Configured device ${index}: name="${device.name}", friendlyName="${device.friendlyName}"`);
        });
        // Check each discovered device against configured devices
        const devicesWithStatus = Array.from(this.discoveredDevices.values())
            .map(device => {
            (0, logger_1.logInfo)(`[BLEScanner DEBUG] Checking discovered device: ${device.name || 'Unknown'} (${device.address})`);
            // Check if this device is already configured by matching:
            // Priority 1: MAC address matching (most reliable)
            // Priority 2: Device name matching (only if it's a meaningful name, not generic)
            const isConfigured = configuredDevices.some((configuredDevice) => {
                // First check: MAC address as device name (new format)
                const macAsDeviceName = device.address && configuredDevice.name &&
                    device.address.toLowerCase() === configuredDevice.name.toLowerCase();
                // Second check: MAC address pattern matching
                const configuredNameAsAddress = configuredDevice.name &&
                    /^[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}$/i.test(configuredDevice.name) &&
                    device.address && configuredDevice.name.toLowerCase() === device.address.toLowerCase();
                // Third check: Device name matching (but avoid generic names)
                const nameMatch = device.name && configuredDevice.name && device.name !== 'Unknown Device' &&
                    configuredDevice.name !== 'Unknown Device' && device.name === configuredDevice.name;
                (0, logger_1.logInfo)(`[BLEScanner DEBUG]   Comparing with configured "${configuredDevice.name}":`);
                (0, logger_1.logInfo)(`[BLEScanner DEBUG]     macAsDeviceName: ${macAsDeviceName}`);
                (0, logger_1.logInfo)(`[BLEScanner DEBUG]     configuredNameAsAddress: ${configuredNameAsAddress}`);
                (0, logger_1.logInfo)(`[BLEScanner DEBUG]     nameMatch: ${nameMatch}`);
                const match = nameMatch || macAsDeviceName || configuredNameAsAddress;
                (0, logger_1.logInfo)(`[BLEScanner DEBUG]     Final match result: ${match}`);
                return match;
            });
            // Find the configured device name if it exists
            const configuredDevice = configuredDevices.find((configuredDevice) => {
                const macAsDeviceName = device.address && configuredDevice.name &&
                    device.address.toLowerCase() === configuredDevice.name.toLowerCase();
                const configuredNameAsAddress = configuredDevice.name &&
                    /^[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}$/i.test(configuredDevice.name) &&
                    device.address && configuredDevice.name.toLowerCase() === device.address.toLowerCase();
                const nameMatch = device.name && configuredDevice.name && device.name !== 'Unknown Device' &&
                    configuredDevice.name !== 'Unknown Device' && device.name === configuredDevice.name;
                return nameMatch || macAsDeviceName || configuredNameAsAddress;
            });
            (0, logger_1.logInfo)(`[BLEScanner DEBUG] Device ${device.name} (${device.address}) - isConfigured: ${isConfigured}, configuredName: ${configuredDevice?.friendlyName || configuredDevice?.name || 'N/A'}`);
            return {
                ...device,
                isConfigured,
                configuredName: configuredDevice?.friendlyName || configuredDevice?.name
            };
        });
        return {
            isScanning: this.isScanning,
            scanTimeRemaining: timeRemaining,
            discoveredDevices: this.discoveredDevices.size,
            devices: devicesWithStatus
        };
    }
    getDevice(address) {
        return this.discoveredDevices.get(address);
    }
    cleanupScanState(clearDevices = true) {
        this.isScanning = false;
        this.scanStartTime = null;
        if (this.scanTimeout) {
            clearTimeout(this.scanTimeout);
            this.scanTimeout = null;
        }
        // Only clear devices when explicitly requested (e.g., starting new scan)
        if (clearDevices) {
            this.discoveredDevices.clear();
        }
        // Clean up any remaining listeners
        if (this.esphomeConnection && typeof this.esphomeConnection === 'object') {
            if (typeof this.esphomeConnection.eventNames === 'function' &&
                typeof this.esphomeConnection.removeAllListeners === 'function') {
                const listeners = this.esphomeConnection.eventNames();
                listeners.forEach(event => {
                    if (event.toString().includes('BluetoothGATTReadResponse')) {
                        this.esphomeConnection?.removeAllListeners(event);
                    }
                });
            }
        }
    }
}
exports.BLEScanner = BLEScanner;
//# sourceMappingURL=BLEScanner.js.map