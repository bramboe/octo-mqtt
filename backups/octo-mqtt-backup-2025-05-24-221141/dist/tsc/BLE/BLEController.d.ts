import { EventEmitter } from 'events';
export interface BLEDeviceAdvertisement {
    name: string;
    address: string;
    rssi: number;
    service_uuids: string[];
}
export declare class BLEController extends EventEmitter {
    readonly deviceData: any;
    private readonly bleDevice;
    private readonly handle;
    private readonly buildCommand;
    private readonly handles?;
    cache: Record<string, any>;
    private commandQueue;
    private processing;
    private timeout;
    private pollingInterval;
    private keepAliveInterval;
    private lastValue;
    private pin;
    private isScanning;
    constructor(deviceData: any, bleDevice: any, handle: number, buildCommand: (command: number[] | {
        command: number[];
        data?: number[];
    }) => number[], handles?: {
        feedback: number;
    } | undefined, pin?: string);
    /**
     * Set PIN for authentication and keep-alive messages
     */
    setPin(pin: string): void;
    /**
     * Start the keep-alive interval to maintain connection
     */
    private startKeepAlive;
    private startPolling;
    private stopPolling;
    /**
     * Stop all intervals and timers when the controller is no longer needed
     */
    dispose(): void;
    writeCommand(command: number[] | {
        command: number[];
        data?: number[];
    }): Promise<void>;
    writeCommands(commands: Array<number[] | {
        command: number[];
        data?: number[];
    }>, count?: number): Promise<void>;
    /**
     * Send a stop command to immediately stop all motors
     */
    stopMotors(): Promise<void>;
    cancelCommands(): Promise<void>;
    private processQueue;
    /**
     * Start BLE scanning for devices.
     * Emits 'deviceDiscovered' for each unique device found.
     * Emits 'scanStatus' with { scanning: boolean, error?: string }.
     */
    startScan(): Promise<void>;
    /**
     * Stop BLE scanning.
     */
    stopScan(): Promise<void>;
    on(event: 'feedback', listener: (message: Uint8Array) => void): this;
    on(event: 'deviceDiscovered', listener: (device: BLEDeviceAdvertisement) => void): this;
    on(event: 'scanStatus', listener: (status: {
        scanning: boolean;
        error?: string;
    }) => void): this;
    off(event: 'feedback', listener: (message: Uint8Array) => void): this;
    off(event: 'deviceDiscovered', listener: (device: BLEDeviceAdvertisement) => void): this;
    off(event: 'scanStatus', listener: (status: {
        scanning: boolean;
        error?: string;
    }) => void): this;
}
