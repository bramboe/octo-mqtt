import { IMQTTConnection } from '@mqtt/IMQTTConnection';
import { BLEController } from '../BLE/BLEController';
import { logInfo } from '@utils/logger';

export async function setupFlatEntities(mqtt: IMQTTConnection, controller: BLEController): Promise<void> {
  logInfo('[Octo] Setting up flat entities');
  // TODO: Implement flat entities setup
} 