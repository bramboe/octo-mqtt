import type { IMQTTConnection } from '@mqtt/IMQTTConnection';
import { connectToMQTT } from '@mqtt/connectToMQTT';
import { loadStrings } from '@utils/getString';
import { logError, logWarn } from '@utils/logger';
import { connectToESPHome } from 'ESPHome/connectToESPHome';
import { octo } from 'Octo/octo';

const processExit = (exitCode?: number) => {
  if (exitCode && exitCode > 0) {
    logError(`Exit code: ${exitCode}`);
  }
  process.exit();
};

process.on('exit', () => {
  logWarn('Shutting down Octo-MQTT...');
  processExit(0);
});
process.on('SIGINT', () => processExit(0));
process.on('SIGTERM', () => processExit(0));
process.on('uncaughtException', (err: Error) => {
  logError(err);
  processExit(2);
});

const start = async () => {
  await loadStrings();

  const mqtt: IMQTTConnection = await connectToMQTT();
  const esphome = await connectToESPHome();
  
  try {
    await octo(mqtt, esphome);
  } catch (error) {
    logError('Failed to initialize Octo MQTT:', error);
    processExit(1);
  }
};

void start();
