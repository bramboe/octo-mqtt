import { Dictionary } from './Dictionary';

const strings: Dictionary<string> = {
  // Add your string translations here
  'LIGHT_ON': 'Light On',
  'LIGHT_OFF': 'Light Off',
  'HEAD_UP': 'Head Up',
  'HEAD_DOWN': 'Head Down',
  'FEET_UP': 'Feet Up',
  'FEET_DOWN': 'Feet Down',
  'STOP': 'Stop',
  'FLAT': 'Flat',
  'ZERO_G': 'Zero Gravity',
  'ANTI_SNORE': 'Anti Snore',
  'MEMORY_1': 'Memory 1',
  'MEMORY_2': 'Memory 2'
};

export type StringsKey = keyof typeof strings;

export const getString = (key: StringsKey | string): string => {
  if (typeof key === 'string' && key in strings) {
    return strings[key as StringsKey];
  }
  return String(key);
};
