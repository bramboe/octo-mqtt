import { IMQTTConnection } from '../MQTT/IMQTTConnection';
import { StringsKey } from '../Utils/getString';
import { IController } from './IController';
export declare const buildRepeatingCommandSwitch: <TCommand>(context: string, mqtt: IMQTTConnection, { cache, deviceData, writeCommand, cancelCommands }: IController<TCommand>, name: StringsKey, command: TCommand, category?: string, count?: number, waitTime?: number) => void;
