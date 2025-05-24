import { IMQTTConnection } from '../MQTT/IMQTTConnection';
import { IDeviceData } from './IDeviceData';
import { Sensor } from './Sensor';
import { EntityConfig } from './base/Entity';
export type JsonSensorConfig = {
    valueField?: string;
};
export declare class JsonSensor<T> extends Sensor<T> {
    private valueField;
    constructor(mqtt: IMQTTConnection, deviceData: IDeviceData, { valueField, ...config }: JsonSensorConfig & EntityConfig);
    mapState(state: T | undefined): any;
    discoveryState(): {
        value_template: string;
        json_attributes_topic: string;
        state_topic: string;
    };
}
