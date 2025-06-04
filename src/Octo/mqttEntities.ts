import { IMQTTConnection } from '../MQTT/IMQTTConnection';
import { logInfo, logError, logWarn } from '../Utils/logger';
import * as Commands from './commands';
import { OctoStorage, OctoStorageData } from './storage';

// Define interface for MQTT device data
interface MQTTDevicePlaceholder {
  identifiers: string[];
  name: string;
  model?: string;
  manufacturer?: string;
  sw_version?: string;
  availability_topic?: string;
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

export class OctoMQTTEntities {
  constructor(
    private readonly mqtt: IMQTTConnection,
    private readonly storage: OctoStorage
  ) {}

  public setupOctoMqttEntities = (
    bleController: OctoControllerMinimal,
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
      publishDeviceConfig(this.mqtt, device, `${part}_cover`, 'cover', coverConfig);
      
      if (!isBoth) {
          const initialPos = this.storage.get(part === 'head' ? 'head_current_position' : 'feet_current_position');
          updateAndPublishPosition(this.mqtt, this.storage, part as 'head' | 'feet', initialPos, deviceIdentifier);
      } else {
          const headPos = this.storage.get('head_current_position');
          const feetPos = this.storage.get('feet_current_position');
          const avgPos = Math.round((headPos + feetPos) / 2);
          this.mqtt.publish(`octo/${deviceIdentifier}/both_cover/position`, avgPos.toString());
          this.mqtt.publish(`octo/${deviceIdentifier}/both_cover/state`, avgPos > 0 ? 'open' : 'closed');
      }

      this.mqtt.subscribe(`octo/${deviceIdentifier}/${part}_cover/set`);
      this.mqtt.on(`octo/${deviceIdentifier}/${part}_cover/set`, (payload: Buffer | string) => {
        const cmd = (typeof payload === 'string' ? payload : payload.toString()).toUpperCase();
        logInfo(`[MQTTEntities] Received command for ${part} cover: ${cmd}`);
        if (isBoth) {
          if (cmd === 'OPEN') {
            startTimedMovement(headState, this.mqtt, this.storage, 'head', 100, bleController, deviceIdentifier);
            startTimedMovement(feetState, this.mqtt, this.storage, 'feet', 100, bleController, deviceIdentifier);
          } else if (cmd === 'CLOSE') {
            startTimedMovement(headState, this.mqtt, this.storage, 'head', 0, bleController, deviceIdentifier);
            startTimedMovement(feetState, this.mqtt, this.storage, 'feet', 0, bleController, deviceIdentifier);
          } else if (cmd === 'STOP') {
            stopMovement(headState, this.mqtt, this.storage, 'head', bleController, deviceIdentifier);
            stopMovement(feetState, this.mqtt, this.storage, 'feet', bleController, deviceIdentifier);
          }
        } else {
          const actuator = part as 'head' | 'feet';
          if (cmd === 'OPEN') startTimedMovement(currentActuatorState, this.mqtt, this.storage, actuator, 100, bleController, deviceIdentifier);
          else if (cmd === 'CLOSE') startTimedMovement(currentActuatorState, this.mqtt, this.storage, actuator, 0, bleController, deviceIdentifier);
          else if (cmd === 'STOP') stopMovement(currentActuatorState, this.mqtt, this.storage, actuator, bleController, deviceIdentifier);
        }
      });

      this.mqtt.subscribe(`octo/${deviceIdentifier}/${part}_cover/set_position`);
      this.mqtt.on(`octo/${deviceIdentifier}/${part}_cover/set_position`, (payload: Buffer | string) => {
        const positionCmd = (typeof payload === 'string' ? payload : payload.toString());
        const position = parseInt(positionCmd, 10);
        logInfo(`[MQTTEntities] Received set_position for ${part} cover: ${position}`);
        if (isNaN(position) || position < 0 || position > 100) {
          logWarn(`[MQTTEntities] Invalid position value: ${positionCmd}`);
          return;
        }
        if (isBoth) {
          startTimedMovement(headState, this.mqtt, this.storage, 'head', position, bleController, deviceIdentifier);
          startTimedMovement(feetState, this.mqtt, this.storage, 'feet', position, bleController, deviceIdentifier);
        } else {
          startTimedMovement(currentActuatorState, this.mqtt, this.storage, part as 'head' | 'feet', position, bleController, deviceIdentifier);
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
    publishDeviceConfig(this.mqtt, device, 'light', 'light', lightConfig);

    this.mqtt.subscribe(lightConfig.command_topic!);
    this.mqtt.on(lightConfig.command_topic!, async (payload: Buffer | string) => {
      const cmd = (typeof payload === 'string' ? payload : payload.toString()).toUpperCase();
      logInfo(`[MQTTEntities] Received command for light: ${cmd}`);
      const bleCmd = cmd === 'ON' ? Commands.LIGHT_ON : Commands.LIGHT_OFF;
      try {
          await sendBleCommand(bleController, bleCmd); 
          this.mqtt.publish(lightConfig.state_topic!, cmd); 
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
      publishDeviceConfig(this.mqtt, device, `calibrate_${part}_start`, 'button', calStartButtonConfig);
      this.mqtt.subscribe(calStartButtonConfig.command_topic!);
      this.mqtt.on(calStartButtonConfig.command_topic!, (payload: Buffer | string) => {
        if ((typeof payload === 'string' ? payload : payload.toString()).toUpperCase() === 'PRESS') {
          if (headState.calibrationMode || feetState.calibrationMode) { 
              logWarn("[MQTTEntities] Calibration already in progress.");
              return;
          }
          logInfo(`[MQTTEntities] Starting ${part} calibration`);
          currentActuatorState.calibrationMode = actuator;
          currentActuatorState.startTime = Date.now();
          currentActuatorState.startPosition = this.storage.get(actuator === 'head' ? 'head_current_position' : 'feet_current_position'); // Store current pos before calibration movement
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
      publishDeviceConfig(this.mqtt, device, `${part}_calibration_seconds`, 'sensor', calDurationSensorConfig);
      const durationKey: 'head_up_duration' | 'feet_up_duration' = actuator === 'head' ? 'head_up_duration' : 'feet_up_duration';
      const initialDuration = this.storage.get(durationKey);
      this.mqtt.publish(calDurationSensorConfig.state_topic!, (initialDuration / 1000).toFixed(1));
    });

    const calStopButtonConfig: MQTTItemConfigPlaceholder = { 
        name_prefix: '', name: 'Stop Calibration', command_topic: `octo/${deviceIdentifier}/calibration_stop/set`, payload_press: 'PRESS' 
    };
    publishDeviceConfig(this.mqtt, device, 'calibration_stop', 'button', calStopButtonConfig);
    this.mqtt.subscribe(calStopButtonConfig.command_topic!);
    this.mqtt.on(calStopButtonConfig.command_topic!, (payload: Buffer | string) => {
      if ((typeof payload === 'string' ? payload : payload.toString()).toUpperCase() === 'PRESS') {
        const localStore = this.storage; // Assign to local const
        const activeCalibrationState = headState.calibrationMode ? headState : (feetState.calibrationMode ? feetState : null);
        const activeActuator = headState.calibrationMode ? 'head' : (feetState.calibrationMode ? 'feet' : null);

        if (!activeCalibrationState || !activeActuator) {
          logWarn("[MQTTEntities] No calibration in progress to stop.");
          return;
        }
        logInfo(`[MQTTEntities] Stopping ${activeActuator} calibration`);
        stopMovement(activeCalibrationState, this.mqtt, localStore, activeActuator, bleController, deviceIdentifier, true);
        
        const calibrationDuration = Date.now() - activeCalibrationState.startTime;
        activeCalibrationState.calibrationMode = null;

        if (calibrationDuration < 1000) {
            logWarn("[MQTTEntities] Calibration duration too short, not saving.");
            const lastPosition = activeCalibrationState.startPosition;
            updateAndPublishPosition(this.mqtt, localStore, activeActuator, lastPosition, deviceIdentifier);
            return;
        }

        if (activeActuator === 'head') {
          localStore.set('head_up_duration', calibrationDuration);
          localStore.set('head_current_position', 100);
          this.mqtt.publish(`octo/${deviceIdentifier}/head_calibration_seconds/state`, (calibrationDuration / 1000).toFixed(1));
          updateAndPublishPosition(this.mqtt, localStore, 'head', 100, deviceIdentifier);
          logInfo(`[MQTTEntities] Head calibrated. Duration: ${calibrationDuration}ms. Moving to 0%.`);
          startTimedMovement(headState, this.mqtt, localStore, 'head', 0, bleController, deviceIdentifier);

        } else if (activeActuator === 'feet') {
          localStore.set('feet_up_duration', calibrationDuration);
          localStore.set('feet_current_position', 100);
          this.mqtt.publish(`octo/${deviceIdentifier}/feet_calibration_seconds/state`, (calibrationDuration / 1000).toFixed(1));
          updateAndPublishPosition(this.mqtt, localStore, 'feet', 100, deviceIdentifier);
          logInfo(`[MQTTEntities] Feet calibrated. Duration: ${calibrationDuration}ms. Moving to 0%.`);
          startTimedMovement(feetState, this.mqtt, localStore, 'feet', 0, bleController, deviceIdentifier);
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
      publishDeviceConfig(this.mqtt, device, `${part}_position_sensor`, 'sensor', sensorConfig);
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

    this.mqtt.publish(`octo/${deviceIdentifier}/status`, 'online');
    logInfo(`[MQTTEntities] MQTT entities configured for ${device.name}`);
  };

  public cleanupOctoMqttEntities = (deviceData: MQTTDevicePlaceholder | undefined) => {
    if (keepAliveIntervalId) {
      clearInterval(keepAliveIntervalId);
      keepAliveIntervalId = null;
    }
    const tempStorage = new OctoStorage(); 

    if (headState.isMoving && deviceData) stopMovement(headState, this.mqtt, tempStorage, 'head', null, deviceData.identifiers[0]);
    if (feetState.isMoving && deviceData) stopMovement(feetState, this.mqtt, tempStorage, 'feet', null, deviceData.identifiers[0]);

    headState = initialActuatorState();
    feetState = initialActuatorState();

    if (deviceData) {
       this.mqtt.publish(`octo/${deviceData.identifiers[0]}/status`, 'offline');
    }
    logInfo('[MQTTEntities] Cleaned up MQTT entities and keep-alive.');
  };
} 