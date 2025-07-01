import { IMQTTConnection } from '../MQTT/IMQTTConnection';
import { IESPConnection } from '../ESPHome/IESPConnection';
import { getDevices } from './options';
import { buildDictionary } from '../Utils/buildDictionary';
import { logInfo, logError, logWarn } from '../Utils/logger';
import { BLEController } from '../BLE/BLEController';
import { setupDeviceInfoSensor } from '../BLE/setupDeviceInfoSensor';
import { buildMQTTDeviceData } from '../Common/buildMQTTDeviceData';
import { calculateChecksum } from './calculateChecksum';
import { extractFeatureValuePairFromData } from './extractFeaturesFromData';
import { extractPacketFromMessage } from './extractPacketFromMessage';
import { setupLightSwitch } from './setupLightSwitch';
import { setupMotorEntities } from './setupMotorEntities';
import { Deferred } from '../Utils/deferred';
import { byte } from '../Utils/byte';
import { OctoDevice } from './options';
import { BLEDeviceAdvertisement } from '../BLE/BLEController';

export type Command = {
  command: number[];
  data?: number[];
};

const buildComplexCommand = ({ command, data }: Command) => {
  const dataLen = data?.length || 0;

  const bytes = [
    0x40,
    ...command,
    dataLen >> 8,
    dataLen,
    0x0, // checksum byte
    ...(data || []),
    0x40,
  ].map(byte);
  bytes[5] = calculateChecksum(bytes);
  return bytes;
};

// Add a timeout for feature requests - time to wait for features before moving on
const FEATURE_REQUEST_TIMEOUT_MS = 15000; // 15 seconds

