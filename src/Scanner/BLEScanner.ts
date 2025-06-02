import { IESPConnection } from '@esphome/IESPConnection';
import { BLEDeviceAdvertisement } from '@ble/BLEController';
import { logInfo } from '@utils/logger';
import { getRootOptions } from '@utils/options';
import { OctoDevice } from '@octo/options';

export class BLEScanner {
  private scanStartTime: number | null = null;
  private readonly SCAN_DURATION_MS = 30000; // 30 seconds
  private discoveredDevices = new Set<BLEDeviceAdvertisement>();

  constructor(private readonly espConnection: IESPConnection) {}

  public getScanStatus(): { 
    isScanning: boolean; 
    scanTimeRemaining: number; 
    discoveredDevices: number;
    devices: (BLEDeviceAdvertisement & { isConfigured: boolean; configuredName?: string })[];
  } {
    const timeRemaining = this.scanStartTime 
      ? Math.max(0, this.SCAN_DURATION_MS - (Date.now() - this.scanStartTime))
      : 0;

    const configuredDevices = getRootOptions().devices || [];
    const devices = Array.from(this.discoveredDevices).map(device => ({
      ...device,
      isConfigured: configuredDevices.some((d: OctoDevice) => d.name.toLowerCase() === device.address.toString().toLowerCase()),
      configuredName: configuredDevices.find((d: OctoDevice) => d.name.toLowerCase() === device.address.toString().toLowerCase())?.name
    }));

    return {
      isScanning: this.scanStartTime !== null && timeRemaining > 0,
      scanTimeRemaining: timeRemaining,
      discoveredDevices: this.discoveredDevices.size,
      devices
    };
  }

  public async startScan(): Promise<void> {
    if (this.scanStartTime !== null) {
      logInfo('[BLEScanner] Scan already in progress');
      return;
    }

    this.scanStartTime = Date.now();
    this.discoveredDevices.clear();

    try {
      await this.espConnection.startBleScan(
        this.SCAN_DURATION_MS,
        (device) => {
          this.discoveredDevices.add(device);
          logInfo(`[BLEScanner] Found device: ${device.name} (${device.address})`);
        }
      );
      logInfo('[BLEScanner] BLE scan started');

      // Stop scan after duration
      setTimeout(async () => {
        await this.stopScan();
      }, this.SCAN_DURATION_MS);

    } catch (error) {
      logInfo('[BLEScanner] Failed to start BLE scan:', error);
      this.scanStartTime = null;
      throw error;
    }
  }

  public async stopScan(): Promise<void> {
    if (this.scanStartTime === null) {
      logInfo('[BLEScanner] No scan in progress');
      return;
    }

    try {
      await this.espConnection.stopBleScan();
      logInfo('[BLEScanner] BLE scan stopped');
    } catch (error) {
      logInfo('[BLEScanner] Failed to stop BLE scan:', error);
      throw error;
    } finally {
      this.scanStartTime = null;
    }
  }
} 