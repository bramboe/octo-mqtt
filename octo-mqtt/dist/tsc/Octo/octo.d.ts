import { IMQTTConnection } from '../MQTT/IMQTTConnection';
import { IESPConnection } from '../ESPHome/IESPConnection';
export type Command = {
    command: number[];
    data?: number[];
};
export declare const octo: (mqtt: IMQTTConnection, esphome: IESPConnection) => Promise<void>;
