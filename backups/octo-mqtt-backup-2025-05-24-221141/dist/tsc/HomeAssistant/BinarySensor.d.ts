import { IMQTTConnection } from '../MQTT/IMQTTConnection';
import { IDeviceData } from './IDeviceData';
import { EntityConfig } from './base/Entity';
import { StatefulEntity } from './base/StatefulEntity';
export declare class BinarySensor extends StatefulEntity<boolean> {
    constructor(mqtt: IMQTTConnection, deviceData: IDeviceData, config: EntityConfig);
    mapState(state?: boolean): string;
}
