import { StringsKey, getString } from '@utils/getString';

export const buildEntityConfig = (
  key: StringsKey,
  additionalConfig?: string | { 
    category?: string; 
    icon?: string;
    unit?: string;
    precision?: number;
  }
) => {
  if (typeof additionalConfig === 'string') additionalConfig = { category: additionalConfig };
  return {
    description: getString(key),
    ...(additionalConfig || {}),
  };
};
