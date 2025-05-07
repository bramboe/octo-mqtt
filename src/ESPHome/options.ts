import { getRootOptions } from '@utils/options';

export interface BLEProxy {
  host: string;
  port: number;
  password?: string;
  encryptionKey?: string;
  expectedServerName?: string;
}

// Use any type to avoid interface conflicts
const options = getRootOptions() as any;

export const getProxies = () => {
  const proxies = options.bleProxies;
  if (Array.isArray(proxies)) {
    return proxies as BLEProxy[];
  }
  return [];
};
