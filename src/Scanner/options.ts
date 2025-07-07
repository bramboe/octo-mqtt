import { getRootOptions } from '@utils/options';

export interface ScannerDevice {
  name: string;
  pair?: boolean;
}

// We're no longer using Scanner, so always return an empty array
export const getDevices = (): ScannerDevice[] => {
  return [];
};
