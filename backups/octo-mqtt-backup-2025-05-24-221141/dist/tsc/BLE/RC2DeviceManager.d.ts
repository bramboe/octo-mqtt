import { EventEmitter } from 'events';
import { RC2Device, RC2DeviceConfig, RC2Status } from './RC2Device';
import type { IMQTTConnection } from '../MQTT/IMQTTConnection';
export interface DeviceManagerStatus {
    totalDevices: number;
    connectedDevices: number;
    devices: {
        [deviceId: string]: RC2Status;
    };
}
export declare class RC2DeviceManager extends EventEmitter {
    private devices;
    private mqttConnection;
    private esphomeConnection;
    private mqttTopicPrefix;
    private statusUpdateInterval;
    constructor(mqttConnection: IMQTTConnection, esphomeConnection: any);
    /**
     * Initialize and connect to all configured RC2 devices
     */
    initializeDevices(): Promise<void>;
    /**
     * Add a new RC2 device
     */
    addDevice(config: RC2DeviceConfig): Promise<void>;
    /**
     * Remove a device
     */
    removeDevice(deviceId: string): Promise<void>;
    /**
     * Get device by ID
     */
    getDevice(deviceId: string): RC2Device | undefined;
    /**
     * Get all device statuses
     */
    getAllDeviceStatuses(): DeviceManagerStatus;
    /**
     * Set position for a specific device
     */
    setDevicePosition(deviceId: string, head: number, feet: number): Promise<void>;
    /**
     * Set light state for a specific device
     */
    setDeviceLight(deviceId: string, state: boolean): Promise<void>;
    /**
     * Stop all movement for a specific device
     */
    stopDevice(deviceId: string): Promise<void>;
    /**
     * Stop all movement for all devices
     */
    stopAllDevices(): Promise<void>;
    /**
     * Update calibration for a specific device
     */
    updateDeviceCalibration(deviceId: string, headSeconds: number, feetSeconds: number): void;
    /**
     * Setup device event handlers
     */
    private setupDeviceEventHandlers;
    /**
     * Setup MQTT discovery for Home Assistant
     */
    private setupMQTTDiscovery;
    /**
     * Setup MQTT command handlers
     */
    private setupMQTTCommandHandlers;
    /**
     * Handle MQTT commands
     */
    private handleMQTTCommand;
    /**
     * Handle MQTT position commands
     */
    private handleMQTTPositionCommand;
    /**
     * Handle MQTT light commands
     */
    private handleMQTTLightCommand;
    /**
     * Publish device status to MQTT
     */
    private publishDeviceStatus;
    /**
     * Publish device position to MQTT
     */
    private publishDevicePosition;
    /**
     * Publish device light state to MQTT
     */
    private publishDeviceLightState;
    /**
     * Remove MQTT discovery
     */
    private removeMQTTDiscovery;
    /**
     * Start periodic status updates
     */
    private startStatusUpdates;
    /**
     * Generate device ID from address
     */
    private getDeviceId;
    /**
     * Cleanup when manager is disposed
     */
    dispose(): void;
}
