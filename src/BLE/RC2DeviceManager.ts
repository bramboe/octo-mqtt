import { EventEmitter } from 'events';
import { RC2Device, RC2DeviceConfig, RC2Status, RC2Position } from './RC2Device';
import type { IMQTTConnection } from '@mqtt/IMQTTConnection';
import { logError, logInfo, logWarn } from '@utils/logger';
import { getRootOptions } from '@utils/options';

export interface DeviceManagerStatus {
  totalDevices: number;
  connectedDevices: number;
  devices: { [deviceId: string]: RC2Status };
}

export class RC2DeviceManager extends EventEmitter {
  private devices = new Map<string, RC2Device>();
  private mqttConnection: IMQTTConnection;
  private esphomeConnection: any;
  private mqttTopicPrefix = 'homeassistant/cover';
  private statusUpdateInterval: NodeJS.Timeout | null = null;

  constructor(mqttConnection: IMQTTConnection, esphomeConnection: any) {
    super();
    this.mqttConnection = mqttConnection;
    this.esphomeConnection = esphomeConnection;
    
    logInfo('[RC2DeviceManager] Initialized');
    this.startStatusUpdates();
  }

  /**
   * Initialize and connect to all configured RC2 devices
   */
  async initializeDevices(): Promise<void> {
    const config = getRootOptions();
    const configuredDevices = config.octoDevices || [];
    
    logInfo(`[RC2DeviceManager] Initializing ${configuredDevices.length} configured devices`);

    for (const deviceConfig of configuredDevices) {
      try {
        await this.addDevice({
          address: deviceConfig.name, // MAC address stored as name
          pin: deviceConfig.pin || '0000',
          friendlyName: deviceConfig.friendlyName || `RC2 Bed`,
          headCalibrationSeconds: 30.0,
          feetCalibrationSeconds: 30.0
        });
      } catch (error) {
        logError(`[RC2DeviceManager] Failed to add device ${deviceConfig.friendlyName}:`, error);
        // Continue with other devices
      }
    }

    logInfo(`[RC2DeviceManager] Device initialization completed. ${this.devices.size} devices added.`);
  }

  /**
   * Add a new RC2 device
   */
  async addDevice(config: RC2DeviceConfig): Promise<void> {
    const deviceId = this.getDeviceId(config.address);
    
    if (this.devices.has(deviceId)) {
      logWarn(`[RC2DeviceManager] Device ${deviceId} already exists`);
      return;
    }

    logInfo(`[RC2DeviceManager] Adding device: ${config.friendlyName} (${config.address})`);

    const device = new RC2Device(config, this.esphomeConnection);
    
    // Set up device event handlers
    this.setupDeviceEventHandlers(device, deviceId, config);
    
    // Store device
    this.devices.set(deviceId, device);
    
    // Set up MQTT discovery for Home Assistant
    await this.setupMQTTDiscovery(deviceId, config);
    
    // Try to connect to the device
    try {
      await device.connect();
      logInfo(`[RC2DeviceManager] Successfully connected to ${config.friendlyName}`);
    } catch (error) {
      logError(`[RC2DeviceManager] Failed to connect to ${config.friendlyName}:`, error);
      // Don't remove the device - it might connect later
    }

    this.emit('deviceAdded', deviceId, device.getStatus());
  }

  /**
   * Remove a device
   */
  async removeDevice(deviceId: string): Promise<void> {
    const device = this.devices.get(deviceId);
    if (!device) {
      logWarn(`[RC2DeviceManager] Device ${deviceId} not found`);
      return;
    }

    logInfo(`[RC2DeviceManager] Removing device: ${deviceId}`);

    try {
      await device.disconnect();
      device.dispose();
      this.devices.delete(deviceId);
      
      // Remove MQTT discovery
      await this.removeMQTTDiscovery(deviceId);
      
      this.emit('deviceRemoved', deviceId);
      logInfo(`[RC2DeviceManager] Device ${deviceId} removed successfully`);
    } catch (error) {
      logError(`[RC2DeviceManager] Error removing device ${deviceId}:`, error);
    }
  }

