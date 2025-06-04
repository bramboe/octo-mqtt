// BLE Command Definitions for Octo Bed

// Movement Commands
export const HEAD_UP = [0x40, 0x02, 0x70, 0x00, 0x01, 0x0b, 0x02, 0x40];
export const HEAD_DOWN = [0x40, 0x02, 0x71, 0x00, 0x01, 0x0a, 0x02, 0x40];
export const FEET_UP = [0x40, 0x02, 0x70, 0x00, 0x01, 0x09, 0x04, 0x40];
export const FEET_DOWN = [0x40, 0x02, 0x71, 0x00, 0x01, 0x08, 0x04, 0x40];
export const BOTH_UP = [0x40, 0x02, 0x70, 0x00, 0x01, 0x07, 0x06, 0x40];
export const BOTH_DOWN = [0x40, 0x02, 0x71, 0x00, 0x01, 0x06, 0x06, 0x40];
export const STOP_MOVEMENT = [0x40, 0x02, 0x73, 0x00, 0x00, 0x0b, 0x40];

// Light Commands
export const LIGHT_ON = [0x40, 0x20, 0x72, 0x00, 0x08, 0xde, 0x00, 0x01, 0x02, 0x01, 0x01, 0x01, 0x01, 0x01, 0x40];
export const LIGHT_OFF = [0x40, 0x20, 0x72, 0x00, 0x08, 0xdf, 0x00, 0x01, 0x02, 0x01, 0x01, 0x01, 0x01, 0x00, 0x40];

// Keep Alive / PIN Command
// PIN digits (e.g., "1234") need to be inserted at indices 6, 7, 8, 9
export const KEEP_ALIVE_PIN_TEMPLATE = [
  0x40, // Prefix
  0x20, // Command type
  0x43, // Specific keep-alive command
  0x00, // Length
  0x04, // Additional length
  0x00, // Extra byte
  0x00, // PIN Digit 1 (placeholder)
  0x00, // PIN Digit 2 (placeholder)
  0x00, // PIN Digit 3 (placeholder)
  0x00, // PIN Digit 4 (placeholder)
  0x40, // Suffix
];

/**
 * Generates the keep-alive command with the provided PIN.
 * @param pin A 4-digit string.
 * @returns The command array.
 */
export const getKeepAliveCommand = (pin: string): number[] => {
  if (pin.length !== 4 || !/^[0-9]{4}$/.test(pin)) {
    throw new Error('PIN must be a 4-digit number string');
  }
  const pinDigits = pin.split('').map(digit => parseInt(digit, 10));
  const command = [...KEEP_ALIVE_PIN_TEMPLATE];
  command[6] = pinDigits[0];
  command[7] = pinDigits[1];
  command[8] = pinDigits[2];
  command[9] = pinDigits[3];
  return command;
};

// Feature Request Command
export const REQUEST_FEATURES = [0x20, 0x71];

export interface Command {
  command: number[];
  data?: number[];
}

export const buildComplexCommand = (command: Command): number[] => {
  if (!command.data) {
    return command.command;
  }
  return [...command.command, ...command.data];
}; 