export const octo = async (mqtt: IMQTTConnection, esphome: IESPConnection) => {
  const devices = getDevices();
  if (!devices.length) return logInfo('[Octo] No devices configured');

  // Build device map using either mac or name as key
  const devicesMap = buildDictionary<OctoDevice, OctoDevice>(devices, (device: OctoDevice) => {
    const key = device.mac || device.name || '';
    return { key: key.toLowerCase(), value: device };
  });
  
  const deviceIdentifiers = Object.keys(devicesMap);
  if (deviceIdentifiers.length !== devices.length) return logError('[Octo] Duplicate identifier detected in configuration');
  
  logInfo(`[Octo] Looking for devices with identifiers: ${deviceIdentifiers.join(', ')}`);
  
  // Add more detailed logging for device discovery
  logInfo(`[Octo] Starting device discovery with ${deviceIdentifiers.length} identifier(s)`);
  logInfo(`[Octo] Device identifiers: ${JSON.stringify(deviceIdentifiers)}`);
  
  const bleDevices = await esphome.getBLEDevices(deviceIdentifiers);
  
  logInfo(`[Octo] Device discovery completed. Found ${bleDevices.length} device(s)`);
  bleDevices.forEach((device, index) => {
    logInfo(`[Octo] Device ${index + 1}: ${device.name} (${device.mac})`);
  });
  
  // If no devices found by name, try enhanced scan with MAC/PIN filtering
  if (bleDevices.length === 0) {
    logWarn('[Octo] No devices found by name, trying enhanced scan with MAC/PIN filtering...');
    
    // Get scan duration from configuration
    const scanDuration = process.env.OCTO_SCAN_DURATION ? parseInt(process.env.OCTO_SCAN_DURATION) : 15000;
    logInfo(`[Octo] Starting enhanced scan for ${scanDuration}ms with MAC/PIN filtering...`);
    
    // Start a scan to look for RC2 devices with enhanced filtering
    const discoveredDevices: BLEDeviceAdvertisement[] = [];
    await esphome.startBleScan(scanDuration, (device) => {
      logInfo(`[Octo] Found target device during enhanced scan: ${device.name} (${device.address})`);
      
      // The enhanced filtering is now handled in ESPConnection.ts
      // This callback will only be called for devices that pass the MAC/PIN filter
      discoveredDevices.push(device);
    });
    
    if (discoveredDevices.length > 0) {
      logInfo(`[Octo] Found ${discoveredDevices.length} target device(s) during enhanced scan`);
      
      // Try to connect to the first target device found
      const firstDevice = discoveredDevices[0];
      logInfo(`[Octo] Attempting to connect to target device: ${firstDevice.name} (${firstDevice.address})`);
      
      // Create a mock device for connection attempt
      const mockDevice = {
        name: firstDevice.name,
        mac: firstDevice.address.toString(16).padStart(12, '0'),
        address: firstDevice.address,
        connect: async () => {
          logInfo(`[Octo] Mock connection to ${firstDevice.name}`);
        },
        disconnect: async () => {
          logInfo(`[Octo] Mock disconnection from ${firstDevice.name}`);
        },
        getCharacteristic: async () => {
          return { handle: 0x0B };
        },
        getDeviceInfo: async () => {
          return { name: firstDevice.name, mac: firstDevice.address.toString(16) };
        }
      };
      
      // Add to bleDevices array for processing
      bleDevices.push(mockDevice as any);
    } else {
      logWarn('[Octo] No target devices found during enhanced scan');
      logWarn('[Octo] Check your MAC/PIN configuration and ensure the ESPHome BLE proxy is working');
    }
  }

  for (const bleDevice of bleDevices) {
    const { name, mac, address, connect, disconnect, getCharacteristic } = bleDevice;
    const { pin, ...device } = devicesMap[mac] || devicesMap[name.toLowerCase()];
    const deviceData = buildMQTTDeviceData({ 
      ...device, 
      name: device.name || device.mac || 'Unknown Device',
      address 
    }, 'Octo');
    await connect();

    const characteristic = await getCharacteristic(
      '0000ffe0-0000-1000-8000-00805f9b34fb',
      '0000ffe1-0000-1000-8000-00805f9b34fb'
    );
    if (!characteristic) {
      await disconnect();
      continue;
    }

    const controller = new BLEController(
      deviceData,
      bleDevice,
      characteristic.handle,
      (command: number[] | Command) => buildComplexCommand(Array.isArray(command) ? { command: command } : command),
      {
        feedback: characteristic.handle,
      }
    );

    const featureState = { hasLight: false, lightState: false, hasPin: false, pinLock: false };
    const allFeaturesReturned = new Deferred<void>();

    const loadFeatures = (message: Uint8Array) => {
      const packet = extractPacketFromMessage(message);
      if (!packet) return;
      const { command, data } = packet;
      if (command[0] == 0x21 && command[1] == 0x71) {
        // features
        const featureValue = extractFeatureValuePairFromData(data);
        if (featureValue == null) return;

        const { feature, value } = featureValue;
        switch (feature) {
          case 0x3:
            featureState.hasPin = value[0] == 0x1;
            featureState.pinLock = value[1] !== 0x1;
            return;
          case 0x102:
            featureState.hasLight = true;
            featureState.lightState = value[0] == 0x1;
            return;
          case 0xffffff:
            return allFeaturesReturned.resolve();
        }
      }
    };
    controller.on('feedback', loadFeatures);

    logInfo('[Octo] Requesting features for device:', name);
    controller.writeCommand([0x21, 0x71]);

    try {
      await Promise.race([
        allFeaturesReturned,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Feature request timeout')), FEATURE_REQUEST_TIMEOUT_MS))
      ]);
      logInfo('[Octo] Features loaded successfully for device:', name);
    } catch (error) {
      logWarn('[Octo] Feature request failed or timed out for device:', name, error);
      // Continue anyway - we'll work with what we have
    }

    controller.off('feedback', loadFeatures);

    if (featureState.hasLight) {
      setupLightSwitch(mqtt, controller, featureState.lightState);
    }

    setupMotorEntities(mqtt, controller);

    if (featureState.hasPin && featureState.pinLock && pin) {
      logInfo('[Octo] Device is PIN locked, attempting to unlock with PIN:', pin);
      controller.writeCommand([0x21, 0x72, ...pin.split('').map(Number)]);
    }

    setupDeviceInfoSensor(mqtt, controller, mac, device.friendlyName, 'RC2', 'Ergomotion');
  }

  logInfo('[Octo] Octo devices initialized');
};
