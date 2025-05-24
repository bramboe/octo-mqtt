import { IMQTTConnection } from '../../MQTT/IMQTTConnection';
import { Dictionary } from '../../Utils/Dictionary';
import { IDeviceData } from '../IDeviceData';
import { ComponentType as EntityWithStateComponentType } from './ComponentTypeWithState';
import { IAvailable } from './IAvailable';
type ComponentType = 'button' | 'cover' | EntityWithStateComponentType;
export type EntityConfig = {
    description: string;
    category?: string;
    icon?: string;
};
export declare class Entity implements IAvailable {
    protected mqtt: IMQTTConnection;
    protected deviceData: IDeviceData;
    protected entityConfig: EntityConfig;
    private componentType;
    protected baseTopic: string;
    private availabilityTopic;
    private entityTag;
    private uniqueId;
    constructor(mqtt: IMQTTConnection, deviceData: IDeviceData, entityConfig: EntityConfig, componentType: ComponentType);
    publishDiscovery(): void;
    protected discoveryState(): Dictionary<any>;
    setOffline(): this;
    setOnline(): this;
    private sendAvailability;
}
export {};
