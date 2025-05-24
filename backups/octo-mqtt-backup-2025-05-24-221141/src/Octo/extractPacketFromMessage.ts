import { logWarn } from '@utils/logger';
import { calculateChecksum } from './calculateChecksum';

export const extractPacketFromMessage = (message: Uint8Array) => {
  try {
  const arr = Array.from(message);
    
    if (arr.length === 0) {
      logWarn('[Octo] Received empty packet');
      return null;
    }
    
    // Check start marker
    if (arr[0] !== 0x40) {
      logWarn(`[Octo] Invalid start marker: ${arr[0].toString(16)}, expected 0x40`);
      return null;
    }
    arr.splice(0, 1); // Remove start marker
    
    // Check end marker
    if (arr[arr.length - 1] !== 0x40) {
      logWarn(`[Octo] Invalid end marker: ${arr[arr.length - 1].toString(16)}, expected 0x40`);
      return null;
    }
    arr.pop(); // Remove end marker
    
    // Packet must be at least 5 bytes (2 for command, 2 for length, 1 for checksum)
    if (arr.length < 5) {
      logWarn(`[Octo] Packet too short: ${arr.length} bytes`);
      return null;
    }

  const command = arr.splice(0, 2);

  const dataLenBytes = arr.splice(0, 2);
  const dataLen = (dataLenBytes[0] << 8) + dataLenBytes[1];

  const checksumBytes = arr.splice(0, 1);
  const checksum = checksumBytes[0];

    // Data length check
    if (dataLen !== arr.length) {
      logWarn(`[Octo] Data length mismatch: expected ${dataLen}, got ${arr.length}`);
      return null;
    }
    
    const data = [...arr]; // Clone the array
    
    // Checksum validation
    const calculatedChecksum = calculateChecksum([0x80, ...command, ...dataLenBytes, ...data]);
    if (checksum !== calculatedChecksum) {
      logWarn(`[Octo] Checksum mismatch: received ${checksum.toString(16)}, calculated ${calculatedChecksum.toString(16)}`);
      return null;
    }

  return { command, data };
  } catch (error) {
    logWarn(`[Octo] Error extracting packet: ${error}`);
    return null;
  }
};