  /**
   * Get device by ID
   */
  getDevice(deviceId: string): RC2Device | undefined {
    return this.devices.get(deviceId);
  }

  /**
   * Get all device statuses
   */
  getAllDeviceStatuses(): DeviceManagerStatus {
    const devices: { [deviceId: string]: RC2Status } = {};
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
  async setDevicePosition(deviceId: string, head: number, feet: number): Promise<void> {
    const device = this.devices.get(deviceId);
    if (!device) {
      throw new Error(`Device ${deviceId} not found`);
    }

    await device.setPosition(head, feet);
  }

  /**
   * Set light state for a specific device
   */
  async setDeviceLight(deviceId: string, state: boolean): Promise<void> {
    const device = this.devices.get(deviceId);
    if (!device) {
      throw new Error(`Device ${deviceId} not found`);
    }

    await device.setLight(state);
  }

  /**
   * Stop all movement for a specific device
   */
  async stopDevice(deviceId: string): Promise<void> {
    const device = this.devices.get(deviceId);
    if (!device) {
      throw new Error(`Device ${deviceId} not found`);
    }

    await device.stopAllMovement();
  }

  /**
   * Stop all movement for all devices
   */
  async stopAllDevices(): Promise<void> {
    const promises = Array.from(this.devices.values()).map(device => 
      device.stopAllMovement().catch(error => 
        logError('[RC2DeviceManager] Error stopping device:', error)
      )
    );
    
    await Promise.allSettled(promises);
    logInfo('[RC2DeviceManager] Stop command sent to all devices');
  }

  /**
   * Update calibration for a specific device
   */
  updateDeviceCalibration(deviceId: string, headSeconds: number, feetSeconds: number): void {
    const device = this.devices.get(deviceId);
    if (!device) {
      throw new Error(`Device ${deviceId} not found`);
    }

    device.updateCalibration(headSeconds, feetSeconds);
  }

  /**
   * Setup device event handlers
   */
  private setupDeviceEventHandlers(device: RC2Device, deviceId: string, config: RC2DeviceConfig): void {
    device.on('connected', (status: RC2Status) => {
      logInfo(`[RC2DeviceManager] Device ${deviceId} connected`);
      this.publishDeviceStatus(deviceId, status);
      this.emit('deviceConnected', deviceId, status);
    });

    device.on('disconnected', (status: RC2Status) => {
      logWarn(`[RC2DeviceManager] Device ${deviceId} disconnected`);
      this.publishDeviceStatus(deviceId, status);
      this.emit('deviceDisconnected', deviceId, status);
    });

    device.on('positionChanged', (position: RC2Position) => {
      this.publishDevicePosition(deviceId, position);
      this.emit('devicePositionChanged', deviceId, position);
    });

    device.on('lightChanged', (state: boolean) => {
      this.publishDeviceLightState(deviceId, state);
      this.emit('deviceLightChanged', deviceId, state);
    });

    device.on('movementStopped', () => {
      this.emit('deviceMovementStopped', deviceId);
    });

    device.on('calibrationChanged', (calibration: any) => {
      this.emit('deviceCalibrationChanged', deviceId, calibration);
    });
  }

  /**
   * Setup MQTT discovery for Home Assistant
   */
  private async setupMQTTDiscovery(deviceId: string, config: RC2DeviceConfig): Promise<void> {
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
      await this.mqttConnection.publish(
        `${this.mqttTopicPrefix}/${uniqueId}_head/config`,
        JSON.stringify({
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
        })
      );

      // Feet Cover Discovery
      await this.mqttConnection.publish(
        `${this.mqttTopicPrefix}/${uniqueId}_feet/config`,
        JSON.stringify({
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
        })
      );

      // Light Discovery
      await this.mqttConnection.publish(
        `homeassistant/light/${uniqueId}_light/config`,
        JSON.stringify({
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
        })
      );

      // Set up command subscriptions
      await this.setupMQTTCommandHandlers(deviceId, uniqueId);

      logInfo(`[RC2DeviceManager] MQTT discovery setup completed for ${deviceName}`);
    } catch (error) {
      logError(`[RC2DeviceManager] Error setting up MQTT discovery for ${deviceName}:`, error);
    }
  }

