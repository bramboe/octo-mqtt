import { IBLEDevice } from '../ESPHome/types/IBLEDevice';
import { logInfo, logError } from '../Utils/logger';
import { BLEConnectionManager } from './BLEConnectionManager';

export interface BLEDeviceAdvertisement {
  name: string;
  address: string;
  rssi: number;
  service_uuids: string[];
}

export class BLEController {
  private connectionManager: BLEConnectionManager;
  private isConnected = false;

  constructor(
    private device: IBLEDevice,
    private pin?: string
  ) {
    this.connectionManager = new BLEConnectionManager(device);
    this.setupConnectionHandlers();
  }

  private setupConnectionHandlers() {
    this.connectionManager.on('connect', () => {
      this.isConnected = true;
      logInfo(`[BLEController] Connected to device ${this.device.name}`);
    });

    this.connectionManager.on('disconnect', () => {
      this.isConnected = false;
      logInfo(`[BLEController] Disconnected from device ${this.device.name}`);
    });
  }

  public async connect(): Promise<boolean> {
    try {
      const success = await this.connectionManager.connect();
      if (success && this.pin) {
        // If PIN is provided, we should authenticate here
        await this.authenticate();
      }
      return success;
    } catch (error) {
      logError('[BLEController] Connection failed:', error);
      return false;
    }
  }

  public async disconnect(): Promise<boolean> {
    return await this.connectionManager.disconnect();
  }

  private async authenticate() {
    if (!this.pin) {
      logError('[BLEController] No PIN provided for authentication');
      return false;
    }

    try {
      // Implementation of authentication with PIN would go here
      // This would involve sending the appropriate commands to the device
      return true;
    } catch (error) {
      logError('[BLEController] Authentication failed:', error);
      return false;
    }
  }

  public isDeviceConnected(): boolean {
    return this.isConnected;
  }
} 