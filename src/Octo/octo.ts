import { IMQTTConnection } from '../MQTT/IMQTTConnection';
import { IESPConnection } from '../ESPHome/IESPConnection';
import { logInfo, logError, logWarn } from '../Utils/logger';
import { buildMQTTDeviceData } from '../Common/buildMQTTDeviceData';
import { setupDeviceInfoSensor } from '../BLE/setupDeviceInfoSensor';
import { setupMotorEntities } from './setupMotorEntities';
import { setupMassageEntities } from './setupMassageEntities';
import { setupPresetEntities } from './setupPresetEntities';
import { setupLightEntities } from './setupLightEntities';
import { setupUnderBedLightEntities } from './setupUnderBedLightEntities';
import { setupZeroGravityEntities } from './setupZeroGravityEntities';
import { setupAntiSnoreEntities } from './setupAntiSnoreEntities';
import { setupMemoryPositionEntities } from './setupMemoryPositionEntities';
import { setupFlatEntities } from './setupFlatEntities';
import { setupStorage } from './setupStorage';
import { BLEController } from '../BLE/BLEController';
import { getRootOptions } from '../Utils/options';
import { buildDictionary } from '../Utils/buildDictionary';
import { getDevices } from './options';
import { OctoDevice } from '../Utils/options';
import { IDeviceData } from '../HomeAssistant/IDeviceData';
import { Deferred } from '../Utils/deferred';
import { extractFeatureValuePairFromData } from './extractFeaturesFromData';
import { extractPacketFromMessage } from './extractPacketFromMessage';
import { setupLightSwitch } from './setupLightSwitch';
import { setupDeviceInfoSensor as oldSetupDeviceInfoSensor } from '../BLE/setupDeviceInfoSensor';
import { BLEDeviceInfo } from '../ESPHome/types/BLEDeviceInfo';
import { MQTTDevicePlaceholder } from '@homeassistant/MQTTDevicePlaceholder';

// Add a timeout for feature requests - time to wait for features before moving on
const FEATURE_REQUEST_TIMEOUT_MS = 15000; // 15 seconds

// Add maximum retry attempts
const MAX_FEATURE_REQUEST_ATTEMPTS = 3;

export const octo = async (mqtt: IMQTTConnection, esphome: IESPConnection) => {
  const devices = getDevices();
  if (!devices.length) return logInfo('[Octo] No devices configured');

  const devicesMap = buildDictionary<OctoDevice, OctoDevice>(devices, (device) => ({ key: device.name.toLowerCase(), value: device }));
  const deviceNames = Object.keys(devicesMap);
  if (deviceNames.length !== devices.length) return logError('[Octo] Duplicate name detected in configuration');
  const bleDevices = await esphome.getBLEDevices(deviceNames);
  for (const bleDevice of bleDevices) {
    const { name, mac, address } = bleDevice;
    const device = devicesMap[mac] || devicesMap[name.toLowerCase()];
    if (!device) continue;
    
    const { pin, friendlyName } = device;
    const deviceData = buildMQTTDeviceData({
      friendlyName: friendlyName || name,
      name: device.name,
      address: mac
    }, 'Ergomotion');

    // Create the BLE controller
    const controller = new BLEController(esphome);
    controller.deviceData = deviceData;

    // Connect to the device
    const connectedDevice = await controller.connect(address);
    if (!connectedDevice) {
      logError(`[Octo] Failed to connect to device ${address}`);
      continue;
    }

    // Set up storage
    const storage = setupStorage(mqtt, controller);

    // Set up all entities
    await setupDeviceInfoSensor(mqtt, deviceData);
    await setupMotorEntities(mqtt, controller);
    await setupMassageEntities(mqtt, controller);
    await setupPresetEntities(mqtt, controller);
    await setupLightEntities(mqtt, controller);
    await setupUnderBedLightEntities(mqtt, controller);
    await setupZeroGravityEntities(mqtt, controller);
    await setupAntiSnoreEntities(mqtt, controller);
    await setupMemoryPositionEntities(mqtt, controller, storage);
    await setupFlatEntities(mqtt, controller);

    // Register to Home Assistant
    mqtt.publish(`homeassistant/device/${deviceData.deviceTopic}/config`, deviceData.device);
    logInfo('[Octo] Device setup complete for:', friendlyName || name);
  }
};

export const setupOctoDevice = async (
  mqtt: IMQTTConnection,
  controller: BLEController
) => {
  logInfo(`[Octo] Setting up device ${controller.deviceData.device.name}`);

  try {
    // Set up device info sensor
    await setupDeviceInfoSensor(mqtt, controller.deviceData);

    // Set up motor entities
    await setupMotorEntities(mqtt, controller);

    logInfo(`[Octo] Device ${controller.deviceData.device.name} setup complete`);
  } catch (error) {
    logError(`[Octo] Error setting up device ${controller.deviceData.device.name}:`, error);
    throw error;
  }
};