  /**
   * Setup MQTT command handlers
   */
  private async setupMQTTCommandHandlers(deviceId: string, uniqueId: string): Promise<void> {
    // Head commands
    this.mqttConnection.subscribe(`${this.mqttTopicPrefix}/${uniqueId}_head/command`);
    this.mqttConnection.on(`${this.mqttTopicPrefix}/${uniqueId}_head/command`, (message: string) => {
      this.handleMQTTCommand(deviceId, 'head', message);
    });

    this.mqttConnection.subscribe(`${this.mqttTopicPrefix}/${uniqueId}_head/set_position`);
    this.mqttConnection.on(`${this.mqttTopicPrefix}/${uniqueId}_head/set_position`, (message: string) => {
      this.handleMQTTPositionCommand(deviceId, 'head', message);
    });

    // Feet commands
    this.mqttConnection.subscribe(`${this.mqttTopicPrefix}/${uniqueId}_feet/command`);
    this.mqttConnection.on(`${this.mqttTopicPrefix}/${uniqueId}_feet/command`, (message: string) => {
      this.handleMQTTCommand(deviceId, 'feet', message);
    });

    this.mqttConnection.subscribe(`${this.mqttTopicPrefix}/${uniqueId}_feet/set_position`);
    this.mqttConnection.on(`${this.mqttTopicPrefix}/${uniqueId}_feet/set_position`, (message: string) => {
      this.handleMQTTPositionCommand(deviceId, 'feet', message);
    });

    // Light commands
    this.mqttConnection.subscribe(`homeassistant/light/${uniqueId}_light/command`);
    this.mqttConnection.on(`homeassistant/light/${uniqueId}_light/command`, (message: string) => {
      this.handleMQTTLightCommand(deviceId, message);
    });

    logInfo(`[RC2DeviceManager] MQTT command handlers setup for device ${uniqueId}`);
  }

  /**
   * Handle MQTT commands
   */
  private async handleMQTTCommand(deviceId: string, section: 'head' | 'feet', command: string): Promise<void> {
    try {
      const device = this.devices.get(deviceId);
      if (!device) {
        logError(`[RC2DeviceManager] Device ${deviceId} not found for command ${command}`);
        return;
      }

      const status = device.getStatus();
      
      switch (command) {
        case 'OPEN':
          if (section === 'head') {
            await device.setPosition(100, status.positions.feet);
          } else {
            await device.setPosition(status.positions.head, 100);
          }
          break;
        
        case 'CLOSE':
          if (section === 'head') {
            await device.setPosition(0, status.positions.feet);
          } else {
            await device.setPosition(status.positions.head, 0);
          }
          break;
        
        case 'STOP':
          await device.stopAllMovement();
          break;
        
        default:
          logWarn(`[RC2DeviceManager] Unknown command: ${command}`);
      }
    } catch (error) {
      logError(`[RC2DeviceManager] Error handling MQTT command ${command}:`, error);
    }
  }

  /**
   * Handle MQTT position commands
   */
  private async handleMQTTPositionCommand(deviceId: string, section: 'head' | 'feet', position: string): Promise<void> {
    try {
      const device = this.devices.get(deviceId);
      if (!device) {
        logError(`[RC2DeviceManager] Device ${deviceId} not found for position command`);
        return;
      }

      const positionValue = parseInt(position);
      if (isNaN(positionValue) || positionValue < 0 || positionValue > 100) {
        logError(`[RC2DeviceManager] Invalid position value: ${position}`);
        return;
      }

      const status = device.getStatus();
      
      if (section === 'head') {
        await device.setPosition(positionValue, status.positions.feet);
      } else {
        await device.setPosition(status.positions.head, positionValue);
      }
    } catch (error) {
      logError(`[RC2DeviceManager] Error handling position command:`, error);
    }
  }

