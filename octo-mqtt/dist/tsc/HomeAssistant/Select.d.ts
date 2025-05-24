import { IMQTTConnection } from '../MQTT/IMQTTConnection';
import { IDeviceData } from './IDeviceData';
import { EntityConfig } from './base/Entity';
import { StatefulEntity } from './base/StatefulEntity';
export type SelectConfig = {
    options: string[];
};
export declare class Select extends StatefulEntity<string> {
    private commandTopic;
    private options;
    constructor(mqtt: IMQTTConnection, deviceData: IDeviceData, { options, ...config }: SelectConfig & EntityConfig, onChange: (state: string) => Promise<void | string>);
    getIndex(): number | undefined;
    setIndex(index: number): void;
    discoveryState(): {
        command_topic: string;
        options: string[];
        state_topic: string;
    };
}
