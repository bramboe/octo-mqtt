"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BLEController = void 0;
const events_1 = require("events");
const logger_1 = require("../Utils/logger");
class BLEController extends events_1.EventEmitter {
    constructor(deviceData, bleDevice, handle, buildCommand, handles, pin) {
        super();
        this.deviceData = deviceData;
        this.bleDevice = bleDevice;
        this.handle = handle;
        this.buildCommand = buildCommand;
        this.handles = handles;
        this.cache = {};
        this.commandQueue = [];
        this.processing = false;
        this.timeout = null;
        this.pollingInterval = null;
        this.keepAliveInterval = null;
        this.lastValue = '';
        this.pin = '0000'; // Default PIN
        this.isScanning = false;
        // Store PIN if provided
        if (pin && pin.length === 4) {
            this.pin = pin;
        }
        // Start polling for characteristic changes if feedback handle is provided
        this.startPolling();
        // Start keep-alive mechanism
        this.startKeepAlive();
    }
    /**
     * Set PIN for authentication and keep-alive messages
     */
    setPin(pin) {
        if (pin && pin.length === 4) {
            this.pin = pin;
            (0, logger_1.logInfo)('[BLE] PIN set successfully');
        }
        else {
            (0, logger_1.logWarn)('[BLE] Invalid PIN format. PIN must be 4 digits. Using default.');
        }
    }
    /**
     * Start the keep-alive interval to maintain connection
     */
    startKeepAlive() {
        // Clear any existing keep-alive interval
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
        }
        (0, logger_1.logInfo)('[BLE] Starting keep-alive mechanism');
        // Send keep-alive every 30 seconds
        this.keepAliveInterval = setInterval(async () => {
            try {
                if (!this.bleDevice.connected) {
                    (0, logger_1.logWarn)('[BLE] Device not connected, skipping keep-alive');
                    return;
                }
                // Send PIN-based keep-alive command (0x20, 0x43)
                const pinDigits = this.pin.split('').map(digit => parseInt(digit));
                await this.writeCommand({
                    command: [0x20, 0x43],
                    data: pinDigits
                });
                (0, logger_1.logInfo)('[BLE] Keep-alive sent successfully');
            }
            catch (error) {
                (0, logger_1.logError)('[BLE] Error sending keep-alive:', error);
            }
        }, 30000); // 30 seconds
    }
    startPolling() {
        if (!this.handles?.feedback) {
            (0, logger_1.logWarn)('[BLE] No feedback handle provided, polling not started');
            return;
        }
        (0, logger_1.logInfo)('[BLE] Starting polling for characteristic changes');
        // Store feedback handle in local variable to avoid undefined error
        const feedbackHandle = this.handles.feedback;
        // Poll every 100ms
        this.pollingInterval = setInterval(async () => {
            try {
                if (typeof this.bleDevice.readCharacteristic !== 'function') {
                    (0, logger_1.logError)('[BLE] readCharacteristic is not a function, polling not possible');
                    this.stopPolling();
                    return;
                }
                const value = await this.bleDevice.readCharacteristic(feedbackHandle);
                if (!value)
                    return;
                // Only emit if the value has changed (to avoid spamming)
                const valueString = Array.from(value).join(',');
                if (valueString !== this.lastValue) {
                    this.lastValue = valueString;
                    this.emit('feedback', value);
                }
            }
            catch (error) {
                // Don't log errors to avoid filling up logs, just silently continue
            }
        }, 100); // Poll every 100ms
    }
    stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
    }
    /**
     * Stop all intervals and timers when the controller is no longer needed
     */
    dispose() {
        this.stopPolling();
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
        }
        if (this.timeout) {
            clearTimeout(this.timeout);
            this.timeout = null;
        }
        this.stopScan(); // Ensure scanning is stopped on dispose
    }
    async writeCommand(command) {
        return new Promise((resolve, reject) => {
            this.commandQueue.push({
                command,
                resolve,
                reject,
            });
            this.processQueue();
        });
    }
    async writeCommands(commands, count = 1) {
        for (let i = 0; i < count; i++) {
            for (const command of commands) {
                await this.writeCommand(command);
            }
        }
    }
    /**
     * Send a stop command to immediately stop all motors
     */
    async stopMotors() {
        // Cancel pending commands first
        await this.cancelCommands();
        // Send stop command (0x02, 0x73)
        // Ensure this doesn't interfere with scan commands if they use the same characteristic
        try {
            await this.writeCommand([0x02, 0x73]);
            // Send twice for reliability, as seen in ESPHome implementation
            await this.writeCommand([0x02, 0x73]);
            (0, logger_1.logInfo)('[BLE] Stop command sent successfully');
        }
        catch (error) {
            (0, logger_1.logError)('[BLE] Error sending stop command:', error);
        }
        // Process next command after a short delay
        this.timeout = setTimeout(() => {
            this.timeout = null;
            if (this.commandQueue.length > 0) {
                this.processQueue();
            }
        }, 150); // Add a small delay between commands
    }
    async cancelCommands() {
        if (this.timeout) {
            clearTimeout(this.timeout);
            this.timeout = null;
        }
        // Clear the queue
        const queue = [...this.commandQueue];
        this.commandQueue = [];
        this.processing = false;
        // Reject all pending commands
        for (const item of queue) {
            item.reject(new Error('Commands canceled'));
        }
        return Promise.resolve();
    }
    async processQueue() {
        if (this.processing || this.commandQueue.length === 0) {
            return;
        }
        this.processing = true;
        try {
            const item = this.commandQueue.shift();
            if (!item) {
                this.processing = false;
                return;
            }
            (0, logger_1.logInfo)(`[BLE] Processing command: ${JSON.stringify(item.command)}`);
            const bytes = this.buildCommand(item.command);
            try {
                if (typeof this.bleDevice.writeCharacteristic !== 'function') {
                    throw new Error('writeCharacteristic is not a function');
                }
                await this.bleDevice.writeCharacteristic(this.handle, new Uint8Array(bytes));
                item.resolve();
            }
            catch (error) {
                (0, logger_1.logError)('[BLE] Error writing characteristic:', error);
                item.reject(error instanceof Error ? error : new Error(String(error)));
            }
        }
        catch (error) {
            (0, logger_1.logError)('[BLE] Error in processQueue:', error);
        }
        finally {
            this.processing = false;
            // Process next command after a short delay
            this.timeout = setTimeout(() => {
                this.timeout = null;
                if (this.commandQueue.length > 0) {
                    this.processQueue();
                }
            }, 150); // Add a small delay between commands
        }
    }
    /**
     * Start BLE scanning for devices.
     * Emits 'deviceDiscovered' for each unique device found.
     * Emits 'scanStatus' with { scanning: boolean, error?: string }.
     */
    async startScan() {
        if (this.isScanning) {
            (0, logger_1.logWarn)('[BLE] Scan already in progress.');
            return;
        }
        if (!this.bleDevice || typeof this.bleDevice.subscribeBluetoothLEAdvertisementPackets !== 'function') {
            (0, logger_1.logError)('[BLE] subscribeBluetoothLEAdvertisementPackets is not available on bleDevice.');
            this.emit('scanStatus', { scanning: false, error: 'Scan functionality not supported by BLE device object.' });
            return;
        }
        (0, logger_1.logInfo)('[BLE] Starting BLE scan...');
        this.isScanning = true;
        this.emit('scanStatus', { scanning: true });
        try {
            // The callback for subscribeBluetoothLEAdvertisementPackets receives advertisement data
            // We need to map this data to our BLEDeviceAdvertisement interface
            await this.bleDevice.subscribeBluetoothLEAdvertisementPackets((data) => {
                // Assuming data has properties like name, mac, rssi, service_uuids
                // Adjust based on the actual structure provided by ESPHome
                const discoveredDevice = {
                    name: data.name || 'Unknown Device',
                    address: data.mac, // ESPHome typically uses 'mac' for address
                    rssi: data.rssi,
                    service_uuids: data.service_uuids || [],
                };
                this.emit('deviceDiscovered', discoveredDevice);
            });
        }
        catch (error) {
            (0, logger_1.logError)('[BLE] Error starting scan subscription:', error);
            this.isScanning = false;
            this.emit('scanStatus', { scanning: false, error: error instanceof Error ? error.message : String(error) });
        }
    }
    /**
     * Stop BLE scanning.
     */
    async stopScan() {
        if (!this.isScanning) {
            // logInfo('[BLE] Scan is not currently active.'); // Can be noisy
            return;
        }
        if (!this.bleDevice || typeof this.bleDevice.unsubscribeBluetoothLEAdvertisementPackets !== 'function') {
            (0, logger_1.logError)('[BLE] unsubscribeBluetoothLEAdvertisementPackets is not available on bleDevice.');
            // Even if we can't unsubscribe, update our internal state
            this.isScanning = false;
            this.emit('scanStatus', { scanning: false, error: 'Could not formally stop scan due to missing unsubscribe function.' });
            return;
        }
        (0, logger_1.logInfo)('[BLE] Stopping BLE scan...');
        try {
            await this.bleDevice.unsubscribeBluetoothLEAdvertisementPackets();
            this.isScanning = false;
            this.emit('scanStatus', { scanning: false });
        }
        catch (error) {
            (0, logger_1.logError)('[BLE] Error stopping scan subscription:', error);
            // Still update our internal state even if unsubscribe fails
            this.isScanning = false;
            this.emit('scanStatus', { scanning: false, error: error instanceof Error ? error.message : String(error) });
        }
    }
    on(event, listener) {
        return super.on(event, listener);
    }
    off(event, listener) {
        return super.off(event, listener);
    }
}
exports.BLEController = BLEController;
//# sourceMappingURL=BLEController.js.map