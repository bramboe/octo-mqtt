import { IMQTTConnection } from '../MQTT/IMQTTConnection';
import { StringsKey } from '../Utils/getString';
import { IController } from './IController';
export declare const buildCommandsButton: <TCommand>(context: string, mqtt: IMQTTConnection, { cache, deviceData, writeCommands }: IController<TCommand>, name: StringsKey, commands: TCommand[], category?: string) => void;
