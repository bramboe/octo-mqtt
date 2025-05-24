import { IDeviceData } from '../IDeviceData';
import { IMQTTConnection } from '../../MQTT/IMQTTConnection';
import { ComponentType } from './ComponentTypeWithState';
import { Entity, EntityConfig } from './Entity';
import { IStateful } from './IStateful';
export declare class StatefulEntity<T> extends Entity implements IStateful<T> {
    stateTopic: string;
    private state?;
    constructor(mqtt: IMQTTConnection, deviceData: IDeviceData, entityConfig: EntityConfig, componentType: ComponentType);
    discoveryState(): {
        state_topic: string;
    };
    protected mapState(state: T | undefined): any;
    setState(state: T | null): this;
    getState(): T | undefined;
    private sendState;
}
