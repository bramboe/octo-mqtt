import { Button } from '../HomeAssistant/Button';
import { IMQTTConnection } from '../MQTT/IMQTTConnection';
import { StringsKey, getString } from '../Utils/getString';
import { logError } from '../Utils/logger';
import { IController } from './IController';
import { buildEntityConfig } from './buildEntityConfig';

export const buildCommandsButton = <TCommand>(
  context: string,
  mqtt: IMQTTConnection,
  { cache, deviceData, writeCommands }: IController<TCommand>,
  name: StringsKey,
  commands: TCommand[],
  category?: string
) => {
  if (cache[name]) return;

  cache[name] = new Button(mqtt, deviceData, buildEntityConfig(name, category), async () => {
    try {
      await writeCommands(commands);
    } catch (e) {
      logError(`[${context}] Failed to write '${getString(name)}'`, e);
    }
  }).setOnline();
};
