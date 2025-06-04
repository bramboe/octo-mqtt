import { IMQTTConnection } from '../MQTT/IMQTTConnection';
import { logError } from '../Utils/logger';
import { IDeviceData } from '../HomeAssistant/IDeviceData';
import { Switch } from '../HomeAssistant/Switch';
import { IController } from './IController';
import { getString } from '../Utils/getString';
import { buildEntityConfig } from './buildEntityConfig';
import { Dictionary } from '../Utils/Dictionary';

export const buildCommandSwitch = <T>(
  mqtt: IMQTTConnection,
  deviceData: IDeviceData,
  controller: IController<T>,
  cache: Dictionary<Switch>,
  name: string,
  onCommand: T,
  offCommand: T,
  context: string,
  category?: string
): Switch | undefined => {
  if (cache[name]) return cache[name];

  cache[name] = new Switch(mqtt, deviceData, {
    description: name,
    category,
    icon: 'mdi:toggle-switch'
  }, async (state) => {
    try {
      await controller.writeCommand(state ? onCommand : offCommand);
      return true;
    } catch (e) {
      logError(`[${context}] Failed to write '${name}'`, e);
      return false;
    }
  });

  return cache[name];
};
