import { IMQTTConnection } from '../MQTT/IMQTTConnection';
import { logInfo, logError, logWarn } from '../Utils/logger';
import * as Commands from './commands';
import { OctoStorage } from './storage';

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
    const elapsed = Date.now() - actuatorState.startTime;
    let progress = (elapsed / moveDur) * positionDifference; 
    if (targetPos < currentPos) progress = -progress;
    const estimatedCurrentPos = actuatorState.startPosition + progress;
    updateAndPublishPosition(mqtt, storage, actuator, estimatedCurrentPos, deviceIdentifier);
  }, POSITION_UPDATE_INTERVAL);

  if (actuatorState.moveTimeoutId) clearTimeout(actuatorState.moveTimeoutId);
  actuatorState.moveTimeoutId = setTimeout(() => {
    stopMovement(actuatorState, mqtt, storage, actuator, bleController, deviceIdentifier);
    updateAndPublishPosition(mqtt, storage, actuator, targetPos, deviceIdentifier); // Ensure final position is target
  }, moveDur);
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
    const deviceIdentifier = mqttDeviceData.identifiers[0];
    logInfo('[MQTTEntities] Setting up Octo entities for device:', deviceIdentifier);

    if (devicePin) {
      bleController.setPin(devicePin);
      if (keepAliveIntervalId) clearInterval(keepAliveIntervalId);
      const keepAliveCommand = Commands.getKeepAliveCommand(devicePin);
      keepAliveIntervalId = setInterval(() => {
        logInfo('[MQTTEntities] Sending keep-alive command');
        sendBleCommand(bleController, keepAliveCommand).catch(err => {
          logError('[MQTTEntities] Error sending keep-alive:', err);
        });
      }, 45 * 1000); // Send keep-alive every 45 seconds
    }

    const commonCoverConfig = (name: string) => ({
      name_prefix: 'Adjustable Bed', 
      name,
      device_class: 'damper',
      position_open: 100,
      position_closed: 0,
      optimistic: false,
    });

    // Head Cover
    const headCoverId = 'head_cover';
    const headConfig = {
      ...commonCoverConfig('Head Position'),
      command_topic: `octo/${deviceIdentifier}/${headCoverId}/set`,
      position_topic: `octo/${deviceIdentifier}/${headCoverId}/position`,
      set_position_topic: `octo/${deviceIdentifier}/${headCoverId}/set_position`,
      state_topic: `octo/${deviceIdentifier}/${headCoverId}/state`,
    } as MQTTItemConfigPlaceholder;
    publishDeviceConfig(this.mqtt, mqttDeviceData, headCoverId, 'cover', headConfig);
    this.mqtt.subscribe(headConfig.command_topic!);
    this.mqtt.subscribe(headConfig.set_position_topic!);

    // Feet Cover
    const feetCoverId = 'feet_cover';
    const feetConfig = {
      ...commonCoverConfig('Feet Position'),
      command_topic: `octo/${deviceIdentifier}/${feetCoverId}/set`,
      position_topic: `octo/${deviceIdentifier}/${feetCoverId}/position`,
      set_position_topic: `octo/${deviceIdentifier}/${feetCoverId}/set_position`,
      state_topic: `octo/${deviceIdentifier}/${feetCoverId}/state`,
    } as MQTTItemConfigPlaceholder;
    publishDeviceConfig(this.mqtt, mqttDeviceData, feetCoverId, 'cover', feetConfig);
    this.mqtt.subscribe(feetConfig.command_topic!);
    this.mqtt.subscribe(feetConfig.set_position_topic!);

    // Initial position publish
    updateAndPublishPosition(this.mqtt, this.storage, 'head', this.storage.get('head_current_position'), deviceIdentifier);
    updateAndPublishPosition(this.mqtt, this.storage, 'feet', this.storage.get('feet_current_position'), deviceIdentifier);

    // Handle commands for head cover
    this.mqtt.on(headConfig.command_topic!, (message) => {
      logInfo('[MQTTEntities] Head cover command:', message);
      if (message === 'OPEN') sendBleCommand(bleController, Commands.HEAD_UP);
      else if (message === 'CLOSE') sendBleCommand(bleController, Commands.HEAD_DOWN);
      else if (message === 'STOP') stopMovement(headState, this.mqtt, this.storage, 'head', bleController, deviceIdentifier);
    });
    this.mqtt.on(headConfig.set_position_topic!, (message) => {
      const targetPos = parseInt(message, 10);
      if (!isNaN(targetPos)) {
        logInfo('[MQTTEntities] Head cover set position:', targetPos);
        startTimedMovement(headState, this.mqtt, this.storage, 'head', targetPos, bleController, deviceIdentifier);
      }
    });

    // Handle commands for feet cover
    this.mqtt.on(feetConfig.command_topic!, (message) => {
      logInfo('[MQTTEntities] Feet cover command:', message);
      if (message === 'OPEN') sendBleCommand(bleController, Commands.FEET_UP);
      else if (message === 'CLOSE') sendBleCommand(bleController, Commands.FEET_DOWN);
      else if (message === 'STOP') stopMovement(feetState, this.mqtt, this.storage, 'feet', bleController, deviceIdentifier);
    });
    this.mqtt.on(feetConfig.set_position_topic!, (message) => {
      const targetPos = parseInt(message, 10);
      if (!isNaN(targetPos)) {
        logInfo('[MQTTEntities] Feet cover set position:', targetPos);
        startTimedMovement(feetState, this.mqtt, this.storage, 'feet', targetPos, bleController, deviceIdentifier);
      }
    });

    // Preset Buttons
    const presetCommands = [
      { id: 'zero_g_preset', name: 'Zero G', command: Commands.STOP_MOVEMENT /* Placeholder */ },
      { id: 'tv_preset', name: 'TV', command: Commands.STOP_MOVEMENT /* Placeholder */ },
      { id: 'anti_snore_preset', name: 'Anti-Snore', command: Commands.STOP_MOVEMENT /* Placeholder */ },
      { id: 'flat_preset', name: 'Flat', command: Commands.STOP_MOVEMENT /* Placeholder */ },
      { id: 'memory_a_preset', name: 'Memory A', command: Commands.STOP_MOVEMENT /* Placeholder */ },
      { id: 'memory_b_preset', name: 'Memory B', command: Commands.STOP_MOVEMENT /* Placeholder */ },
      { id: 'memory_c_preset', name: 'Memory C', command: Commands.STOP_MOVEMENT /* Placeholder */ },
    ];

    presetCommands.forEach(preset => {
      const presetConfig = {
        name_prefix: 'Adjustable Bed',
        name: preset.name,
        command_topic: `octo/${deviceIdentifier}/${preset.id}/set`,
      } as MQTTItemConfigPlaceholder;
      publishDeviceConfig(this.mqtt, mqttDeviceData, preset.id, 'button', presetConfig);
      this.mqtt.subscribe(presetConfig.command_topic!);
      this.mqtt.on(presetConfig.command_topic!, (message) => {
        if (message === 'PRESS') { // Home Assistant button sends 'PRESS'
          logInfo(`[MQTTEntities] Preset button ${preset.name} pressed.`);
          // TODO: Implement actual preset command logic based on feedback or hardcoded sequences
          // For now, just sending a STOP command as a placeholder
          sendBleCommand(bleController, preset.command);
          // If presets involve setting specific positions, that logic needs to be added here.
          // e.g., for 'Flat', set head to 0, feet to 0.
          if (preset.id === 'flat_preset') {
            startTimedMovement(headState, this.mqtt, this.storage, 'head', 0, bleController, deviceIdentifier);
            startTimedMovement(feetState, this.mqtt, this.storage, 'feet', 0, bleController, deviceIdentifier);
          }
        }
      });
    });

    // Calibration Number entities and Buttons
    const calibrationEntities = [
      { type: 'head', name: 'Head Travel Time', storageKey: 'head_up_duration', unit: 'ms' },
      { type: 'feet', name: 'Feet Travel Time', storageKey: 'feet_up_duration', unit: 'ms' },
    ];

    calibrationEntities.forEach(cal => {
      const entityId = `${cal.type}_travel_time`;
      const numberConfig = {
        name_prefix: 'Adjustable Bed Calibration',
        name: cal.name,
        state_topic: `octo/${deviceIdentifier}/${entityId}/state`,
        command_topic: `octo/${deviceIdentifier}/${entityId}/set`,
        min: 0,
        max: 60000, // Max 60 seconds
        step: 100,
        unit_of_measurement: cal.unit,
        mode: 'box',
      } as MQTTItemConfigPlaceholder;
      publishDeviceConfig(this.mqtt, mqttDeviceData, entityId, 'number', numberConfig);
      this.mqtt.subscribe(numberConfig.command_topic!);
      this.mqtt.publish(numberConfig.state_topic!, this.storage.get(cal.storageKey).toString());

      this.mqtt.on(numberConfig.command_topic!, (message) => {
        const value = parseInt(message, 10);
        if (!isNaN(value)) {
          this.storage.set(cal.storageKey, value);
          this.mqtt.publish(numberConfig.state_topic!, value.toString());
        }
      });

      // Calibration Start Button
      const calButtonId = `calibrate_${cal.type}_start`;
      const calButtonConfig = {
        name_prefix: 'Adjustable Bed Calibration',
        name: `Calibrate ${cal.type.charAt(0).toUpperCase() + cal.type.slice(1)} Start`,
        command_topic: `octo/${deviceIdentifier}/${calButtonId}/set`,
      } as MQTTItemConfigPlaceholder;
      publishDeviceConfig(this.mqtt, mqttDeviceData, calButtonId, 'button', calButtonConfig);
      this.mqtt.subscribe(calButtonConfig.command_topic!);
      this.mqtt.on(calButtonConfig.command_topic!, (message) => {
        if (message === 'PRESS') {
          logInfo(`[MQTTEntities] Starting ${cal.type} calibration.`);
          const actuatorState = cal.type === 'head' ? headState : feetState;
          if (actuatorState.isMoving || actuatorState.calibrationMode) {
            logWarn(`[MQTTEntities] Cannot start ${cal.type} calibration, already moving or calibrating.`);
            return;
          }
          actuatorState.calibrationMode = cal.type as 'head' | 'feet';
          actuatorState.startTime = Date.now(); 
          // Move to 0 first, then start upwards movement for calibration
          startTimedMovement(actuatorState, this.mqtt, this.storage, cal.type as 'head' | 'feet', 0, bleController, deviceIdentifier);
          
          // Wait for move to 0 to complete (approximate)
          const currentPos = this.storage.get(cal.type === 'head' ? 'head_current_position' : 'feet_current_position');
          const timeToReachZero = (currentPos / 100) * this.storage.get(cal.storageKey as 'head_up_duration' | 'feet_up_duration'); // Approx

          setTimeout(() => {
            if (actuatorState.calibrationMode !== cal.type) return; // Calibration might have been cancelled
            logInfo(`[MQTTEntities] ${cal.type} at 0, starting calibration upward movement.`);
            actuatorState.startTime = Date.now(); // Reset start time for upward travel
            sendBleCommand(bleController, cal.type === 'head' ? Commands.HEAD_UP : Commands.FEET_UP);
            // Set a timeout for max calibration time (e.g., 60s)
            if (actuatorState.calibrationTimeoutId) clearTimeout(actuatorState.calibrationTimeoutId);
            actuatorState.calibrationTimeoutId = setTimeout(() => {
                if (actuatorState.calibrationMode === cal.type) {
                    logWarn(`[MQTTEntities] ${cal.type} calibration timed out. Stopping.`);
                    // Simulate stop press
                    this.mqtt.publish(`octo/${deviceIdentifier}/calibrate_${cal.type}_stop/set`, 'PRESS');
                }
            }, 60000); 
          }, timeToReachZero + 500); // Add buffer
        }
      });

      // Calibration Stop Button
      const calStopButtonId = `calibrate_${cal.type}_stop`;
      const calStopButtonConfig = {
        name_prefix: 'Adjustable Bed Calibration',
        name: `Calibrate ${cal.type.charAt(0).toUpperCase() + cal.type.slice(1)} Stop`,
        command_topic: `octo/${deviceIdentifier}/${calStopButtonId}/set`,
      } as MQTTItemConfigPlaceholder;
      publishDeviceConfig(this.mqtt, mqttDeviceData, calStopButtonId, 'button', calStopButtonConfig);
      this.mqtt.subscribe(calStopButtonConfig.command_topic!);
      this.mqtt.on(calStopButtonConfig.command_topic!, (message) => {
        if (message === 'PRESS') {
          logInfo(`[MQTTEntities] Stopping ${cal.type} calibration.`);
          const actuatorState = cal.type === 'head' ? headState : feetState;
          if (actuatorState.calibrationMode === cal.type) {
            if (actuatorState.calibrationTimeoutId) clearTimeout(actuatorState.calibrationTimeoutId);
            actuatorState.calibrationTimeoutId = null;
            const travelTime = Date.now() - actuatorState.startTime;
            this.storage.set(cal.storageKey as 'head_up_duration' | 'feet_up_duration', travelTime);
            this.mqtt.publish(numberConfig.state_topic!, travelTime.toString());
            stopMovement(actuatorState, this.mqtt, this.storage, cal.type as 'head' | 'feet', bleController, deviceIdentifier, true);
            updateAndPublishPosition(this.mqtt, this.storage, cal.type as 'head' | 'feet', 100, deviceIdentifier); // At end of calibration, it's 100%
            actuatorState.calibrationMode = null;
            logInfo(`[MQTTEntities] ${cal.type} calibration finished. Travel time: ${travelTime}ms`);
          } else {
            logWarn(`[MQTTEntities] ${cal.type} calibration stop pressed, but not in calibration mode.`);
          }
        }
      });
    });
  };

  public cleanupOctoMqttEntities = (deviceData: MQTTDevicePlaceholder | undefined) => {
    if (!deviceData) {
        logWarn('[MQTTEntities] Cleanup called with no device data, cannot determine topics to unsubscribe.');
        if (keepAliveIntervalId) clearInterval(keepAliveIntervalId);
        keepAliveIntervalId = null;
        // Try to stop ongoing movements if states are active
        // This is a bit of a guess without specific deviceIdentifier
        if (headState.isMoving) stopMovement(headState, this.mqtt, this.storage, 'head', null, 'unknown_device_cleanup');
        if (feetState.isMoving) stopMovement(feetState, this.mqtt, this.storage, 'feet', null, 'unknown_device_cleanup');
        return;
    }
    const deviceIdentifier = deviceData.identifiers[0];
    logInfo('[MQTTEntities] Cleaning up Octo entities for device:', deviceIdentifier);
    if (keepAliveIntervalId) {
      clearInterval(keepAliveIntervalId);
      keepAliveIntervalId = null;
    }
    // Stop any ongoing movements
    stopMovement(headState, this.mqtt, this.storage, 'head', null, deviceIdentifier);
    stopMovement(feetState, this.mqtt, this.storage, 'feet', null, deviceIdentifier);
    
    // Unsubscribe from all topics
    // This requires knowing all subscribed topics. For simplicity, constructing them again.
    const headCoverId = 'head_cover';
    this.mqtt.unsubscribe(`octo/${deviceIdentifier}/${headCoverId}/set`);
    this.mqtt.unsubscribe(`octo/${deviceIdentifier}/${headCoverId}/set_position`);

    const feetCoverId = 'feet_cover';
    this.mqtt.unsubscribe(`octo/${deviceIdentifier}/${feetCoverId}/set`);
    this.mqtt.unsubscribe(`octo/${deviceIdentifier}/${feetCoverId}/set_position`);

    const presetButtons = ['zero_g_preset', 'tv_preset', 'anti_snore_preset', 'flat_preset', 'memory_a_preset', 'memory_b_preset', 'memory_c_preset'];
    presetButtons.forEach(id => this.mqtt.unsubscribe(`octo/${deviceIdentifier}/${id}/set`));

    const calEntities = ['head_travel_time', 'feet_travel_time', 'calibrate_head_start', 'calibrate_head_stop', 'calibrate_feet_start', 'calibrate_feet_stop'];
    calEntities.forEach(id => {
        if (id.includes('_travel_time')) {
            this.mqtt.unsubscribe(`octo/${deviceIdentifier}/${id}/set`);
        } else {
            this.mqtt.unsubscribe(`octo/${deviceIdentifier}/${id}/set`);
        }
    });

    // Optionally, unpublish discovery messages by publishing empty payload (not strictly necessary for HA)
    // Example: this.mqtt.publish(`homeassistant/cover/${deviceIdentifier}/head_cover/config`, '');
    logInfo('[MQTTEntities] Cleanup complete for device:', deviceIdentifier);
  };
} 