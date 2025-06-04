import { IMQTTConnection } from '../MQTT/IMQTTConnection';
import { logError } from '../Utils/logger';
import { IDeviceData } from '../HomeAssistant/IDeviceData';
import { Switch } from '../HomeAssistant/Switch';
import { IController } from './IController';
import { getString } from '../Utils/getString';
import { buildEntityConfig } from './buildEntityConfig';
import { Dictionary } from '../Utils/Dictionary';

export const buildRepeatingCommandSwitch = <T>(
  mqtt: IMQTTConnection,
  deviceData: IDeviceData,
  controller: IController<T>,
  cache: Dictionary<Switch>,
  name: string,
  onCommand: T,
  offCommand: T,
  context: string,
  interval: number = 1000,
  category?: string
): Switch | undefined => {
  if (cache[name]) return cache[name];

  let intervalId: NodeJS.Timeout | null = null;

  const entity = (cache[name] = new Switch(mqtt, deviceData, {
    description: name,
    category,
    icon: 'mdi:toggle-switch'
  }, async (state) => {
    try {
      if (state) {
        await controller.writeCommand(onCommand);
        intervalId = setInterval(async () => {
          try {
            await controller.writeCommand(onCommand);
          } catch (e) {
            logError(`[${context}] Failed to write '${name}' in interval`, e);
          }
        }, interval);
      } else {
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
        await controller.writeCommand(offCommand);
      }
      return true;
    } catch (e) {
      logError(`[${context}] Failed to write '${name}'`, e);
      return false;
    }
  }));

  return entity;
};
