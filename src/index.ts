import type { IMQTTConnection } from '@mqtt/IMQTTConnection';
import { connectToMQTT } from '@mqtt/connectToMQTT';
import { loadStrings } from '@utils/getString';
import { logError, logWarn } from '@utils/logger';
import { getType } from '@utils/options';
import { connectToESPHome } from 'ESPHome/connectToESPHome';
import { octo } from 'Octo/octo';
import { scanner } from 'Scanner/scanner';

const processExit = (exitCode?: number) => {
  if (exitCode && exitCode > 0) {
    logError(`Exit code: ${exitCode}`);
  }
  process.exit();
};

process.on('exit', () => {
  logWarn('Shutting down Smartbed-MQTT...');
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

  // http/udp
  // switch (getType()) {
    // case 'sleeptracker':
    //   return void (await sleeptracker(mqtt));
    // case 'ergowifi':
    //   return void (await ergowifi(mqtt));
    // case 'logicdata':
    //   return void (await logicdata(mqtt));
    // case 'ergomotion':
    //   return void (await ergomotion(mqtt));
  // }
  // bluetooth
  const esphome = await connectToESPHome();
  switch (getType()) {
    case 'octo':
      return void (await octo(mqtt, esphome));
    case 'scanner':
      return void (await scanner(esphome));
    default:
      logError(`Unsupported bed type: ${getType()}`);
      processExit(1);
  }
};
void start();
