import { IMQTTConnection } from '@mqtt/IMQTTConnection';
import { BLEController } from '../BLE/BLEController';
import { logInfo } from '@utils/logger';

export async function setupPresetEntities(mqtt: IMQTTConnection, controller: BLEController): Promise<void> {
  logInfo('[Octo] Setting up preset entities');
  // TODO: Implement preset entities setup
} 