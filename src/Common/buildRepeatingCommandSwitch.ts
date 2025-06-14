import { Switch } from '../HomeAssistant/Switch';
import { IMQTTConnection } from '../MQTT/IMQTTConnection';
import { StringsKey, getString } from '../Utils/getString';
import { logError } from '../Utils/logger';
import { buildEntityConfig } from './buildEntityConfig';
import { IController } from './IController';

export const buildRepeatingCommandSwitch = <TCommand>(
  context: string,
  mqtt: IMQTTConnection,
  { cache, deviceData, writeCommand, cancelCommands }: IController<TCommand>,
  name: StringsKey,
  command: TCommand,
  category?: string,
  count?: number,
  waitTime?: number
) => {
  if (cache[name]) return;

  const entity = (cache[name] = new Switch(mqtt, deviceData, buildEntityConfig(name, category), async (state) => {
    if (!state) return cancelCommands();
    try {
      await writeCommand(command, count, waitTime);
      entity.setState(false);
    } catch (e) {
      logError(`[${context}] Failed to write '${getString(name)}'`, e);
    }
  }).setOnline());
};
