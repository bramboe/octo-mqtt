import { IMQTTConnection } from '../MQTT/IMQTTConnection';
import { Cover } from './Cover';
import { IDeviceData } from './IDeviceData';
import { EntityConfig } from './base/Entity';
export declare class PositionalCover extends Cover {
    private options;
    private setPositionTopic;
    private position;
    constructor(mqtt: IMQTTConnection, deviceData: IDeviceData, config: EntityConfig, onSetPosition: (position: number) => void, options?: {
        positionOpen?: number;
        positionClosed?: number;
        onStop?: () => void;
    });
    discoveryState(): {
        set_position_topic: string;
        position_open: number;
        position_closed: number;
        command_topic: string;
        position_topic: string;
        state_topic: string;
        position_template: string;
    };
    setPosition(position: number | null): this;
    getPosition(): number;
    protected mapPosition(position: number | undefined): any;
    private sendPosition;
}
