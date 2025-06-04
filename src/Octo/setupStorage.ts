import { IMQTTConnection } from '@mqtt/IMQTTConnection';
import { BLEController } from '../BLE/BLEController';
import { logInfo } from '@utils/logger';
import { OctoStorage } from './storage';

export function setupStorage(mqtt: IMQTTConnection, controller: BLEController): OctoStorage {
  logInfo('[Octo] Setting up storage');
  return new OctoStorage();
} 