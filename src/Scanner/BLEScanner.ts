import { IESPConnection } from '../ESPHome/IESPConnection';
import { BLEDeviceAdvertisement } from '../BLE/BLEController';
import { logError, logInfo, logWarn } from '../Utils/logger';
import { getRootOptions } from '../Utils/options';

export class BLEScanner {
  private isScanning: boolean = false;
  private scanStartTime: number | null = null;
  private readonly SCAN_DURATION_MS = 30000; // 30 seconds
  private discoveredDevices = new Set<BLEDeviceAdvertisement>();

  constructor(private espConnection: IESPConnection) {}

  public getScanStatus(): { 
    isScanning: boolean; 
    scanTimeRemaining: number; 
    discoveredDevices: number;
    devices: (BLEDeviceAdvertisement & { isConfigured: boolean; configuredName?: string })[];
  } {
    const timeRemaining = this.scanStartTime 
      ? Math.max(0, this.SCAN_DURATION_MS - (Date.now() - this.scanStartTime))
      : 0;

    // Get configured devices from the addon configuration
    const config = getRootOptions();
    const configuredDevices = config.octoDevices || [];
    
    logInfo(`[BLEScanner DEBUG] getScanStatus called. Found ${configuredDevices.length} configured devices:`);
    configuredDevices.forEach((device: any, index: number) => {
      logInfo(`[BLEScanner DEBUG] Configured device ${index}: name="${device.name}", friendlyName="${device.friendlyName}"`);
    });

    const devicesWithStatus = Array.from(this.discoveredDevices).map(device => {
      // Convert numeric address to string for comparison
      const deviceAddress = device.address.toString(16).toLowerCase();
      
      const isConfigured = configuredDevices.some((configDevice: any) => 
        deviceAddress === configDevice.name.toLowerCase()
      );

      const configuredDevice = configuredDevices.find((configDevice: any) => 
        deviceAddress === configDevice.name.toLowerCase()
      );

      return {
        ...device,
        isConfigured,
        configuredName: configuredDevice?.friendlyName || configuredDevice?.name
      };
    });

    return {
      isScanning: this.isScanning,
      scanTimeRemaining: timeRemaining,
      discoveredDevices: this.discoveredDevices.size,
      devices: devicesWithStatus
    };
  }
} 