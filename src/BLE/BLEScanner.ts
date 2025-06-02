import { EventEmitter } from 'events';
import { logInfo, logError, logDebug } from '@utils/logger';
import { BLEController } from './BLEController';
import type { IESPConnection } from '../ESPHome/IESPConnection';
import type { OctoDevice } from '../types/OctoDevice';

export class BLEScanner extends EventEmitter {
  private readonly controllers: Map<string, BLEController> = new Map();
  private readonly discoveredDevices: Map<string, any> = new Map();
  private isScanning: boolean = false;
  private scanTimeout: NodeJS.Timeout | null = null;
  private readonly SCAN_TIMEOUT = 30000; // 30 seconds

  constructor(private readonly espConnection: IESPConnection) {
    super();
    logInfo('[BLEScanner] Initializing BLE Scanner');
    this.setupScanHandlers();
  }

  private setupScanHandlers(): void {
    logInfo('[BLEScanner] Setting up scan handlers');
    
    this.espConnection.on('deviceDiscovered', (device: any) => {
      const deviceId = device.address || device.id;
      logDebug(`[BLEScanner] Device discovered: ${deviceId}`);
      
      if (this.isRC2Device(device)) {
        logInfo(`[BLEScanner] RC2 device found: ${deviceId}`);
        this.discoveredDevices.set(deviceId, device);
        this.emit('deviceDiscovered', device);
      }
    });
  }

  public async startScan(): Promise<void> {
    if (this.isScanning) {
      logInfo('[BLEScanner] Scan already in progress');
      return;
    }

    logInfo('[BLEScanner] Starting BLE scan');
    this.isScanning = true;
    this.discoveredDevices.clear();

    try {
      await this.espConnection.startScan();
      
      this.scanTimeout = setTimeout(() => {
        logInfo('[BLEScanner] Scan timeout reached');
        this.stopScan();
      }, this.SCAN_TIMEOUT);
      
    } catch (error) {
      logError('[BLEScanner] Failed to start scan:', error);
      this.isScanning = false;
      throw error;
    }
  }

  public async stopScan(): Promise<void> {
    if (!this.isScanning) {
      logInfo('[BLEScanner] No scan in progress to stop');
      return;
    }

    logInfo('[BLEScanner] Stopping BLE scan');
    
    if (this.scanTimeout) {
      clearTimeout(this.scanTimeout);
      this.scanTimeout = null;
    }

    try {
      await this.espConnection.stopScan();
      this.isScanning = false;
      logInfo(`[BLEScanner] Scan completed. Found ${this.discoveredDevices.size} RC2 device(s).`);
    } catch (error) {
      logError('[BLEScanner] Failed to stop scan:', error);
      throw error;
    }
  }

  public async connectToDevice(device: OctoDevice): Promise<void> {
    const { name, friendlyName, pin } = device;
    logInfo(`[BLEScanner] Attempting to connect to device: ${friendlyName} (${name})`);

    if (this.controllers.has(name)) {
      logInfo(`[BLEScanner] Controller already exists for device ${name}`);
      const controller = this.controllers.get(name)!;
      
      if (!controller.isDeviceConnected()) {
        logInfo(`[BLEScanner] Device ${name} is disconnected, attempting to reconnect`);
        await controller.connect();
      } else {
        logInfo(`[BLEScanner] Device ${name} is already connected`);
      }
      return;
    }

    try {
      logInfo(`[BLEScanner] Creating new controller for device ${name}`);
      const controller = new BLEController(this.espConnection, name, pin);
      this.controllers.set(name, controller);

      controller.on('connectionStatus', (status: boolean) => {
        logInfo(`[BLEScanner] Connection status changed for ${name}: ${status ? 'Connected' : 'Disconnected'}`);
        this.emit('deviceConnectionStatus', { deviceId: name, isConnected: status });
      });

      await controller.connect();
    } catch (error) {
      logError(`[BLEScanner] Failed to connect to device ${name}:`, error);
      throw error;
    }
  }

  public disconnectFromDevice(deviceId: string): void {
    logInfo(`[BLEScanner] Request to disconnect from device ${deviceId}`);
    const controller = this.controllers.get(deviceId);
    
    if (controller) {
      logInfo(`[BLEScanner] Found controller for device ${deviceId}, initiating disconnect`);
      controller.disconnect();
      this.controllers.delete(deviceId);
      logInfo(`[BLEScanner] Removed controller for device ${deviceId}`);
    } else {
      logInfo(`[BLEScanner] No controller found for device ${deviceId}`);
    }
  }

  public getDiscoveredDevices(): Map<string, any> {
    return this.discoveredDevices;
  }

  public getConnectedDevices(): string[] {
    const connectedDevices: string[] = [];
    this.controllers.forEach((controller, deviceId) => {
      if (controller.isDeviceConnected()) {
        connectedDevices.push(deviceId);
      }
    });
    logDebug(`[BLEScanner] Currently connected devices: ${connectedDevices.join(', ') || 'none'}`);
    return connectedDevices;
  }

  private isRC2Device(device: any): boolean {
    // Add your RC2 device detection logic here
    return device.name?.startsWith('RC2') || false;
  }
} 