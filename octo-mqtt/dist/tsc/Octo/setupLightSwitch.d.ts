import { IMQTTConnection } from '../MQTT/IMQTTConnection';
import { Switch } from '../HomeAssistant/Switch';
import { IController } from '../Common/IController';
import { Command } from './octo';
import { IEventSource } from '../Common/IEventSource';
interface LightCache {
    lightSwitch?: Switch;
    lightState?: boolean;
}
export declare const setupLightSwitch: (mqtt: IMQTTConnection, controller: IController<number[] | Command> & IEventSource & {
    cache: LightCache;
}, initialState?: boolean) => void;
export {};
