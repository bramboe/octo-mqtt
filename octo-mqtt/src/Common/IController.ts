import { IDeviceData } from '../HomeAssistant/IDeviceData';
import { Dictionary } from '../Utils/Dictionary';

export interface IDeviceCache {
  cache: Dictionary<Object>;
  deviceData: IDeviceData;
}

export interface IController<TCommand> extends IDeviceCache {
  writeCommand: (command: TCommand, count?: number, waitTime?: number) => Promise<void>;
  writeCommands: (commands: TCommand[], count?: number, waitTime?: number) => Promise<void>;
  cancelCommands: () => Promise<void>;
} 