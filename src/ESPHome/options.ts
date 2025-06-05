import { getRootOptions } from '../Utils/options';

export interface BLEProxy {
  host: string;
  port?: number;
  password?: string;
  encryptionKey?: string;
  expectedServerName?: string;
}

const DEFAULT_PORT = 6053;

export const getProxies = () => {
  // Read fresh configuration each time instead of caching
  const options = getRootOptions() as any;
  const proxies = options.bleProxies;
  if (Array.isArray(proxies)) {
    return proxies.map(proxy => ({
      ...proxy,
      port: proxy.port || DEFAULT_PORT
    })) as BLEProxy[];
  }
  return [];
};
