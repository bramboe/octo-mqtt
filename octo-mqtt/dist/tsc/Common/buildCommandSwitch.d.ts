import { IMQTTConnection } from '../MQTT/IMQTTConnection';
import { StringsKey } from '../Utils/getString';
import { IController } from './IController';
export declare const buildCommandSwitch: <TCommand>(context: string, mqtt: IMQTTConnection, { cache, deviceData, writeCommand }: IController<TCommand>, name: StringsKey, onCommand: TCommand, offCommand?: TCommand, category?: string) => void;
