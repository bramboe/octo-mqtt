import { IMQTTConnection } from '../MQTT/IMQTTConnection';
import { IDeviceData } from './IDeviceData';
import { EntityConfig } from './base/Entity';
import { StatefulEntity } from './base/StatefulEntity';
export declare class Switch extends StatefulEntity<boolean> {
    private commandTopic;
    constructor(mqtt: IMQTTConnection, deviceData: IDeviceData, entityConfig: EntityConfig, onChange: (state: boolean) => Promise<void | boolean>);
    mapState(state?: boolean): string;
    discoveryState(): {
        command_topic: string;
        state_topic: string;
    };
}