export const setupOcto = async (
  mqtt: IMQTTConnection,
  espConnection: IESPConnection
): Promise<void> => {
  logInfo('[Octo] Setting up Octo...');

  const options = getRootOptions();
  const firstDevice = options.octoDevices[0];
  if (!firstDevice) {
    throw new Error('No devices configured');
  }

  const deviceData = buildMQTTDeviceData({
    friendlyName: firstDevice.friendlyName || firstDevice.name,
    name: firstDevice.name,
    address: firstDevice.name
  }, 'Ergomotion');

  const controller = new BLEController(espConnection);
  controller.deviceData = deviceData;
  const storage = setupStorage(mqtt, controller);

  try {
    await setupDeviceInfoSensor(mqtt, deviceData);
    await setupMotorEntities(mqtt, controller);
    await setupMassageEntities(mqtt, controller);
    await setupPresetEntities(mqtt, controller);
    await setupLightEntities(mqtt, controller);
    await setupUnderBedLightEntities(mqtt, controller);
    await setupZeroGravityEntities(mqtt, controller);
    await setupAntiSnoreEntities(mqtt, controller);
    await setupMemoryPositionEntities(mqtt, controller, storage);
    await setupFlatEntities(mqtt, controller);
    logInfo('[Octo] Setup complete!');
  } catch (error) {
    logError('[Octo] Error during setup:', error);
    throw error;
  }
};

export class OctoMQTT {
  private bleController: BLEController;
  private deviceData?: IDeviceData;

  constructor(
    private mqtt: IMQTTConnection,
    private esphome: IESPConnection
  ) {
    this.bleController = new BLEController(esphome);
  }

  public async start(): Promise<void> {
    try {
      logInfo('[OctoMQTT] Starting...');

      // Get configured devices
      const config = getRootOptions();
      const deviceNames = config.octoDevices?.map(device => device.name.toLowerCase()) || [];

      // Connect to devices
      const bleDevices = await this.esphome.getBLEDevices(deviceNames);
      if (bleDevices.length === 0) {
        throw new Error('No devices found');
      }

      // Set up MQTT entities for each device
      for (const device of bleDevices) {
        const deviceInfo = await device.getDeviceInfo() || {};
        const mac = device.mac;
        const friendlyName = config.octoDevices?.find(d => d.name === device.name)?.friendlyName || device.name;
        const manufacturer = deviceInfo.manufacturerName || 'Ergomotion';

        // Build device data
        const deviceData = buildMQTTDeviceData({
          friendlyName,
          name: deviceInfo.modelNumber || 'RC2',
          address: mac
        }, manufacturer);

        // Create BLE controller
        const controller = new BLEController(this.esphome);
        controller.deviceData = deviceData;

        // Connect to the device
        const connectedDevice = await controller.connect(device.address);
        if (!connectedDevice) {
          logError(`[Octo] Failed to connect to device ${device.address}`);
          continue;
        }

        // Create storage
        const storage = setupStorage(this.mqtt, controller);

        // Set up all entities
        await setupDeviceInfoSensor(this.mqtt, deviceData);
        await setupMotorEntities(this.mqtt, controller);
        await setupMassageEntities(this.mqtt, controller);
        await setupPresetEntities(this.mqtt, controller);
        await setupLightEntities(this.mqtt, controller);
        await setupUnderBedLightEntities(this.mqtt, controller);
        await setupZeroGravityEntities(this.mqtt, controller);
        await setupAntiSnoreEntities(this.mqtt, controller);
        await setupMemoryPositionEntities(this.mqtt, controller, storage);
        await setupFlatEntities(this.mqtt, controller);

        // Register to Home Assistant
        this.mqtt.publish(`homeassistant/device/${deviceData.deviceTopic}/config`, deviceData.device);
        logInfo('[Octo] Device setup complete for:', friendlyName);
      }

      logInfo('[OctoMQTT] Started successfully');
    } catch (error) {
      logError('[OctoMQTT] Failed to start:', error);
      throw error;
    }
  }

  public async stop(): Promise<void> {
    try {
      logInfo('[OctoMQTT] Stopping...');
      await this.bleController.disconnectAll();
      logInfo('[OctoMQTT] Stopped successfully');
    } catch (error) {
      logError('[OctoMQTT] Failed to stop:', error);
      throw error;
    }
  }
}
