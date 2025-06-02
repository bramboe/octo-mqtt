import { IMQTTConnection } from '@mqtt/IMQTTConnection';
// Assuming MQTTDevice is a general type, will use a placeholder if not found
// import { MQTTDevice } from '@mqtt/MQTTDevice'; 
// Assuming MQTTItemConfig is a general type for Home Assistant MQTT discovery
// import { HomeAssistantMQTTItem, MQTTItemConfig } from '@mqtt/MQTTCover';
import { logInfo, logError, logWarn } from '@utils/logger';
import { OctoStorage } from './storage';
import { BLEController } from 'BLE/BLEController'; // Assuming this is the correct path
import * as Commands from './commands';
import { byte } from '@utils/byte';
import { calculateChecksum } from './calculateChecksum';

// Define a placeholder for MQTTDevice if not available
export interface MQTTDevicePlaceholder {
  identifiers: string[];
  name: string;
  model: string;
  manufacturer: string;
  sw_version?: string;
  availability_topic?: string; // Added for availability
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

const buildComplexCommand = ({ command, data }: { command: number[]; data?: number[] }) => {
  const dataLen = data?.length || 0;
  const bytes = [0x40, ...command, dataLen >> 8, dataLen, 0x0, ...(data || []), 0x40].map(byte);
  bytes[5] = calculateChecksum(bytes);
  return bytes;
};

const COMMAND_TIMEOUT = 5000; // 5 seconds for commands to complete or be considered timed out
const POSITION_UPDATE_INTERVAL = 250; // ms, how often to update position during movement

interface OctoControllerMinimal {
  writeCommand(command: number[] | { command: number[]; data?: number[] }): Promise<void>;
  on(event: 'feedback', listener: (message: Uint8Array) => void): void;
  off(event: 'feedback', listener: (message: Uint8Array) => void): void;
  deviceData: MQTTDevicePlaceholder; // Using placeholder
  setPin(pin: string): void;
}

interface ActuatorState {
  isMoving: boolean;
  moveTimeoutId: NodeJS.Timeout | null;
  positionUpdateIntervalId: NodeJS.Timeout | null;
  startTime: number;
  startPosition: number;
  targetPosition: number;
  calibrationMode: 'head' | 'feet' | null;
  calibrationTimeoutId: NodeJS.Timeout | null;
}

const initialActuatorState = (): ActuatorState => ({
  isMoving: false,
  moveTimeoutId: null,
  positionUpdateIntervalId: null,
  startTime: 0,
  startPosition: 0,
  targetPosition: 0,
  calibrationMode: null,
  calibrationTimeoutId: null,
});

let headState = initialActuatorState();
let feetState = initialActuatorState();
let keepAliveIntervalId: NodeJS.Timeout | null = null;

const publishDeviceConfig = (
  mqtt: IMQTTConnection,
  device: MQTTDevicePlaceholder, // Using placeholder
  entityId: string,
  component: string,
  config: Record<string, any>
) => {
  const availabilityTopic = device.availability_topic || `octo/${device.identifiers[0]}/status`;
  const discoveryTopic = `homeassistant/${component}/${device.identifiers[0]}/${entityId}/config`;
  const fullConfig = {
    ...config,
    uniq_id: `${device.identifiers[0]}_${entityId}`,
    name: `${config.name_prefix || device.name} ${config.name || entityId.replace(/_/g, ' ')}`,
    device,
    availability: [{ topic: availabilityTopic }], 
    payload_available: 'online',
    payload_not_available: 'offline',
  };
  mqtt.publish(discoveryTopic, JSON.stringify(fullConfig));
};

const sendBleCommand = async (bleController: OctoControllerMinimal, command: number[] | { command: number[]; data?: number[] }) => {
  try {
    await bleController.writeCommand(command);
  } catch (error) {
    logError('[MQTTEntities] Error sending BLE command:', error);
    throw error;
  }
};

const updateAndPublishPosition = (
  mqtt: IMQTTConnection,
  storage: OctoStorage,
  actuator: 'head' | 'feet',
  currentPos: number,
  deviceIdentifier: string
) => {
  const position = Math.max(0, Math.min(100, Math.round(currentPos)));
  if (actuator === 'head') {
    storage.set('head_current_position', position);
  } else {
    storage.set('feet_current_position', position);
  }
  const stateTopic = `octo/${deviceIdentifier}/${actuator}_cover/state`;
  const positionTopic = `octo/${deviceIdentifier}/${actuator}_cover/position`;
  mqtt.publish(stateTopic, position > 0 ? 'open' : 'closed');
  mqtt.publish(positionTopic, position.toString());
};

const stopMovement = (
  actuatorState: ActuatorState,
  mqtt: IMQTTConnection,
  storage: OctoStorage,
  actuator: 'head' | 'feet',
  bleController: OctoControllerMinimal | null, // Allow null for cleanup scenario
  deviceIdentifier: string,
  isCalibrationStop: boolean = false
) => {
  if (actuatorState.moveTimeoutId) clearTimeout(actuatorState.moveTimeoutId);
  if (actuatorState.positionUpdateIntervalId) clearInterval(actuatorState.positionUpdateIntervalId);
  actuatorState.isMoving = false;
  actuatorState.moveTimeoutId = null;
  actuatorState.positionUpdateIntervalId = null;

  if (bleController) {
    sendBleCommand(bleController, Commands.STOP_MOVEMENT).catch((err) => logError('Failed to send STOP command during stopMovement', err));
  }

  if (!isCalibrationStop) { // Only update position based on timing if it's not a calibration stop (where position becomes 100%)
    const duration = storage.get(actuator === 'head' ? 'head_up_duration' : 'feet_up_duration');
    if (actuatorState.startTime > 0 && duration > 0) { // Ensure startTime and duration are valid
        const elapsed = Date.now() - actuatorState.startTime;
        let change = (elapsed / duration) * 100;
        if (actuatorState.targetPosition < actuatorState.startPosition) change = -change; 

        let finalPosition = actuatorState.startPosition + change;
        finalPosition = Math.max(0, Math.min(100, finalPosition));
        updateAndPublishPosition(mqtt, storage, actuator, finalPosition, deviceIdentifier);
        logInfo(`[MQTTEntities] ${actuator} movement stopped. Final position: ${finalPosition}%`);
    } else {
        // If timing info is not reliable, just update with current target (or last known if that's better)
        updateAndPublishPosition(mqtt, storage, actuator, actuatorState.targetPosition, deviceIdentifier);
        logWarn(`[MQTTEntities] ${actuator} movement stopped, but timing info was unreliable. Set to target: ${actuatorState.targetPosition}%`);
    }
  }
};

const startTimedMovement = (
  actuatorState: ActuatorState,
  mqtt: IMQTTConnection,
  storage: OctoStorage,
  actuator: 'head' | 'feet',
  targetPos: number,
  bleController: OctoControllerMinimal,
  deviceIdentifier: string
) => {
  if (actuatorState.isMoving) {
    logWarn(`[MQTTEntities] ${actuator} is already moving. Ignoring command.`);
    return;
  }

  const currentPos = storage.get(actuator === 'head' ? 'head_current_position' : 'feet_current_position');
  const durationFull = storage.get(actuator === 'head' ? 'head_up_duration' : 'feet_up_duration');

  if (durationFull <=0) {
      logError(`[MQTTEntities] ${actuator} calibration duration is not valid (${durationFull}ms). Please calibrate first.`);
      return;
  }

  if (Math.abs(currentPos - targetPos) < 1) { 
    updateAndPublishPosition(mqtt, storage, actuator, currentPos, deviceIdentifier);
    return;
  }

  actuatorState.isMoving = true;
  actuatorState.startTime = Date.now();
  actuatorState.startPosition = currentPos;
  actuatorState.targetPosition = targetPos;

  const positionDifference = Math.abs(targetPos - currentPos);
  const moveDur = (positionDifference / 100) * durationFull;

  if (moveDur <= 0) { // Should not happen if durationFull is >0 and there's a position difference
      logWarn(`[MQTTEntities] Calculated move duration for ${actuator} is zero or negative. Aborting movement.`);
      actuatorState.isMoving = false;
      updateAndPublishPosition(mqtt, storage, actuator, currentPos, deviceIdentifier); // Report current position
      return;
  }

  const command = targetPos > currentPos
    ? (actuator === 'head' ? Commands.HEAD_UP : Commands.FEET_UP)
    : (actuator === 'head' ? Commands.HEAD_DOWN : Commands.FEET_DOWN);

  logInfo(`[MQTTEntities] Starting ${actuator} movement from ${currentPos}% to ${targetPos}%. Estimated duration: ${moveDur.toFixed(0)}ms`);
  sendBleCommand(bleController, command);

  if (actuatorState.positionUpdateIntervalId) clearInterval(actuatorState.positionUpdateIntervalId);
  actuatorState.positionUpdateIntervalId = setInterval(() => {
    if (!actuatorState.isMoving) {
      if (actuatorState.positionUpdateIntervalId) clearInterval(actuatorState.positionUpdateIntervalId);
      return;
    }
    const elapsed = Date.now() - actuatorState.startTime;
    let progress = elapsed / moveDur; 
    progress = Math.min(1, progress); 

    let newPosition = actuatorState.startPosition + (targetPos - actuatorState.startPosition) * progress;
    newPosition = Math.max(0, Math.min(100, newPosition));
    updateAndPublishPosition(mqtt, storage, actuator, newPosition, deviceIdentifier);

    if (progress >= 1) {
      stopMovement(actuatorState, mqtt, storage, actuator, bleController, deviceIdentifier);
    }
  }, POSITION_UPDATE_INTERVAL);

  if (actuatorState.moveTimeoutId) clearTimeout(actuatorState.moveTimeoutId);
  actuatorState.moveTimeoutId = setTimeout(() => {
    if (actuatorState.isMoving) {
      logWarn(`[MQTTEntities] ${actuator} movement timed out.`);
      stopMovement(actuatorState, mqtt, storage, actuator, bleController, deviceIdentifier);
    }
  }, moveDur + 1000); 
};


export const setupOctoMqttEntities = (
  mqtt: IMQTTConnection,
  bleController: OctoControllerMinimal,
  storage: OctoStorage,
  devicePin: string | undefined,
  mqttDeviceData: MQTTDevicePlaceholder // Explicitly pass the device data
) => {
  const device = mqttDeviceData; // Use the passed device data
  const deviceIdentifier = device.identifiers[0];
  device.availability_topic = `octo/${deviceIdentifier}/status`; // Ensure availability topic is set

  // --- Covers (Head, Feet, Both) ---
  ['head', 'feet', 'both'].forEach(part => {
    const isBoth = part === 'both';
    const currentActuatorState = part === 'head' ? headState : (part === 'feet' ? feetState : initialActuatorState());

    const coverConfig: MQTTItemConfigPlaceholder = {
      name_prefix: '', // Keep HA default naming: <Device Name> <Entity Name>
      name: isBoth ? 'Bed Position' : `${part.charAt(0).toUpperCase() + part.slice(1)} Position`,
      command_topic: `octo/${deviceIdentifier}/${part}_cover/set`,
      position_topic: `octo/${deviceIdentifier}/${part}_cover/position`,
      state_topic: `octo/${deviceIdentifier}/${part}_cover/state`,
      set_position_topic: `octo/${deviceIdentifier}/${part}_cover/set_position`,
      device_class: 'shutter',
      payload_open: 'OPEN',
      payload_close: 'CLOSE',
      payload_stop: 'STOP',
      position_open: 100,
      position_closed: 0,
      optimistic: false,
    };
    publishDeviceConfig(mqtt, device, `${part}_cover`, 'cover', coverConfig);
    
    if (!isBoth) {
        const initialPos = storage.get(part === 'head' ? 'head_current_position' : 'feet_current_position');
        updateAndPublishPosition(mqtt, storage, part as 'head' | 'feet', initialPos, deviceIdentifier);
    } else {
        const headPos = storage.get('head_current_position');
        const feetPos = storage.get('feet_current_position');
        const avgPos = Math.round((headPos + feetPos) / 2);
        mqtt.publish(`octo/${deviceIdentifier}/both_cover/position`, avgPos.toString());
        mqtt.publish(`octo/${deviceIdentifier}/both_cover/state`, avgPos > 0 ? 'open' : 'closed');
    }

    mqtt.subscribe(`octo/${deviceIdentifier}/${part}_cover/set`);
    mqtt.on(`octo/${deviceIdentifier}/${part}_cover/set`, (payload: Buffer | string) => {
      const cmd = (typeof payload === 'string' ? payload : payload.toString()).toUpperCase();
      logInfo(`[MQTTEntities] Received command for ${part} cover: ${cmd}`);
      if (isBoth) {
        if (cmd === 'OPEN') {
          startTimedMovement(headState, mqtt, storage, 'head', 100, bleController, deviceIdentifier);
          startTimedMovement(feetState, mqtt, storage, 'feet', 100, bleController, deviceIdentifier);
        } else if (cmd === 'CLOSE') {
          startTimedMovement(headState, mqtt, storage, 'head', 0, bleController, deviceIdentifier);
          startTimedMovement(feetState, mqtt, storage, 'feet', 0, bleController, deviceIdentifier);
        } else if (cmd === 'STOP') {
          stopMovement(headState, mqtt, storage, 'head', bleController, deviceIdentifier);
          stopMovement(feetState, mqtt, storage, 'feet', bleController, deviceIdentifier);
        }
      } else {
        const actuator = part as 'head' | 'feet';
        if (cmd === 'OPEN') startTimedMovement(currentActuatorState, mqtt, storage, actuator, 100, bleController, deviceIdentifier);
        else if (cmd === 'CLOSE') startTimedMovement(currentActuatorState, mqtt, storage, actuator, 0, bleController, deviceIdentifier);
        else if (cmd === 'STOP') stopMovement(currentActuatorState, mqtt, storage, actuator, bleController, deviceIdentifier);
      }
    });

    mqtt.subscribe(`octo/${deviceIdentifier}/${part}_cover/set_position`);
    mqtt.on(`octo/${deviceIdentifier}/${part}_cover/set_position`, (payload: Buffer | string) => {
      const positionCmd = (typeof payload === 'string' ? payload : payload.toString());
      const position = parseInt(positionCmd, 10);
      logInfo(`[MQTTEntities] Received set_position for ${part} cover: ${position}`);
      if (isNaN(position) || position < 0 || position > 100) {
        logWarn(`[MQTTEntities] Invalid position value: ${positionCmd}`);
        return;
      }
      if (isBoth) {
        startTimedMovement(headState, mqtt, storage, 'head', position, bleController, deviceIdentifier);
        startTimedMovement(feetState, mqtt, storage, 'feet', position, bleController, deviceIdentifier);
      } else {
        startTimedMovement(currentActuatorState, mqtt, storage, part as 'head' | 'feet', position, bleController, deviceIdentifier);
      }
    });
  });

  // --- Light ---
  const lightConfig: MQTTItemConfigPlaceholder = {
    name_prefix: '',
    name: 'Bed Light',
    command_topic: `octo/${deviceIdentifier}/light/set`,
    state_topic: `octo/${deviceIdentifier}/light/state`,
    payload_on: 'ON',
    payload_off: 'OFF',
    optimistic: false,
  };
  publishDeviceConfig(mqtt, device, 'light', 'light', lightConfig);

  mqtt.subscribe(lightConfig.command_topic!);
  mqtt.on(lightConfig.command_topic!, async (payload: Buffer | string) => {
    const cmd = (typeof payload === 'string' ? payload : payload.toString()).toUpperCase();
    logInfo(`[MQTTEntities] Received command for light: ${cmd}`);
    const bleCmd = cmd === 'ON' ? Commands.LIGHT_ON : Commands.LIGHT_OFF;
    try {
        await sendBleCommand(bleController, bleCmd); 
        mqtt.publish(lightConfig.state_topic!, cmd); 
    } catch (e) {
        logError("Failed to send light command", e);
    }
  });

  // --- Calibration Buttons & Sensors ---
  ['head', 'feet'].forEach(part => {
    const actuator = part as 'head' | 'feet';
    const currentActuatorState = actuator === 'head' ? headState : feetState;

    const calStartButtonConfig: MQTTItemConfigPlaceholder = { 
        name_prefix: '', name: `Calibrate ${part}`, command_topic: `octo/${deviceIdentifier}/calibrate_${part}/set`, payload_press: 'PRESS' 
    };
    publishDeviceConfig(mqtt, device, `calibrate_${part}_start`, 'button', calStartButtonConfig);
    mqtt.subscribe(calStartButtonConfig.command_topic!);
    mqtt.on(calStartButtonConfig.command_topic!, (payload: Buffer | string) => {
      if ((typeof payload === 'string' ? payload : payload.toString()).toUpperCase() === 'PRESS') {
        if (headState.calibrationMode || feetState.calibrationMode) { 
            logWarn("[MQTTEntities] Calibration already in progress.");
            return;
        }
        logInfo(`[MQTTEntities] Starting ${part} calibration`);
        currentActuatorState.calibrationMode = actuator;
        currentActuatorState.startTime = Date.now();
        currentActuatorState.startPosition = storage.get(actuator === 'head' ? 'head_current_position' : 'feet_current_position'); // Store current pos before calibration movement
        currentActuatorState.targetPosition = 100; // Calibrating to 100%
        sendBleCommand(bleController, actuator === 'head' ? Commands.HEAD_UP : Commands.FEET_UP);
      }
    });

    const calDurationSensorConfig: MQTTItemConfigPlaceholder = {
      name_prefix: '',
      name: `${part.charAt(0).toUpperCase() + part.slice(1)} Calibration Seconds`,
      state_topic: `octo/${deviceIdentifier}/${part}_calibration_seconds/state`,
      unit_of_measurement: 's',
      icon: 'mdi:timer-outline',
    };
    publishDeviceConfig(mqtt, device, `${part}_calibration_seconds`, 'sensor', calDurationSensorConfig);
    const initialDuration = storage.get(actuator === 'head' ? 'head_up_duration' : 'feet_up_duration');
    mqtt.publish(calDurationSensorConfig.state_topic!, (initialDuration / 1000).toFixed(1));
  });

  const calStopButtonConfig: MQTTItemConfigPlaceholder = { 
      name_prefix: '', name: 'Stop Calibration', command_topic: `octo/${deviceIdentifier}/calibration_stop/set`, payload_press: 'PRESS' 
  };
  publishDeviceConfig(mqtt, device, 'calibration_stop', 'button', calStopButtonConfig);
  mqtt.subscribe(calStopButtonConfig.command_topic!);
  mqtt.on(calStopButtonConfig.command_topic!, (payload: Buffer | string) => {
    if ((typeof payload === 'string' ? payload : payload.toString()).toUpperCase() === 'PRESS') {
      const activeCalibrationState = headState.calibrationMode ? headState : (feetState.calibrationMode ? feetState : null);
      const activeActuator = headState.calibrationMode ? 'head' : (feetState.calibrationMode ? 'feet' : null);

      if (!activeCalibrationState || !activeActuator) {
        logWarn("[MQTTEntities] No calibration in progress to stop.");
        return;
      }
      logInfo(`[MQTTEntities] Stopping ${activeActuator} calibration`);
      stopMovement(activeCalibrationState, mqtt, storage, activeActuator, bleController, deviceIdentifier, true); // Pass true for isCalibrationStop
      
      const calibrationDuration = Date.now() - activeCalibrationState.startTime;
      activeCalibrationState.calibrationMode = null;

      if (calibrationDuration < 1000) { // Safety check for too short calibration
          logWarn("[MQTTEntities] Calibration duration too short, not saving.");
          // Reset to previous known position or 0
          const lastPosition = activeCalibrationState.startPosition; // Position before calibration attempt
          updateAndPublishPosition(mqtt, storage, activeActuator, lastPosition, deviceIdentifier);
          return;
      }

      if (activeActuator === 'head') {
        storage.set('head_up_duration', calibrationDuration);
        storage.set('head_current_position', 100);
        mqtt.publish(`octo/${deviceIdentifier}/head_calibration_seconds/state`, (calibrationDuration / 1000).toFixed(1));
        updateAndPublishPosition(mqtt, storage, 'head', 100, deviceIdentifier);
        logInfo(`[MQTTEntities] Head calibrated. Duration: ${calibrationDuration}ms. Moving to 0%.`);
        startTimedMovement(headState, mqtt, storage, 'head', 0, bleController, deviceIdentifier);

      } else if (activeActuator === 'feet') {
        storage.set('feet_up_duration', calibrationDuration);
        storage.set('feet_current_position', 100);
        mqtt.publish(`octo/${deviceIdentifier}/feet_calibration_seconds/state`, (calibrationDuration / 1000).toFixed(1));
        updateAndPublishPosition(mqtt, storage, 'feet', 100, deviceIdentifier);
        logInfo(`[MQTTEntities] Feet calibrated. Duration: ${calibrationDuration}ms. Moving to 0%.`);
        startTimedMovement(feetState, mqtt, storage, 'feet', 0, bleController, deviceIdentifier);
      }
    }
  });

  ['head', 'feet'].forEach(part => {
    const actuator = part as 'head' | 'feet';
    const sensorConfig: MQTTItemConfigPlaceholder = {
      name_prefix: '',
      name: `${part.charAt(0).toUpperCase() + part.slice(1)} Position Sensor`,
      state_topic: `octo/${deviceIdentifier}/${actuator}_cover/position`,
      unit_of_measurement: '%',
      icon: 'mdi:angle-acute',
    };
    publishDeviceConfig(mqtt, device, `${part}_position_sensor`, 'sensor', sensorConfig);
  });

  if (devicePin && devicePin.length === 4) {
    bleController.setPin(devicePin);
    const keepAliveBaseCommand = Commands.getKeepAliveCommand(devicePin);
    // Keep alive command from YAML is already a full packet, don't wrap in buildComplexCommand.
    // const keepAliveFullCommand = buildComplexCommand({ command: keepAliveBaseCommand }); 
    const keepAliveFullCommand = keepAliveBaseCommand; // Assuming getKeepAliveCommand returns the full packet

    if (keepAliveIntervalId) clearInterval(keepAliveIntervalId);
    keepAliveIntervalId = setInterval(() => {
      logInfo('[MQTTEntities] Sending Keep Alive');
      sendBleCommand(bleController, keepAliveFullCommand).catch(e => logError("Failed to send keep alive", e));
    }, 30000);
  } else {
    logWarn('[MQTTEntities] PIN not configured or invalid, keep-alive will not be sent.');
  }

  mqtt.publish(`octo/${deviceIdentifier}/status`, 'online');
  logInfo(`[MQTTEntities] MQTT entities configured for ${device.name}`);
};

export const cleanupOctoMqttEntities = (mqtt: IMQTTConnection, deviceData: MQTTDevicePlaceholder | undefined) => {
  if (keepAliveIntervalId) {
    clearInterval(keepAliveIntervalId);
    keepAliveIntervalId = null;
  }
  const tempStorage = new OctoStorage(); 

  if (headState.isMoving && deviceData) stopMovement(headState, mqtt, tempStorage, 'head', null, deviceData.identifiers[0]);
  if (feetState.isMoving && deviceData) stopMovement(feetState, mqtt, tempStorage, 'feet', null, deviceData.identifiers[0]);

  headState = initialActuatorState();
  feetState = initialActuatorState();

  if (deviceData) {
     mqtt.publish(`octo/${deviceData.identifiers[0]}/status`, 'offline');
  }
  logInfo('[MQTTEntities] Cleaned up MQTT entities and keep-alive.');
}; 