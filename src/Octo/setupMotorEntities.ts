import { Cover } from '../HomeAssistant/Cover';
import { IMQTTConnection } from '../MQTT/IMQTTConnection';
import { buildEntityConfig } from '../Common/buildEntityConfig';
import { Command } from '../BLE/BLEController';
import { IController } from '../Common/IController';
import { Cancelable } from '../Common/Cancelable';
import { ICache } from '../Common/ICache';
import { logInfo, logError, logWarn } from '../Utils/logger';
import { Button } from '../HomeAssistant/Button';
import { BLEController } from '../BLE/BLEController';
import { buildMQTTDeviceData, Device } from '../Common/buildMQTTDeviceData';
import { buildComplexCommand } from './commands';
import { OctoStorage, OctoStorageData } from './storage';
import { MQTTDevicePlaceholder } from '../HomeAssistant/MQTTDevicePlaceholder';

interface MotorState {
  head?: Button;
  legs?: Button;
  readingButton?: Button;
}

interface Directional {
  direction: string;
}

interface Cache {
  motorState?: MotorState & Directional & Cancelable;
  headMotor?: Cover;
  legsMotor?: Cover;
  flatButton?: Button;
  zeroGButton?: Button;
  tvButton?: Button;
  readingButton?: Button;
}

// Define a placeholder for MQTTItemConfig
export interface MQTTItemConfigPlaceholder extends Record<string, any> {
  name: string;
  command_topic?: string;
  state_topic?: string;
  position_topic?: string;
  set_position_topic?: string;
  availability?: { topic: string }[];
  payload_available?: string;
  payload_not_available?: string;
}

interface StorageData {
  headPosition: number;
  legsPosition: number;
  headUpDuration: number;
  feetUpDuration: number;
}

const motorPairs: Record<keyof Pick<MotorState, 'head' | 'legs'>, keyof Pick<MotorState, 'head' | 'legs'>> = {
  head: 'legs',
  legs: 'head'
};

const DEFAULT_UP_DURATION_MS = 30000;

// Add preset positions similar to ESPHome implementation
const PRESETS = {
  FLAT: { head: 0, legs: 0 },
  ZERO_G: { head: 15, legs: 30 },
  TV: { head: 45, legs: 5 },
  READING: { head: 60, legs: 10 }
};

export const setupMotorEntities = (mqtt: IMQTTConnection, controller: BLEController) => {
  const deviceData = buildMQTTDeviceData({
    friendlyName: controller.deviceData.device.name,
    name: controller.deviceData.device.mdl,
    address: controller.deviceData.device.ids[0]
  }, 'Octo');
  
  const deviceId = deviceData.deviceTopic;

  // Head motor
  const headConfig = {
    name: 'Head Motor',
    unique_id: `${deviceId}_head_motor`,
    device: deviceData.device,
    command_topic: `homeassistant/cover/${deviceId}/head/set`,
    position_topic: `homeassistant/cover/${deviceId}/head/position`,
    state_topic: `homeassistant/cover/${deviceId}/head/state`,
    device_class: 'motor',
    payload_open: 'OPEN',
    payload_close: 'CLOSE',
    payload_stop: 'STOP',
    position_open: 100,
    position_closed: 0,
    optimistic: false,
    retain: true
  };

  mqtt.publish(
    `homeassistant/cover/${deviceId}/head/config`,
    headConfig
  );

  // Feet motor
  const feetConfig = {
    name: 'Feet Motor',
    unique_id: `${deviceId}_feet_motor`,
    device: deviceData.device,
    command_topic: `homeassistant/cover/${deviceId}/feet/set`,
    position_topic: `homeassistant/cover/${deviceId}/feet/position`,
    state_topic: `homeassistant/cover/${deviceId}/feet/state`,
    device_class: 'motor',
    payload_open: 'OPEN',
    payload_close: 'CLOSE',
    payload_stop: 'STOP',
    position_open: 100,
    position_closed: 0,
    optimistic: false,
    retain: true
  };

  mqtt.publish(
    `homeassistant/cover/${deviceId}/feet/config`,
    feetConfig
  );

  // Subscribe to command topics
  mqtt.subscribe(headConfig.command_topic);
  mqtt.subscribe(feetConfig.command_topic);

  // Handle commands
  mqtt.on(headConfig.command_topic, async (message) => {
    logInfo(`[MotorEntities] Head motor command: ${message}`);
    const command = buildComplexCommand({ command: [0x20, message === 'OPEN' ? 0x01 : message === 'CLOSE' ? 0x02 : 0x03] });
    await controller.writeCommand(command);
    mqtt.publish(headConfig.state_topic, message);
  });

  mqtt.on(feetConfig.command_topic, async (message) => {
    logInfo(`[MotorEntities] Feet motor command: ${message}`);
    const command = buildComplexCommand({ command: [0x20, message === 'OPEN' ? 0x04 : message === 'CLOSE' ? 0x05 : 0x06] });
    await controller.writeCommand(command);
    mqtt.publish(feetConfig.state_topic, message);
  });

  logInfo('[MotorEntities] Motor entities setup complete');
};
