"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RC2DeviceManager = void 0;
const events_1 = require("events");
const RC2Device_1 = require("./BLE/RC2Device");
const logger_1 = require("./Utils/logger");
const options_1 = require("./Utils/options");
class RC2DeviceManager extends events_1.EventEmitter {
    constructor(mqttConnection, esphomeConnection) {
        super();
        this.devices = new Map();
        this.mqttTopicPrefix = 'homeassistant/cover';
        this.statusUpdateInterval = null;
        this.mqttConnection = mqttConnection;
        this.esphomeConnection = esphomeConnection;
        // Only set up ESPHome event listeners if connection exists
        if (this.esphomeConnection) {
            (0, logger_1.logInfo)('[RC2DeviceManager] Initialized with ESPHome connection');
            this.startStatusUpdates();
        }
        else {
            (0, logger_1.logWarn)('[RC2DeviceManager] Initialized without ESPHome connection - BLE functionality will be limited');
        }
    }
    /**
     * Initialize and connect to all configured RC2 devices
     */
    async initializeDevices() {
        if (!this.esphomeConnection) {
            (0, logger_1.logWarn)('[RC2DeviceManager] Cannot initialize devices - no ESPHome connection available');
            return;
        }
        const config = (0, options_1.getRootOptions)();
        const configuredDevices = config.octoDevices || [];
        (0, logger_1.logInfo)(`[RC2DeviceManager] Initializing ${configuredDevices.length} configured devices`);
        for (const deviceConfig of configuredDevices) {
            try {
                await this.addDevice({
                    address: deviceConfig.name, // MAC address stored as name
                    pin: deviceConfig.pin || '0000',
                    friendlyName: deviceConfig.friendlyName || `RC2 Bed`,
                    headCalibrationSeconds: 30.0,
                    feetCalibrationSeconds: 30.0
                });
            }
            catch (error) {
                (0, logger_1.logError)(`[RC2DeviceManager] Failed to add device ${deviceConfig.friendlyName}:`, error);
                // Continue with other devices
            }
        }
        (0, logger_1.logInfo)(`[RC2DeviceManager] Device initialization completed. ${this.devices.size} devices added.`);
    }
    /**
     * Add a new RC2 device
     */
    async addDevice(config) {
        if (!this.esphomeConnection) {
            throw new Error('Cannot add device - no ESPHome connection available');
        }
        const deviceId = this.getDeviceId(config.address);
        if (this.devices.has(deviceId)) {
            (0, logger_1.logWarn)(`[RC2DeviceManager] Device ${deviceId} already exists`);
            return;
        }
        (0, logger_1.logInfo)(`[RC2DeviceManager] Adding device: ${config.friendlyName} (${config.address})`);
        const device = new RC2Device_1.RC2Device(config, this.esphomeConnection);
        // Set up device event handlers
        this.setupDeviceEventHandlers(device, deviceId, config);
        // Store device
        this.devices.set(deviceId, device);
        // Set up MQTT discovery for Home Assistant
        await this.setupMQTTDiscovery(deviceId, config);
        // Try to connect to the device
        try {
            await device.connect();
            (0, logger_1.logInfo)(`[RC2DeviceManager] Successfully connected to ${config.friendlyName}`);
        }
        catch (error) {
            (0, logger_1.logError)(`[RC2DeviceManager] Failed to connect to ${config.friendlyName}:`, error);
            // Don't remove the device - it might connect later
        }
        this.emit('deviceAdded', deviceId, device.getStatus());
    }
    /**
     * Get all device statuses
     */
    getAllDeviceStatuses() {
        const devices = {};
        let connectedCount = 0;
        for (const [deviceId, device] of this.devices) {
            const status = device.getStatus();
            devices[deviceId] = status;
            if (status.connected) {
                connectedCount++;
            }
        }
        return {
            totalDevices: this.devices.size,
            connectedDevices: connectedCount,
            devices
        };
    }
    setupDeviceEventHandlers(device, deviceId, config) {
        // Handle device status updates
        device.on('statusUpdate', (status) => {
            this.emit('deviceStatusUpdate', deviceId, status);
            this.publishDeviceStatus(deviceId, status);
        });
        // Handle position updates
        device.on('positionUpdate', (position) => {
            this.emit('devicePositionUpdate', deviceId, position);
            this.publishDevicePosition(deviceId, position);
        });
        // Handle light state updates
        device.on('lightStateUpdate', (state) => {
            this.emit('deviceLightStateUpdate', deviceId, state);
            this.publishDeviceLightState(deviceId, state);
        });
        // Handle connection events
        device.on('connected', () => {
            (0, logger_1.logInfo)(`[RC2DeviceManager] Device ${config.friendlyName} connected`);
            this.emit('deviceConnected', deviceId);
        });
        device.on('disconnected', () => {
            (0, logger_1.logInfo)(`[RC2DeviceManager] Device ${config.friendlyName} disconnected`);
            this.emit('deviceDisconnected', deviceId);
        });
        device.on('error', (error) => {
            (0, logger_1.logError)(`[RC2DeviceManager] Device ${config.friendlyName} error:`, error);
            this.emit('deviceError', deviceId, error);
        });
    }
    async setupMQTTDiscovery(deviceId, config) {
        // Simplified MQTT setup for now
        (0, logger_1.logInfo)(`[RC2DeviceManager] Setting up MQTT discovery for ${deviceId}`);
    }
    async publishDeviceStatus(deviceId, status) {
        // Simplified status publishing for now
        // logInfo(`[RC2DeviceManager] Publishing status for ${deviceId}:`, status);
    }
    async publishDevicePosition(deviceId, position) {
        // Simplified position publishing for now
        // logInfo(`[RC2DeviceManager] Publishing position for ${deviceId}:`, position);
    }
    async publishDeviceLightState(deviceId, state) {
        // Simplified light state publishing for now
        // logInfo(`[RC2DeviceManager] Publishing light state for ${deviceId}:`, state);
    }
    startStatusUpdates() {
        if (this.statusUpdateInterval) {
            clearInterval(this.statusUpdateInterval);
        }
        this.statusUpdateInterval = setInterval(() => {
            // Emit status updates for all devices
            for (const [deviceId, device] of this.devices) {
                const status = device.getStatus();
                this.emit('deviceStatusUpdate', deviceId, status);
            }
        }, 5000); // Every 5 seconds
    }
    getDeviceId(address) {
        // Convert MAC address to a clean device ID
        return address.replace(/[:-]/g, '').toLowerCase();
    }
    dispose() {
        if (this.statusUpdateInterval) {
            clearInterval(this.statusUpdateInterval);
            this.statusUpdateInterval = null;
        }
        // Dispose all devices
        for (const device of this.devices.values()) {
            device.dispose();
        }
        this.devices.clear();
        (0, logger_1.logInfo)('[RC2DeviceManager] Disposed');
    }
}
exports.RC2DeviceManager = RC2DeviceManager;
//# sourceMappingURL=RC2DeviceManager.js.map