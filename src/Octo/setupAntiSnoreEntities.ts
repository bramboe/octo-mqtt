import { IMQTTConnection } from '@mqtt/IMQTTConnection';
import { BLEController } from '../BLE/BLEController';
import { logInfo } from '@utils/logger';

export async function setupAntiSnoreEntities(mqtt: IMQTTConnection, controller: BLEController): Promise<void> {
  logInfo('[Octo] Setting up anti-snore entities');
  // TODO: Implement anti-snore entities setup
} 