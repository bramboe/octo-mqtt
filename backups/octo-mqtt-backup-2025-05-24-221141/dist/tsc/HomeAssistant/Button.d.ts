import { IMQTTConnection } from '../MQTT/IMQTTConnection';
import { IDeviceData } from './IDeviceData';
import { Entity, EntityConfig } from './base/Entity';
export declare class Button extends Entity {
    private commandTopic;
    constructor(mqtt: IMQTTConnection, deviceData: IDeviceData, entityConfig: EntityConfig, onPress: () => Promise<void>);
    discoveryState(): {
        command_topic: string;
    };
}
