"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RC2DeviceManager = void 0;
const events_1 = require("events");
const RC2Device_1 = require("./RC2Device");
const logger_1 = require("../Utils/logger");
const options_1 = require("../Utils/options");
class RC2DeviceManager extends events_1.EventEmitter {
    constructor(mqttConnection, esphomeConnection) {
        super();
        this.devices = new Map();
        this.mqttTopicPrefix = 'homeassistant/cover';
        this.statusUpdateInterval = null;
        this.mqttConnection = mqttConnection;
        this.esphomeConnection = esphomeConnection;
        (0, logger_1.logInfo)('[RC2DeviceManager] Initialized');
        this.startStatusUpdates();
    }
    /**
     * Initialize and connect to all configured RC2 devices
     */
    async initializeDevices() {
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
     * Remove a device
     */
    async removeDevice(deviceId) {
        const device = this.devices.get(deviceId);
        if (!device) {
            (0, logger_1.logWarn)(`[RC2DeviceManager] Device ${deviceId} not found`);
            return;
        }
        (0, logger_1.logInfo)(`[RC2DeviceManager] Removing device: ${deviceId}`);
        try {
            await device.disconnect();
            device.dispose();
            this.devices.delete(deviceId);
            // Remove MQTT discovery
            await this.removeMQTTDiscovery(deviceId);
            this.emit('deviceRemoved', deviceId);
            (0, logger_1.logInfo)(`[RC2DeviceManager] Device ${deviceId} removed successfully`);
        }
        catch (error) {
            (0, logger_1.logError)(`[RC2DeviceManager] Error removing device ${deviceId}:`, error);
        }
    }
    /**
     * Get device by ID
     */
    getDevice(deviceId) {
        return this.devices.get(deviceId);
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
    /**
     * Set position for a specific device
     */
    async setDevicePosition(deviceId, head, feet) {
        const device = this.devices.get(deviceId);
        if (!device) {
            throw new Error(`Device ${deviceId} not found`);
        }
        await device.setPosition(head, feet);
    }
    /**
     * Set light state for a specific device
     */
    async setDeviceLight(deviceId, state) {
        const device = this.devices.get(deviceId);
        if (!device) {
            throw new Error(`Device ${deviceId} not found`);
        }
        await device.setLight(state);
    }
    /**
     * Stop all movement for a specific device
     */
    async stopDevice(deviceId) {
        const device = this.devices.get(deviceId);
        if (!device) {
            throw new Error(`Device ${deviceId} not found`);
        }
        await device.stopAllMovement();
    }
    /**
     * Stop all movement for all devices
     */
    async stopAllDevices() {
        const promises = Array.from(this.devices.values()).map(device => device.stopAllMovement().catch(error => (0, logger_1.logError)('[RC2DeviceManager] Error stopping device:', error)));
        await Promise.allSettled(promises);
        (0, logger_1.logInfo)('[RC2DeviceManager] Stop command sent to all devices');
    }
    /**
     * Update calibration for a specific device
     */
    updateDeviceCalibration(deviceId, headSeconds, feetSeconds) {
        const device = this.devices.get(deviceId);
        if (!device) {
            throw new Error(`Device ${deviceId} not found`);
        }
        device.updateCalibration(headSeconds, feetSeconds);
    }
    /**
     * Setup device event handlers
     */
    setupDeviceEventHandlers(device, deviceId, config) {
        device.on('connected', (status) => {
            (0, logger_1.logInfo)(`[RC2DeviceManager] Device ${deviceId} connected`);
            this.publishDeviceStatus(deviceId, status);
            this.emit('deviceConnected', deviceId, status);
        });
        device.on('disconnected', (status) => {
            (0, logger_1.logWarn)(`[RC2DeviceManager] Device ${deviceId} disconnected`);
            this.publishDeviceStatus(deviceId, status);
            this.emit('deviceDisconnected', deviceId, status);
        });
        device.on('positionChanged', (position) => {
            this.publishDevicePosition(deviceId, position);
            this.emit('devicePositionChanged', deviceId, position);
        });
        device.on('lightChanged', (state) => {
            this.publishDeviceLightState(deviceId, state);
            this.emit('deviceLightChanged', deviceId, state);
        });
        device.on('movementStopped', () => {
            this.emit('deviceMovementStopped', deviceId);
        });
        device.on('calibrationChanged', (calibration) => {
            this.emit('deviceCalibrationChanged', deviceId, calibration);
        });
    }
    /**
     * Setup MQTT discovery for Home Assistant
     */
    async setupMQTTDiscovery(deviceId, config) {
        const uniqueId = deviceId.replace(/:/g, '').toLowerCase();
        const deviceName = config.friendlyName;
        // Device info for Home Assistant
        const deviceInfo = {
            identifiers: [uniqueId],
            name: deviceName,
            manufacturer: "RC2",
            model: "Smart Bed",
            via_device: "octo_mqtt_addon"
        };
        try {
            // Head Cover Discovery
            await this.mqttConnection.publish(`${this.mqttTopicPrefix}/${uniqueId}_head/config`, JSON.stringify({
                name: `${deviceName} Head`,
                unique_id: `${uniqueId}_head`,
                device_class: "blind",
                position_topic: `${this.mqttTopicPrefix}/${uniqueId}_head/position`,
                set_position_topic: `${this.mqttTopicPrefix}/${uniqueId}_head/set_position`,
                command_topic: `${this.mqttTopicPrefix}/${uniqueId}_head/command`,
                availability_topic: `${this.mqttTopicPrefix}/${uniqueId}/availability`,
                position_open: 100,
                position_closed: 0,
                payload_open: "OPEN",
                payload_close: "CLOSE",
                payload_stop: "STOP",
                payload_available: "online",
                payload_not_available: "offline",
                optimistic: false,
                device: deviceInfo
            }));
            // Feet Cover Discovery
            await this.mqttConnection.publish(`${this.mqttTopicPrefix}/${uniqueId}_feet/config`, JSON.stringify({
                name: `${deviceName} Feet`,
                unique_id: `${uniqueId}_feet`,
                device_class: "blind",
                position_topic: `${this.mqttTopicPrefix}/${uniqueId}_feet/position`,
                set_position_topic: `${this.mqttTopicPrefix}/${uniqueId}_feet/set_position`,
                command_topic: `${this.mqttTopicPrefix}/${uniqueId}_feet/command`,
                availability_topic: `${this.mqttTopicPrefix}/${uniqueId}/availability`,
                position_open: 100,
                position_closed: 0,
                payload_open: "OPEN",
                payload_close: "CLOSE",
                payload_stop: "STOP",
                payload_available: "online",
                payload_not_available: "offline",
                optimistic: false,
                device: deviceInfo
            }));
            // Light Discovery
            await this.mqttConnection.publish(`homeassistant/light/${uniqueId}_light/config`, JSON.stringify({
                name: `${deviceName} Light`,
                unique_id: `${uniqueId}_light`,
                state_topic: `homeassistant/light/${uniqueId}_light/state`,
                command_topic: `homeassistant/light/${uniqueId}_light/command`,
                availability_topic: `${this.mqttTopicPrefix}/${uniqueId}/availability`,
                payload_on: "ON",
                payload_off: "OFF",
                payload_available: "online",
                payload_not_available: "offline",
                optimistic: false,
                device: deviceInfo
            }));
            // Set up command subscriptions
            await this.setupMQTTCommandHandlers(deviceId, uniqueId);
            (0, logger_1.logInfo)(`[RC2DeviceManager] MQTT discovery setup completed for ${deviceName}`);
        }
        catch (error) {
            (0, logger_1.logError)(`[RC2DeviceManager] Error setting up MQTT discovery for ${deviceName}:`, error);
        }
    }
    /**
     * Setup MQTT command handlers
     */
    async setupMQTTCommandHandlers(deviceId, uniqueId) {
        // Head commands
        this.mqttConnection.subscribe(`${this.mqttTopicPrefix}/${uniqueId}_head/command`);
        this.mqttConnection.on(`${this.mqttTopicPrefix}/${uniqueId}_head/command`, (message) => {
            this.handleMQTTCommand(deviceId, 'head', message);
        });
        this.mqttConnection.subscribe(`${this.mqttTopicPrefix}/${uniqueId}_head/set_position`);
        this.mqttConnection.on(`${this.mqttTopicPrefix}/${uniqueId}_head/set_position`, (message) => {
            this.handleMQTTPositionCommand(deviceId, 'head', message);
        });
        // Feet commands
        this.mqttConnection.subscribe(`${this.mqttTopicPrefix}/${uniqueId}_feet/command`);
        this.mqttConnection.on(`${this.mqttTopicPrefix}/${uniqueId}_feet/command`, (message) => {
            this.handleMQTTCommand(deviceId, 'feet', message);
        });
        this.mqttConnection.subscribe(`${this.mqttTopicPrefix}/${uniqueId}_feet/set_position`);
        this.mqttConnection.on(`${this.mqttTopicPrefix}/${uniqueId}_feet/set_position`, (message) => {
            this.handleMQTTPositionCommand(deviceId, 'feet', message);
        });
        // Light commands
        this.mqttConnection.subscribe(`homeassistant/light/${uniqueId}_light/command`);
        this.mqttConnection.on(`homeassistant/light/${uniqueId}_light/command`, (message) => {
            this.handleMQTTLightCommand(deviceId, message);
        });
        (0, logger_1.logInfo)(`[RC2DeviceManager] MQTT command handlers setup for device ${uniqueId}`);
    }
    /**
     * Handle MQTT commands
     */
    async handleMQTTCommand(deviceId, section, command) {
        try {
            const device = this.devices.get(deviceId);
            if (!device) {
                (0, logger_1.logError)(`[RC2DeviceManager] Device ${deviceId} not found for command ${command}`);
                return;
            }
            const status = device.getStatus();
            switch (command) {
                case 'OPEN':
                    if (section === 'head') {
                        await device.setPosition(100, status.positions.feet);
                    }
                    else {
                        await device.setPosition(status.positions.head, 100);
                    }
                    break;
                case 'CLOSE':
                    if (section === 'head') {
                        await device.setPosition(0, status.positions.feet);
                    }
                    else {
                        await device.setPosition(status.positions.head, 0);
                    }
                    break;
                case 'STOP':
                    await device.stopAllMovement();
                    break;
                default:
                    (0, logger_1.logWarn)(`[RC2DeviceManager] Unknown command: ${command}`);
            }
        }
        catch (error) {
            (0, logger_1.logError)(`[RC2DeviceManager] Error handling MQTT command ${command}:`, error);
        }
    }
    /**
     * Handle MQTT position commands
     */
    async handleMQTTPositionCommand(deviceId, section, position) {
        try {
            const device = this.devices.get(deviceId);
            if (!device) {
                (0, logger_1.logError)(`[RC2DeviceManager] Device ${deviceId} not found for position command`);
                return;
            }
            const positionValue = parseInt(position);
            if (isNaN(positionValue) || positionValue < 0 || positionValue > 100) {
                (0, logger_1.logError)(`[RC2DeviceManager] Invalid position value: ${position}`);
                return;
            }
            const status = device.getStatus();
            if (section === 'head') {
                await device.setPosition(positionValue, status.positions.feet);
            }
            else {
                await device.setPosition(status.positions.head, positionValue);
            }
        }
        catch (error) {
            (0, logger_1.logError)(`[RC2DeviceManager] Error handling position command:`, error);
        }
    }
    /**
     * Handle MQTT light commands
     */
    async handleMQTTLightCommand(deviceId, command) {
        try {
            const device = this.devices.get(deviceId);
            if (!device) {
                (0, logger_1.logError)(`[RC2DeviceManager] Device ${deviceId} not found for light command`);
                return;
            }
            const lightState = command === 'ON';
            await device.setLight(lightState);
        }
        catch (error) {
            (0, logger_1.logError)(`[RC2DeviceManager] Error handling light command:`, error);
        }
    }
    /**
     * Publish device status to MQTT
     */
    async publishDeviceStatus(deviceId, status) {
        const uniqueId = deviceId.replace(/:/g, '').toLowerCase();
        try {
            // Publish availability
            await this.mqttConnection.publish(`${this.mqttTopicPrefix}/${uniqueId}/availability`, status.connected ? 'online' : 'offline');
            if (status.connected) {
                // Publish positions
                await this.publishDevicePosition(deviceId, status.positions);
                // Publish light state
                await this.publishDeviceLightState(deviceId, status.lightState);
            }
        }
        catch (error) {
            (0, logger_1.logError)(`[RC2DeviceManager] Error publishing device status:`, error);
        }
    }
    /**
     * Publish device position to MQTT
     */
    async publishDevicePosition(deviceId, position) {
        const uniqueId = deviceId.replace(/:/g, '').toLowerCase();
        try {
            await this.mqttConnection.publish(`${this.mqttTopicPrefix}/${uniqueId}_head/position`, position.head.toString());
            await this.mqttConnection.publish(`${this.mqttTopicPrefix}/${uniqueId}_feet/position`, position.feet.toString());
        }
        catch (error) {
            (0, logger_1.logError)(`[RC2DeviceManager] Error publishing position:`, error);
        }
    }
    /**
     * Publish device light state to MQTT
     */
    async publishDeviceLightState(deviceId, state) {
        const uniqueId = deviceId.replace(/:/g, '').toLowerCase();
        try {
            await this.mqttConnection.publish(`homeassistant/light/${uniqueId}_light/state`, state ? 'ON' : 'OFF');
        }
        catch (error) {
            (0, logger_1.logError)(`[RC2DeviceManager] Error publishing light state:`, error);
        }
    }
    /**
     * Remove MQTT discovery
     */
    async removeMQTTDiscovery(deviceId) {
        const uniqueId = deviceId.replace(/:/g, '').toLowerCase();
        try {
            // Remove discovery topics
            await this.mqttConnection.publish(`${this.mqttTopicPrefix}/${uniqueId}_head/config`, '');
            await this.mqttConnection.publish(`${this.mqttTopicPrefix}/${uniqueId}_feet/config`, '');
            await this.mqttConnection.publish(`homeassistant/light/${uniqueId}_light/config`, '');
            (0, logger_1.logInfo)(`[RC2DeviceManager] MQTT discovery removed for device ${uniqueId}`);
        }
        catch (error) {
            (0, logger_1.logError)(`[RC2DeviceManager] Error removing MQTT discovery:`, error);
        }
    }
    /**
     * Start periodic status updates
     */
    startStatusUpdates() {
        this.statusUpdateInterval = setInterval(() => {
            this.emit('statusUpdate', this.getAllDeviceStatuses());
        }, 5000); // Update every 5 seconds
    }
    /**
     * Generate device ID from address
     */
    getDeviceId(address) {
        return address.toLowerCase();
    }
    /**
     * Cleanup when manager is disposed
     */
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
        this.removeAllListeners();
        (0, logger_1.logInfo)('[RC2DeviceManager] Device manager disposed');
    }
}
exports.RC2DeviceManager = RC2DeviceManager;
//# sourceMappingURL=RC2DeviceManager.js.map