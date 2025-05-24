import { EventEmitter } from 'events';
import { RC2DeviceConfig, RC2Status } from './BLE/RC2Device';
import type { IMQTTConnection } from './MQTT/IMQTTConnection';
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
     * Get all device statuses
     */
    getAllDeviceStatuses(): DeviceManagerStatus;
    private setupDeviceEventHandlers;
    private setupMQTTDiscovery;
    private publishDeviceStatus;
    private publishDevicePosition;
    private publishDeviceLightState;
    private startStatusUpdates;
    private getDeviceId;
    dispose(): void;
}
