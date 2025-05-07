import { Cover } from 'HomeAssistant/Cover';
import { IMQTTConnection } from '@mqtt/IMQTTConnection';
import { buildEntityConfig } from 'Common/buildEntityConfig';
import { Command } from './octo';
import { IController } from 'Common/IController';
import { Cancelable } from 'Common/Cancelable';
import { ICache } from 'Common/ICache';
import { arrayEquals } from '@utils/arrayEquals';
import { logInfo } from '@utils/logger';

interface MotorState {
  head: boolean;
  legs: boolean;
}
interface Directional {
  direction: string;
}

interface Cache {
  motorState?: MotorState & Directional & Cancelable;
  headMotor?: Cover;
  legsMotor?: Cover;
}

const motorPairs: Record<keyof MotorState, keyof MotorState> = {
  head: 'legs',
  legs: 'head',
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
    };
  }

  const updateMotorState = (main: keyof MotorState, command: string) => {
    const other = motorPairs[main];
    const motorState = cache.motorState!;
    const { direction, canceled, ...motors } = motorState;
    const moveMotors = command !== 'STOP';
    
    if (direction === command && motors[main] === moveMotors) return;

    motorState[main] = moveMotors;
    if (motors[other]) {
      if (!moveMotors) command = direction;
      else if (direction != command) motorState[other] = false;
    }
    motorState.direction = command;
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

  const commandsMatch = (commandA: Command | undefined, commandB: Command | undefined) => {
    if (commandA === commandB) return true;
    if (commandA === undefined || commandB === undefined) return false;
    return arrayEquals(commandA.command, commandB.command) && arrayEquals(commandA.data || [], commandB.data || []);
  };

  const buildCoverCommand = (main: keyof MotorState) => async (command: string) => {
    logInfo(`[Octo] Cover command received for ${main}: ${command}`);
    try {
      const motorState = cache.motorState!;
      const originalCommand = move(motorState);
      updateMotorState(main, command);
      const newCommand = move(motorState);
      
      const sendCommand = async () => {
        if (newCommand) {
          logInfo(`[Octo] Sending motor command: ${JSON.stringify(newCommand)}`);
          await writeCommand(newCommand);
          logInfo(`[Octo] Motor command sent successfully`);
        }
      };

      if (commandsMatch(newCommand, originalCommand)) {
        return await sendCommand();
      }

      motorState.canceled = true;
      await cancelCommands();
      motorState.canceled = false;

      if (newCommand) {
        await sendCommand();
        if (motorState.canceled) return;
        motorState.direction = 'STOP';
        motorState.head = false;
        motorState.legs = false;
      }
      
      logInfo(`[Octo] Sending stop command`);
      await writeCommand([0x2, 0x73]);
    } catch (error) {
      logInfo(`[Octo] Error executing cover command: ${error}`);
    }
  };

  try {
    logInfo('[Octo] Creating head motor entity');
    if (!cache.headMotor) {
      cache.headMotor = new Cover(
        mqtt,
        deviceData,
        buildEntityConfig('MotorHead', { icon: 'mdi:head' }),
        buildCoverCommand('head')
      );
      cache.headMotor.setOnline();
      logInfo('[Octo] Head motor entity created successfully');
    }

    logInfo('[Octo] Creating legs motor entity');
    if (!cache.legsMotor) {
      cache.legsMotor = new Cover(
        mqtt,
        deviceData,
        buildEntityConfig('MotorLegs', { icon: 'mdi:foot-print' }),
        buildCoverCommand('legs')
      );
      cache.legsMotor.setOnline();
      logInfo('[Octo] Legs motor entity created successfully');
    }
    
    logInfo('[Octo] Motor entities setup complete');
  } catch (error) {
    logInfo(`[Octo] Error setting up motor entities: ${error}`);
  }
};
