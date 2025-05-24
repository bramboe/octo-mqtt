import { IMQTTConnection } from '../MQTT/IMQTTConnection';
import { IDeviceData } from './IDeviceData';
import { Entity, EntityConfig } from './base/Entity';
export declare class Cover extends Entity {
    private commandTopic;
    private positionTopic;
    private positionStateTopic;
    constructor(mqtt: IMQTTConnection, deviceData: IDeviceData, entityConfig: EntityConfig, onCommand: (command: string) => void);
    /**
     * Publish the current position of the cover to Home Assistant
     * @param position Position value between 0 and 1 (0 = closed, 1 = open)
     */
    publishPosition(position: number): void;
    discoveryState(): {
        command_topic: string;
        position_topic: string;
        state_topic: string;
        position_open: number;
        position_closed: number;
        set_position_topic: string;
        position_template: string;
    };
}
