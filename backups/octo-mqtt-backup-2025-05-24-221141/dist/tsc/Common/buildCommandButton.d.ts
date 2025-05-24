import { IMQTTConnection } from '../MQTT/IMQTTConnection';
import { StringsKey } from '../Utils/getString';
import { IController } from './IController';
export declare const buildCommandButton: <TCommand>(context: string, mqtt: IMQTTConnection, { cache, deviceData, writeCommand }: IController<TCommand>, name: StringsKey, command: TCommand, category?: string) => void;
