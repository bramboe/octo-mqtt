import { logWarn } from '../Utils/logger';

export const extractFeatureValuePairFromData = (data: number[]) => {
  try {
  const arr = Array.from(data);
    if (arr.length === 0) {
      logWarn('[Octo] Received empty data array for feature extraction');
      return null;
    }

    // Require at least 6 bytes for a valid feature payload
    if (arr.length < 6) {
      logWarn(`[Octo] Received too short data array for feature extraction: ${arr.length} bytes`);
      return null;
    }

  const feature = arr.splice(0, 3).reduce((val, byte) => (val << 8) + byte, 0);
  arr.splice(0, 1)[0]; // flag?
    
    // Get skip length
  const skipLength = arr.splice(0, 1)[0];
    
    // Ensure we have enough bytes remaining
    if (arr.length < skipLength + 1) {
      logWarn(`[Octo] Not enough bytes remaining for feature ${feature.toString(16)}: expected ${skipLength + 1}, got ${arr.length}`);
      return null;
    }
    
  arr.splice(0, skipLength + 1); // ??
  const value = arr;
    
  return { feature, value };
  } catch (error) {
    logWarn(`[Octo] Error extracting feature data: ${error}`);
    return null;
  }
}; 