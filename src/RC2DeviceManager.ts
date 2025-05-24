import { EventEmitter } from 'events';
import { RC2Device, RC2DeviceConfig, RC2Status, RC2Position } from './BLE/RC2Device';
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
    
    // Only set up ESPHome event listeners if connection exists
    if (this.esphomeConnection) {
      logInfo('[RC2DeviceManager] Initialized with ESPHome connection');
      this.startStatusUpdates();
    } else {
      logWarn('[RC2DeviceManager] Initialized without ESPHome connection - BLE functionality will be limited');
    }
  }

  /**
   * Initialize and connect to all configured RC2 devices
   */
  async initializeDevices(): Promise<void> {
    if (!this.esphomeConnection) {
      logWarn('[RC2DeviceManager] Cannot initialize devices - no ESPHome connection available');
      return;
    }

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
    if (!this.esphomeConnection) {
      throw new Error('Cannot add device - no ESPHome connection available');
    }

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

  private setupDeviceEventHandlers(device: RC2Device, deviceId: string, config: RC2DeviceConfig): void {
    // Handle device status updates
    device.on('statusUpdate', (status: RC2Status) => {
      this.emit('deviceStatusUpdate', deviceId, status);
      this.publishDeviceStatus(deviceId, status);
    });

    // Handle position updates
    device.on('positionUpdate', (position: RC2Position) => {
      this.emit('devicePositionUpdate', deviceId, position);
      this.publishDevicePosition(deviceId, position);
    });

    // Handle light state updates
    device.on('lightStateUpdate', (state: boolean) => {
      this.emit('deviceLightStateUpdate', deviceId, state);
      this.publishDeviceLightState(deviceId, state);
    });

    // Handle connection events
    device.on('connected', () => {
      logInfo(`[RC2DeviceManager] Device ${config.friendlyName} connected`);
      this.emit('deviceConnected', deviceId);
    });

    device.on('disconnected', () => {
      logInfo(`[RC2DeviceManager] Device ${config.friendlyName} disconnected`);
      this.emit('deviceDisconnected', deviceId);
    });

    device.on('error', (error: Error) => {
      logError(`[RC2DeviceManager] Device ${config.friendlyName} error:`, error);
      this.emit('deviceError', deviceId, error);
    });
  }

  private async setupMQTTDiscovery(deviceId: string, config: RC2DeviceConfig): Promise<void> {
    // Simplified MQTT setup for now
    logInfo(`[RC2DeviceManager] Setting up MQTT discovery for ${deviceId}`);
  }

  private async publishDeviceStatus(deviceId: string, status: RC2Status): Promise<void> {
    // Simplified status publishing for now
    // logInfo(`[RC2DeviceManager] Publishing status for ${deviceId}:`, status);
  }

  private async publishDevicePosition(deviceId: string, position: RC2Position): Promise<void> {
    // Simplified position publishing for now
    // logInfo(`[RC2DeviceManager] Publishing position for ${deviceId}:`, position);
  }

  private async publishDeviceLightState(deviceId: string, state: boolean): Promise<void> {
    // Simplified light state publishing for now
    // logInfo(`[RC2DeviceManager] Publishing light state for ${deviceId}:`, state);
  }

  private startStatusUpdates(): void {
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

  private getDeviceId(address: string): string {
    // Convert MAC address to a clean device ID
    return address.replace(/[:-]/g, '').toLowerCase();
  }

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

    logInfo('[RC2DeviceManager] Disposed');
  }
} 