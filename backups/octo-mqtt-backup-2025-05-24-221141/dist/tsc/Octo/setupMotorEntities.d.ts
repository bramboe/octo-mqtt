import { Cover } from '../HomeAssistant/Cover';
import { IMQTTConnection } from '../MQTT/IMQTTConnection';
import { Command } from './octo';
import { IController } from '../Common/IController';
import { Cancelable } from '../Common/Cancelable';
import { ICache } from '../Common/ICache';
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
export declare const setupMotorEntities: (mqtt: IMQTTConnection, { cache, deviceData, writeCommand, cancelCommands }: IController<number[] | Command> & ICache<Cache>) => void;
export {};
