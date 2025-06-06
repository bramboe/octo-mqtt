import { Cover } from '../HomeAssistant/Cover';
import { IMQTTConnection } from '../MQTT/IMQTTConnection';
import { buildEntityConfig } from '../Common/buildEntityConfig';
import { Command } from '../BLE/BLEController';
import { IController } from '../Common/IController';
import { Cancelable } from '../Common/Cancelable';
import { ICache } from '../Common/ICache';
import { arrayEquals } from '../Utils/arrayEquals';
import { logInfo, logError, logWarn } from '../Utils/logger';
import { Button } from '../HomeAssistant/Button';

interface MotorState {
  head: boolean;
  legs: boolean;
  headPosition: number;
  legsPosition: number;
  headUpDuration: number;
  feetUpDuration: number;
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

const motorPairs: Record<keyof Pick<MotorState, 'head' | 'legs'>, keyof Pick<MotorState, 'head' | 'legs'>> = {
  head: 'legs',
  legs: 'head',
};

const DEFAULT_UP_DURATION_MS = 30000;

// Add preset positions similar to ESPHome implementation
const PRESETS = {
  FLAT: { head: 0, legs: 0 },
  ZERO_G: { head: 15, legs: 30 },
  TV: { head: 45, legs: 5 },
  READING: { head: 60, legs: 10 }
};

export const setupMotorEntities = (
  mqtt: IMQTTConnection,
  { cache, deviceData, writeCommand, cancelCommands }: IController<number[] | Command> & ICache<Cache>
) => {
  logInfo('[Octo] Setting up motor entities...');
  
  if (!cache.motorState) {
    cache.motorState = {
      direction: 'STOP',
      head: false,
      legs: false,
      canceled: false,
      headPosition: 0,
      legsPosition: 0,
      headUpDuration: DEFAULT_UP_DURATION_MS,
      feetUpDuration: DEFAULT_UP_DURATION_MS
    };
  }

  let movementStartTime = 0;
  let headStartPosition = 0;
  let legsStartPosition = 0;

  const updateMotorState = (main: keyof Pick<MotorState, 'head' | 'legs'>, command: string) => {
    const other = motorPairs[main];
    const motorState = cache.motorState!;
    const { direction, canceled, ...motors } = motorState;
    const moveMotors = command !== 'STOP';
    
    if (direction === command && motors[main as keyof typeof motors] === moveMotors) return;

    motorState[main] = moveMotors;
    if (motors[other as keyof typeof motors]) {
      if (!moveMotors) command = direction;
      else if (direction != command) motorState[other] = false;
    }
    motorState.direction = command;
    
    if (moveMotors) {
      movementStartTime = Date.now();
      headStartPosition = motorState.headPosition;
      legsStartPosition = motorState.legsPosition;
    }
  };

  const move = (motorState: MotorState & Directional): Command | undefined => {
    const { head, legs, direction } = motorState;
    const motor = (head ? 0x2 : 0x0) + (legs ? 0x4 : 0x0);
    if (direction === 'STOP' || motor === 0x0) return undefined;
    return {
      command: [0x2, direction == 'OPEN' ? 0x70 : 0x71],
      data: [motor],
    };
  };

  const moveBoth = async (direction: string) => {
    logInfo(`[Octo] Moving both motors ${direction}`);
    try {
      await writeCommand([0x2, 0x73]);
      
      const motorState = cache.motorState!;
      motorState.head = true;
      motorState.legs = true;
      motorState.direction = direction;
      
      movementStartTime = Date.now();
      headStartPosition = motorState.headPosition;
      legsStartPosition = motorState.legsPosition;
      
      const command = {
        command: [0x2, direction === 'OPEN' ? 0x70 : 0x71],
        data: [0x06]
      };
      
      await writeCommand(command);
      logInfo(`[Octo] Both motors movement started`);
      
      setTimeout(async () => {
        if (motorState.head && motorState.legs && motorState.direction === direction) {
          await writeCommand([0x2, 0x73]);
          logInfo(`[Octo] Both motors auto-stopped after timeout`);
          
          updatePositionBasedOnElapsed();
          motorState.head = false;
          motorState.legs = false;
          motorState.direction = 'STOP';
          
          publishState('head');
          publishState('legs');
        }
      }, Math.max(cache.motorState!.headUpDuration, cache.motorState!.feetUpDuration));
      
      return true;
    } catch (error) {
      logError(`[Octo] Error moving both motors: ${error}`);
      return false;
    }
  };
  
  const stopAllMotors = async () => {
    logInfo('[Octo] Stopping all motors');
    try {
      await writeCommand([0x2, 0x73]);
      await writeCommand([0x2, 0x73]);
      
      const motorState = cache.motorState!;
      motorState.head = false;
      motorState.legs = false;
      motorState.direction = 'STOP';
      
      updatePositionBasedOnElapsed();
      movementStartTime = 0;
      
      publishState('head');
      publishState('legs');
      
      logInfo('[Octo] All motors stopped successfully');
      return true;
    } catch (error) {
      logError(`[Octo] Error stopping motors: ${error}`);
      return false;
    }
  };

  const commandsMatch = (commandA: Command | undefined, commandB: Command | undefined) => {
    if (commandA === commandB) return true;
    if (commandA === undefined || commandB === undefined) return false;
    return arrayEquals(commandA.command, commandB.command) && arrayEquals(commandA.data || [], commandB.data || []);
  };

  const updatePositionBasedOnElapsed = () => {
    if (movementStartTime === 0) return;
    
    const motorState = cache.motorState!;
    const elapsedMs = Date.now() - movementStartTime;
    
    if (motorState.head) {
      const headDuration = motorState.headUpDuration || DEFAULT_UP_DURATION_MS;
      const headChange = (elapsedMs / headDuration) * 100;
      
      if (motorState.direction === 'OPEN') {
        motorState.headPosition = Math.min(100, headStartPosition + headChange);
      } else {
        motorState.headPosition = Math.max(0, headStartPosition - headChange);
      }
      
      if (Math.floor(motorState.headPosition) % 5 === 0) {
        logInfo(`[Octo] Head position updated: ${motorState.headPosition.toFixed(1)}%`);
      }
    }
    
    if (motorState.legs) {
      const legsDuration = motorState.feetUpDuration || DEFAULT_UP_DURATION_MS;
      const legsChange = (elapsedMs / legsDuration) * 100;
      
      if (motorState.direction === 'OPEN') {
        motorState.legsPosition = Math.min(100, legsStartPosition + legsChange);
      } else {
        motorState.legsPosition = Math.max(0, legsStartPosition - legsChange);
      }
      
      if (Math.floor(motorState.legsPosition) % 5 === 0) {
        logInfo(`[Octo] Legs position updated: ${motorState.legsPosition.toFixed(1)}%`);
      }
    }
  };

  const buildCoverCommand = (main: keyof Pick<MotorState, 'head' | 'legs'>) => async (command: string) => {
    if (!cache.motorState) return false;

    if (command !== 'STOP') {
      updateMotorState(main, command);
    } else {
      cache.motorState[main] = false;
      if (!cache.motorState[motorPairs[main]]) {
        cache.motorState.direction = command;
      }
    }

    const sendCommand = async () => {
      if (cancelCommands) cancelCommands();
      const motorState = cache.motorState!;
      motorState.canceled = false;

      const currentCommand = move(motorState);
      if (motorState.canceled) {
        motorState.canceled = false;
        return false;
      }
      if (!currentCommand) {
        await writeCommand([0x2, 0x73]);
      } else {
        await writeCommand(currentCommand);
      }
      
      // Update positions during movement
      if (command !== 'STOP') {
        const intervalId = setInterval(() => {
          if (!motorState[main] || motorState.direction !== command) {
            clearInterval(intervalId);
            return;
          }
          updatePositionBasedOnElapsed();
          publishState(main);
        }, 250); // Update every 250ms
      }
      
      return true;
    };

    try {
      const result = await sendCommand();
      // After command, ensure we update the final position and publish state
      updatePositionBasedOnElapsed(); 
      publishState(main);
      // If stopping, also ensure the movementStartTime is reset so subsequent short presses don't miscalculate
      if (command === 'STOP') {
        movementStartTime = 0;
      }
      return result;
    } catch (err) {
      logError(`[Octo] Error in cover command for ${main}: ${err}`);
      return false;
    }
  };

  const publishState = (main: keyof Pick<MotorState, 'head' | 'legs'>) => {
    if (!cache.motorState) return;
    const motorState = cache.motorState;
    const cover = main === 'head' ? cache.headMotor : cache.legsMotor;
    if (!cover) return;

    const position = main === 'head' ? motorState.headPosition : motorState.legsPosition;
    cover.publishPosition(Math.round(position) / 100);
  };

  const moveToPreset = async (presetName: keyof typeof PRESETS): Promise<void> => {
    if (!cache.motorState) {
      return;
    }
    const motorState = cache.motorState;
    const preset = PRESETS[presetName];
    logInfo(`[Octo] Moving to preset: ${presetName}`);

    // Target positions
    const targetHead = preset.head;
    const targetLegs = preset.legs;

    // Current positions
    let currentHead = motorState.headPosition;
    let currentLegs = motorState.legsPosition;

    // Durations
    const headDuration = motorState.headUpDuration || DEFAULT_UP_DURATION_MS;
    const legsDuration = motorState.feetUpDuration || DEFAULT_UP_DURATION_MS;

    // Calculate time needed for each motor
    const headTime = (Math.abs(targetHead - currentHead) / 100) * headDuration;
    const legsTime = (Math.abs(targetLegs - currentLegs) / 100) * legsDuration;
    const maxTime = Math.max(headTime, legsTime);

    if (maxTime <= 0) {
      logInfo('[Octo] Already at preset position.');
      return;
    }

    // Determine direction for each motor
    const headDirection = targetHead > currentHead ? 'OPEN' : 'CLOSE';
    const legsDirection = targetLegs > currentLegs ? 'OPEN' : 'CLOSE';

    // Start movement
    logInfo(`[Octo] Preset - Head: ${headDirection} (${headTime.toFixed(0)}ms), Legs: ${legsDirection} (${legsTime.toFixed(0)}ms). Max time: ${maxTime.toFixed(0)}ms`);
    movementStartTime = Date.now();
    headStartPosition = currentHead;
    legsStartPosition = currentLegs;

    // Logic for sending commands - simplified here, may need Octo-specific handling for simultaneous different directions
    let finalCommandData: number | null = null;
    let separateLegsCommand: Command | null = null;

    if (headTime > 0 && legsTime > 0) { // Both motors need to move
      motorState.head = true;
      motorState.legs = true;
      if (headDirection === legsDirection) {
        motorState.direction = headDirection;
        finalCommandData = 0x06; // Command for both head and legs
      } else {
        // Different directions: prioritize head direction for main command, send legs separately
        motorState.direction = headDirection;
        finalCommandData = 0x02; // Head only for the main command
        separateLegsCommand = { command: [0x2, legsDirection === 'OPEN' ? 0x70 : 0x71], data: [0x04] };
      }
    } else if (headTime > 0) { // Only head moves
      motorState.head = true;
      motorState.legs = false;
      motorState.direction = headDirection;
      finalCommandData = 0x02;
    } else if (legsTime > 0) { // Only legs move
      motorState.legs = true;
      motorState.head = false;
      motorState.direction = legsDirection;
      finalCommandData = 0x04;
    } else { // No movement (should be caught by maxTime check, but as a fallback)
      motorState.head = false;
      motorState.legs = false;
      motorState.direction = 'STOP';
      await writeCommand([0x2, 0x73]); // Send stop
      return;
    }

    if (finalCommandData !== null) {
      const commandType = motorState.direction === 'OPEN' ? 0x70 : 0x71;
      await writeCommand({ command: [0x2, commandType], data: [finalCommandData] });
    }
    if (separateLegsCommand) {
      await writeCommand(separateLegsCommand);
      logInfo('[Octo] Preset - Legs moving separately due to different direction.');
    }

    const presetInterval = setInterval(() => {
      const elapsed = Date.now() - movementStartTime;
      let headReached = headTime <= 0 || !motorState.head;
      let legsReached = legsTime <= 0 || !motorState.legs;

      if (!headReached) {
        const headProgress = Math.min(1, elapsed / headTime);
        motorState.headPosition = headStartPosition + (targetHead - headStartPosition) * headProgress;
        publishState('head');
        if (elapsed >= headTime) {
          headReached = true;
          motorState.head = false; 
          if (finalCommandData === 0x02 || (finalCommandData === 0x06 && legsReached)) { // Stop head if it was its own command or if both stopped
             // No explicit stop command here, rely on timeout or next command
          }
          logInfo('[Octo] Preset - Head reached target.');
        }
      }

      if (!legsReached) {
        const legsProgress = Math.min(1, elapsed / legsTime);
        motorState.legsPosition = legsStartPosition + (targetLegs - legsStartPosition) * legsProgress;
        publishState('legs');
        if (elapsed >= legsTime) {
          legsReached = true;
          motorState.legs = false; 
          if (finalCommandData === 0x04 || (finalCommandData === 0x06 && headReached) || separateLegsCommand) {
            // No explicit stop command here
          }
          logInfo('[Octo] Preset - Legs reached target.');
        }
      }

      if (headReached && legsReached) {
        clearInterval(presetInterval);
        logInfo(`[Octo] Preset ${presetName} reached.`);
        motorState.direction = 'STOP';
        motorState.head = false;
        motorState.legs = false;
        movementStartTime = 0; 
        motorState.headPosition = targetHead;
        motorState.legsPosition = targetLegs;
        publishState('head');
        publishState('legs');
        // Send a final explicit stop for all motors as a safeguard.
        writeCommand([0x2, 0x73]).catch(err => logError("Error sending final stop after preset", err));
      }
    }, 250);

    // Timeout for the whole preset operation
    setTimeout(async () => {
      if (motorState.head || motorState.legs) { 
        clearInterval(presetInterval);
        logWarn(`[Octo] Preset ${presetName} timed out. Stopping motors.`);
        await stopAllMotors();
      }
    }, maxTime + 2000); // Increased buffer slightly
  };

  if (!cache.headMotor) {
    cache.headMotor = new Cover(mqtt, deviceData, buildEntityConfig('MotorHead'), buildCoverCommand('head'));
    publishState('head');
  }
  if (!cache.legsMotor) {
    cache.legsMotor = new Cover(mqtt, deviceData, buildEntityConfig('MotorLegs'), buildCoverCommand('legs'));
    publishState('legs');
  }
  if (!cache.flatButton) {
    cache.flatButton = new Button(mqtt, deviceData, buildEntityConfig('PresetFlat', { icon: 'mdi:bed-empty' }), () => moveToPreset('FLAT'));
  }
  if (!cache.zeroGButton) {
    cache.zeroGButton = new Button(mqtt, deviceData, buildEntityConfig('PresetZeroG', { icon: 'mdi:transfer' }), () => moveToPreset('ZERO_G'));
  }
  if (!cache.tvButton) {
    cache.tvButton = new Button(mqtt, deviceData, buildEntityConfig('PresetTV', { icon: 'mdi:television' }), () => moveToPreset('TV'));
  }
  if (!cache.readingButton) {
    // Using PresetLounge as a substitute for ReadingPreset as per en.ts
    cache.readingButton = new Button(mqtt, deviceData, buildEntityConfig('PresetLounge', { icon: 'mdi:book-open-variant' }), () => moveToPreset('READING'));
  }
  
  logInfo('[Octo] Motor entities setup complete.');
}; 