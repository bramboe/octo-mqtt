import { IMQTTConnection } from '../MQTT/IMQTTConnection';
import { IDeviceData } from './IDeviceData';
import { EntityConfig } from './base/Entity';
import { StatefulEntity } from './base/StatefulEntity';
export type LightState = {
    status?: boolean;
    brightness?: number;
    color?: {
        r: number;
        g: number;
        b: number;
    };
};
type LightConfig = {
    supportsBrightness?: boolean;
    supportsRGB?: boolean;
};
export declare class Light extends StatefulEntity<LightState> {
    private supportsBrightness;
    private supportsRGB;
    private commandTopic;
    private supportedColorMode;
    constructor(mqtt: IMQTTConnection, deviceData: IDeviceData, { supportsBrightness, supportsRGB, ...config }: LightConfig & EntityConfig, onChange: (state: LightState) => Promise<void | LightState>);
    mapState(state: LightState | undefined): any;
    discoveryState(): {
        schema: string;
        brightness: boolean;
        command_topic: string;
        supported_color_modes: string[];
        state_topic: string;
    };
}
export {};
