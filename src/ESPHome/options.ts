import { getRootOptions } from '../Utils/options';

export interface BLEProxy {
  host: string;
  port: number;
  password?: string;
  encryptionKey?: string;
  expectedServerName?: string;
}

export const getProxies = () => {
  // Read fresh configuration each time instead of caching
  const options = getRootOptions() as any;
  const proxies = options.bleProxies;
  if (Array.isArray(proxies)) {
    return proxies as BLEProxy[];
  }
  return [];
};
