import { IMQTTConnection } from '../MQTT/IMQTTConnection';
import { IDeviceData } from './IDeviceData';
import { EntityConfig } from './base/Entity';
import { StatefulEntity } from './base/StatefulEntity';
export type NumberSliderConfig = {
    min?: number;
    max?: number;
    icon?: string;
};
export declare class NumberSlider extends StatefulEntity<number> {
    private commandTopic;
    private min;
    private max;
    private icon?;
    constructor(mqtt: IMQTTConnection, deviceData: IDeviceData, { min, max, icon, ...config }: EntityConfig & NumberSliderConfig, onChange: (state: number) => Promise<void | number>);
    mapState(state?: number): string | null;
    discoveryState(): {
        command_topic: string;
        mode: string;
        icon: string | undefined;
        min: number;
        max: number;
        state_topic: string;
    };
}