  /**
   * Handle MQTT light commands
   */
  private async handleMQTTLightCommand(deviceId: string, command: string): Promise<void> {
    try {
      const device = this.devices.get(deviceId);
      if (!device) {
        logError(`[RC2DeviceManager] Device ${deviceId} not found for light command`);
        return;
      }

      const lightState = command === 'ON';
      await device.setLight(lightState);
    } catch (error) {
      logError(`[RC2DeviceManager] Error handling light command:`, error);
    }
  }

  /**
   * Publish device status to MQTT
   */
  private async publishDeviceStatus(deviceId: string, status: RC2Status): Promise<void> {
    const uniqueId = deviceId.replace(/:/g, '').toLowerCase();
    
    try {
      // Publish availability
      await this.mqttConnection.publish(
        `${this.mqttTopicPrefix}/${uniqueId}/availability`,
        status.connected ? 'online' : 'offline'
      );

      if (status.connected) {
        // Publish positions
        await this.publishDevicePosition(deviceId, status.positions);
        
        // Publish light state
        await this.publishDeviceLightState(deviceId, status.lightState);
      }
    } catch (error) {
      logError(`[RC2DeviceManager] Error publishing device status:`, error);
    }
  }

  /**
   * Publish device position to MQTT
   */
  private async publishDevicePosition(deviceId: string, position: RC2Position): Promise<void> {
    const uniqueId = deviceId.replace(/:/g, '').toLowerCase();
    
    try {
      await this.mqttConnection.publish(
        `${this.mqttTopicPrefix}/${uniqueId}_head/position`,
        position.head.toString()
      );

      await this.mqttConnection.publish(
        `${this.mqttTopicPrefix}/${uniqueId}_feet/position`,
        position.feet.toString()
      );
    } catch (error) {
      logError(`[RC2DeviceManager] Error publishing position:`, error);
    }
  }

  /**
   * Publish device light state to MQTT
   */
  private async publishDeviceLightState(deviceId: string, state: boolean): Promise<void> {
    const uniqueId = deviceId.replace(/:/g, '').toLowerCase();
    
    try {
      await this.mqttConnection.publish(
        `homeassistant/light/${uniqueId}_light/state`,
        state ? 'ON' : 'OFF'
      );
    } catch (error) {
      logError(`[RC2DeviceManager] Error publishing light state:`, error);
    }
  }

  /**
   * Remove MQTT discovery
   */
  private async removeMQTTDiscovery(deviceId: string): Promise<void> {
    const uniqueId = deviceId.replace(/:/g, '').toLowerCase();
    
    try {
      // Remove discovery topics
      await this.mqttConnection.publish(`${this.mqttTopicPrefix}/${uniqueId}_head/config`, '');
      await this.mqttConnection.publish(`${this.mqttTopicPrefix}/${uniqueId}_feet/config`, '');
      await this.mqttConnection.publish(`homeassistant/light/${uniqueId}_light/config`, '');
      
      logInfo(`[RC2DeviceManager] MQTT discovery removed for device ${uniqueId}`);
    } catch (error) {
      logError(`[RC2DeviceManager] Error removing MQTT discovery:`, error);
    }
  }

  /**
   * Start periodic status updates
   */
  private startStatusUpdates(): void {
    this.statusUpdateInterval = setInterval(() => {
      this.emit('statusUpdate', this.getAllDeviceStatuses());
    }, 5000); // Update every 5 seconds
  }

  /**
   * Generate device ID from address
   */
  private getDeviceId(address: string): string {
    return address.toLowerCase();
  }

  /**
   * Cleanup when manager is disposed
   */
  dispose(): void {
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
    logInfo('[RC2DeviceManager] Device manager disposed');
  }
} 