import { IMQTTConnection } from '../MQTT/IMQTTConnection';
import { logError } from '../Utils/logger';
import { IDeviceData } from '../HomeAssistant/IDeviceData';
import { Button } from '../HomeAssistant/Button';
import { IController } from './IController';
import { getString } from '../Utils/getString';
import { buildEntityConfig } from './buildEntityConfig';
import { Dictionary } from '../Utils/Dictionary';

export const buildCommandsButton = <T>(
  mqtt: IMQTTConnection,
  deviceData: IDeviceData,
  controller: IController<T>,
  cache: Dictionary<Button>,
  name: string,
  commands: T[],
  context: string,
  category?: string
): Button | undefined => {
  if (cache[name]) return cache[name];

  cache[name] = new Button(mqtt, deviceData, {
    description: name,
    category,
    icon: 'mdi:button'
  }, async () => {
    try {
      await controller.writeCommands(commands);
    } catch (e) {
      logError(`[${context}] Failed to write '${name}'`, e);
    }
  });

  return cache[name];
};
