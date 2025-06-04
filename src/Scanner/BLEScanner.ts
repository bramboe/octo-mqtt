import { IESPConnection } from '../ESPHome/IESPConnection';
import { BLEDeviceAdvertisement } from '../BLE/BLEController';
import { logInfo } from '../Utils/logger';
import { getRootOptions } from '../Utils/options';

// Define the OctoDevice interface here to match the expected shape
interface OctoDevice {
  name: string;
  pin?: string;
}

export class BLEScanner {
  private scanStartTime: number | null = null;
  private readonly SCAN_DURATION_MS = 30000; // 30 seconds
  private discoveredDevices = new Set<BLEDeviceAdvertisement>();

  constructor(private readonly espConnection: IESPConnection) {}

  private normalizeAddress(address: number): string {
    return address.toString(16).padStart(12, '0').match(/.{2}/g)?.join(':') || '';
  }

  private compareAddresses(addr1: string, addr2: string): boolean {
    return addr1.replace(/[^0-9a-f]/gi, '').toLowerCase() === addr2.replace(/[^0-9a-f]/gi, '').toLowerCase();
  }

  public getScanStatus(): { 
    isScanning: boolean; 
    scanTimeRemaining: number; 
    discoveredDevices: number;
    devices: (BLEDeviceAdvertisement & { isConfigured: boolean; configuredName?: string })[];
  } {
    const timeRemaining = this.scanStartTime 
      ? Math.max(0, this.SCAN_DURATION_MS - (Date.now() - this.scanStartTime))
      : 0;

    const configuredDevices = getRootOptions().octoDevices || [];
    const devices = Array.from(this.discoveredDevices).map(device => {
      const normalizedDeviceAddr = this.normalizeAddress(device.address);
      return {
        ...device,
        isConfigured: configuredDevices.some((d: OctoDevice) => 
          d.name === device.name || (normalizedDeviceAddr && this.compareAddresses(d.name, normalizedDeviceAddr))
        ),
        configuredName: configuredDevices.find((d: OctoDevice) => 
          d.name === device.name || (normalizedDeviceAddr && this.compareAddresses(d.name, normalizedDeviceAddr))
        )?.name
      };
    });

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
        (device: BLEDeviceAdvertisement) => {
          this.discoveredDevices.add(device);
          logInfo(`[BLEScanner] Found device: ${device.name} (${this.normalizeAddress(device.address)})`);
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