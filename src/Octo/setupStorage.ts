import { BLEController } from '../BLE/BLEController';

export interface OctoStorage {
  get(key: string): number;
  set(key: string, value: number): void;
}

export function setupStorage(_controller?: BLEController): OctoStorage {
  // TODO: Implement storage setup
  return {
    get: () => 0,
    set: () => {}
  };
} 