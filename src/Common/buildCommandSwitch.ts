import { Switch } from '../HomeAssistant/Switch';
import { IMQTTConnection } from '../MQTT/IMQTTConnection';
import { StringsKey, getString } from '../Utils/getString';
import { logError } from '../Utils/logger';
import { IController } from './IController';
import { buildEntityConfig } from './buildEntityConfig';

export const buildCommandSwitch = <TCommand>(
  context: string,
  mqtt: IMQTTConnection,
  { cache, deviceData, writeCommand }: IController<TCommand>,
  name: StringsKey,
  onCommand: TCommand,
  offCommand?: TCommand,
  category?: string
) => {
  if (cache[name]) return;

  cache[name] = new Switch(mqtt, deviceData, buildEntityConfig(name, category), async (state) => {
    const commandToSend = state ? onCommand : offCommand;
    if (!commandToSend) return;
    try {
      await writeCommand(commandToSend);
    } catch (e) {
      logError(`[${context}] Failed to write '${getString(name)}'`, e);
    }
  }).setOnline();
};
