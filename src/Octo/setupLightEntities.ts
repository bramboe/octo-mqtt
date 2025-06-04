import { IMQTTConnection } from '@mqtt/IMQTTConnection';
import { BLEController } from '../BLE/BLEController';
import { logInfo } from '@utils/logger';

export async function setupLightEntities(mqtt: IMQTTConnection, controller: BLEController): Promise<void> {
  logInfo('[Octo] Setting up light entities');
  // TODO: Implement light entities setup
} 