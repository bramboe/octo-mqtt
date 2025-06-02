import { EventEmitter } from 'events';
import { logInfo, logError } from '@utils/logger';
import type { IESPConnection } from '../ESPHome/IESPConnection';
import { BLEController } from '../BLE/BLEController';

export class BLEScanner extends EventEmitter {
  private activeDevices: Map<string, BLEController> = new Map();
  private isScanning: boolean = false;

  constructor(private readonly espConnection: IESPConnection) {
    super();
  }

  public async startScan(): Promise<void> {
    if (this.isScanning) {
      throw new Error('Scan already in progress');
    }

    try {
      this.isScanning = true;
      await this.espConnection.startScan();
      this.emit('scanStarted');
    } catch (error) {
      this.isScanning = false;
      throw error;
    }
  }

  public async stopScan(): Promise<void> {
    if (!this.isScanning) return;

    try {
      await this.espConnection.stopScan();
    } finally {
      this.isScanning = false;
      this.emit('scanStopped');
    }
  }

  public async connectToDevice(address: string, pin: string = '0000'): Promise<void> {
    // Check if we're already connected to this device
    if (this.activeDevices.has(address)) {
      logInfo(`[BLE] Already connected to device ${address}`);
      return;
    }

    try {
      // Create a new BLE controller for this device
      const controller = new BLEController(this.espConnection, address, pin);
      
      // Set up event forwarding
      controller.on('connectionStatus', (status: boolean) => {
        this.emit('deviceConnectionStatus', { address, status });
      });

      // Store the controller
      this.activeDevices.set(address, controller);

      // Attempt to connect
      await controller.connect();
      
      logInfo(`[BLE] Successfully connected to device ${address}`);
    } catch (error) {
      logError(`[BLE] Failed to connect to device ${address}:`, error);
      this.activeDevices.delete(address);
      throw error;
    }
  }

  public disconnectDevice(address: string): void {
    const controller = this.activeDevices.get(address);
    if (controller) {
      controller.disconnect();
      this.activeDevices.delete(address);
      logInfo(`[BLE] Disconnected from device ${address}`);
    }
  }

  public isDeviceConnected(address: string): boolean {
    const controller = this.activeDevices.get(address);
    return controller ? controller.isDeviceConnected() : false;
  }

  public getConnectedDevices(): string[] {
    return Array.from(this.activeDevices.keys());
  }

  public getDeviceLastKeepAliveTime(address: string): number {
    const controller = this.activeDevices.get(address);
    return controller ? controller.getLastKeepAliveTime() : 0;
  }
} 