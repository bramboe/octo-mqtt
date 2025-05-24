import { EventEmitter } from 'events';
export interface RC2DeviceConfig {
    address: string;
    pin: string;
    friendlyName: string;
    headCalibrationSeconds?: number;
    feetCalibrationSeconds?: number;
}
export interface RC2Position {
    head: number;
    feet: number;
}
export interface RC2Status {
    connected: boolean;
    positions: RC2Position;
    lightState: boolean;
    calibration: {
        head: number;
        feet: number;
    };
    lastUpdate: Date;
}
export declare const RC2_COMMANDS: {
    HEAD_UP: number[];
    HEAD_DOWN: number[];
    FEET_UP: number[];
    FEET_DOWN: number[];
    BOTH_UP: number[];
    BOTH_DOWN: number[];
    STOP: number[];
    LIGHT_ON: number[];
    LIGHT_OFF: number[];
};
export declare const RC2_SERVICE_UUID = "ffe0";
export declare const RC2_CHARACTERISTIC_UUID = "ffe1";
export declare class RC2Device extends EventEmitter {
    private config;
    private esphomeConnection;
    private status;
    private keepAliveInterval;
    private movementStartTime;
    private movementDirection;
    private positionUpdateInterval;
    private connected;
    constructor(config: RC2DeviceConfig, esphomeConnection: any);
    /**
     * Connect to the RC2 device
     */
    connect(): Promise<void>;
    /**
     * Disconnect from the RC2 device
     */
    disconnect(): Promise<void>;
    /**
     * Get current device status
     */
    getStatus(): RC2Status;
    /**
     * Set position with time-based movement
     */
    setPosition(head: number, feet: number): Promise<void>;
    /**
     * Set light state
     */
    setLight(state: boolean): Promise<void>;
    /**
     * Stop all movement immediately
     */
    stopAllMovement(): Promise<void>;
    /**
     * Update calibration settings
     */
    updateCalibration(headSeconds: number, feetSeconds: number): void;
    /**
     * Move head in specified direction for specified duration
     */
    private moveHead;
    /**
     * Move feet in specified direction for specified duration
     */
    private moveFeet;
    /**
     * Move both head and feet in specified direction for specified duration
     */
    private moveBoth;
    /**
     * Execute a timed movement with position tracking
     */
    private executeTimedMovement;
    /**
     * Start position updates during movement
     */
    private startPositionUpdates;
    /**
     * Send command via ESPHome proxy
     */
    private sendCommand;
    /**
     * Start keep-alive mechanism with PIN authentication
     */
    private startKeepAlive;
    /**
     * Stop keep-alive mechanism
     */
    private stopKeepAlive;
    /**
     * Cleanup when device is disposed
     */
    dispose(): void;
}
