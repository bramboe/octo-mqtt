import { IMQTTConnection } from '../MQTT/IMQTTConnection';
import { IDeviceData } from './IDeviceData';
import { EntityConfig } from './base/Entity';
import { StatefulEntity } from './base/StatefulEntity';
export declare class Sensor<T> extends StatefulEntity<T> {
    constructor(mqtt: IMQTTConnection, deviceData: IDeviceData, entityConfig: EntityConfig);
}
