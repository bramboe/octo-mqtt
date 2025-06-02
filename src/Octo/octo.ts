import { IMQTTConnection } from '../MQTT/IMQTTConnection';
import { buildDictionary } from '../Utils/buildDictionary';
import { Deferred } from '../Utils/deferred';
import { logError, logInfo, logWarn } from '../Utils/logger';
import { BLEController } from '../BLE/BLEController';
import { setupDeviceInfoSensor } from '../BLE/setupDeviceInfoSensor';
import { buildMQTTDeviceData } from '../Common/buildMQTTDeviceData';
import { IESPConnection } from '../ESPHome/IESPConnection';
import { calculateChecksum } from './calculateChecksum';
import { extractFeatureValuePairFromData } from './extractFeaturesFromData';
import { extractPacketFromMessage } from './extractPacketFromMessage';
import { getDevices } from './options';
import { setupLightSwitch } from './setupLightSwitch';
import { setupMotorEntities } from './setupMotorEntities';
import { byte } from '../Utils/byte';

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

// Add maximum retry attempts
const MAX_FEATURE_REQUEST_ATTEMPTS = 3;

export const octo = async (mqtt: IMQTTConnection, esphome: IESPConnection) => {
  const devices = getDevices();
  if (!devices.length) return logInfo('[Octo] No devices configured');

  const devicesMap = buildDictionary(devices, (device) => ({ key: device.name.toLowerCase(), value: device }));
  const deviceNames = Object.keys(devicesMap);
  if (deviceNames.length !== devices.length) return logError('[Octo] Duplicate name detected in configuration');
  const bleDevices = await esphome.getBLEDevices(deviceNames);
  for (const bleDevice of bleDevices) {
    const { name, mac, address, connect, disconnect, getCharacteristic, getDeviceInfo } = bleDevice;
    const { pin, ...device } = devicesMap[mac] || devicesMap[name.toLowerCase()];
    const deviceData = buildMQTTDeviceData({ ...device, address }, 'Octo');
    await connect();

    const characteristic = await getCharacteristic(
      '0000ffe0-0000-1000-8000-00805f9b34fb',
      '0000ffe1-0000-1000-8000-00805f9b34fb'
    );
    if (!characteristic) {
      logWarn(`[Octo] Could not find required characteristic for device ${name}`);
      await disconnect();
      continue;
    }

    logInfo(`[Octo] Found characteristic with handle: ${characteristic.handle}`);

    // Create the BLE controller
    const controller = new BLEController(
      deviceData,
      bleDevice,
      characteristic.handle,
      (command: number[] | Command) => buildComplexCommand(Array.isArray(command) ? { command: command } : command),
      {
        feedback: characteristic.handle,
      },
      pin
    );

    // Set up feature detection
    const featureState = { hasLight: false, lightState: false, hasPin: false, pinLock: false };
    let currentAttempt = 0;
    let featuresReceived = false;

    // Function to request features and wait with retry logic
    const requestFeatures = async () => {
      currentAttempt++;
      
      logInfo(`[Octo] Requesting features for device ${name} (attempt ${currentAttempt}/${MAX_FEATURE_REQUEST_ATTEMPTS})`);
      
      const allFeaturesReturned = new Deferred<void>();
      
      // Add timeout for feature request
      const featureRequestTimeout = setTimeout(() => {
        if (!featuresReceived) {
          logWarn(`[Octo] Timeout waiting for features from device ${name}, attempt ${currentAttempt}/${MAX_FEATURE_REQUEST_ATTEMPTS}`);
          allFeaturesReturned.resolve();
        }
      }, FEATURE_REQUEST_TIMEOUT_MS);

      const loadFeatures = (message: Uint8Array) => {
        logInfo(`[Octo] Received data from device: ${Array.from(message).map(b => b.toString(16)).join(' ')}`);
        
        const packet = extractPacketFromMessage(message);
        if (!packet) {
          logWarn(`[Octo] Failed to extract packet from message`);
          return;
        }
        
        const { command, data } = packet;
        logInfo(`[Octo] Extracted packet - command: ${command.map(b => b.toString(16)).join(' ')}, data length: ${data.length}`);
        
        if (command[0] == 0x21 && command[1] == 0x71) {
          // features
          logInfo(`[Octo] Received feature data: ${JSON.stringify(Array.from(data))}`);
          const featureValue = extractFeatureValuePairFromData(data);
          if (featureValue == null) {
            logWarn(`[Octo] Failed to extract feature value from data`);
            return;
          }

          featuresReceived = true;
          const { feature, value } = featureValue;
          logInfo(`[Octo] Parsed feature: ${feature.toString(16)}, value: ${JSON.stringify(Array.from(value))}`);
          
          switch (feature) {
            case 0x3:
              featureState.hasPin = value[0] == 0x1;
              featureState.pinLock = value[1] !== 0x1;
              logInfo(`[Octo] Has PIN: ${featureState.hasPin}, PIN locked: ${featureState.pinLock}`);
              return;
            case 0x102:
              featureState.hasLight = true;
              featureState.lightState = value[0] == 0x1;
              logInfo(`[Octo] Has light: ${featureState.hasLight}, light state: ${featureState.lightState}`);
              return;
            case 0xffffff:
              logInfo(`[Octo] End of features marker received`);
              clearTimeout(featureRequestTimeout);
              return allFeaturesReturned.resolve();
          }
        } else {
          logInfo(`[Octo] Received non-feature packet with command: ${command.map(b => b.toString(16)).join(' ')}`);
        }
      };
      
      controller.on('feedback', loadFeatures);

      try {
        // Send the feature request command
        await controller.writeCommand([0x20, 0x71]);
        await allFeaturesReturned;
      } catch (error) {
        logError(`[Octo] Error requesting features: ${error}`);
      } finally {
        clearTimeout(featureRequestTimeout);
        controller.off('feedback', loadFeatures);
      }

      // If we didn't receive any features and haven't reached max attempts, try again
      if (!featuresReceived && currentAttempt < MAX_FEATURE_REQUEST_ATTEMPTS) {
        logInfo(`[Octo] Retrying feature request for device ${name}`);
        return requestFeatures();
      }
      
      // If we tried max attempts and still didn't get features, continue with defaults
      if (!featuresReceived) {
        logWarn(`[Octo] Failed to get features after ${MAX_FEATURE_REQUEST_ATTEMPTS} attempts, continuing with defaults`);
      }
    };

    // Request features
    await requestFeatures();

    // Handle PIN if needed
    if (featureState.hasPin && featureState.pinLock) {
      if (pin?.length !== 4) {
        logError('[Octo] 4 Digit Numeric Pin Required But Not Provided');
        await disconnect();
        continue;
      }
      logInfo('[Octo] Sending PIN to unlock device');
      try {
        // Set PIN for keep-alive
        controller.setPin(pin);
        
        // Send initial PIN command
        await controller.writeCommand({ command: [0x20, 0x43], data: pin.split('').map((c) => parseInt(c)) });
        logInfo('[Octo] PIN sent successfully, device unlocked');
      } catch (error) {
        logError(`[Octo] Error sending PIN: ${error}`);
        await disconnect();
        continue;
      }
    }

    logInfo('[Octo] Setting up entities for device:', name);
    const deviceInfo = await getDeviceInfo();
    if (deviceInfo) setupDeviceInfoSensor(mqtt, controller, deviceInfo);

    if (featureState.hasLight) {
      setupLightSwitch(mqtt, controller, featureState.lightState);
    }
    setupMotorEntities(mqtt, {
      cache: controller.cache,
      deviceData: controller.deviceData,
      writeCommand: (command, _count?, _waitTime?) => controller.writeCommand(command),
      writeCommands: (commands, count?, _waitTime?) => controller.writeCommands(commands, count),
      cancelCommands: () => controller.cancelCommands()
    });
  }
};
