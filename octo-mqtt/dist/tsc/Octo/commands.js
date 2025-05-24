"use strict";
// BLE Command Definitions for Octo Bed
Object.defineProperty(exports, "__esModule", { value: true });
exports.REQUEST_FEATURES = exports.getKeepAliveCommand = exports.KEEP_ALIVE_PIN_TEMPLATE = exports.LIGHT_OFF = exports.LIGHT_ON = exports.STOP_MOVEMENT = exports.BOTH_DOWN = exports.BOTH_UP = exports.FEET_DOWN = exports.FEET_UP = exports.HEAD_DOWN = exports.HEAD_UP = void 0;
// Movement Commands
exports.HEAD_UP = [0x40, 0x02, 0x70, 0x00, 0x01, 0x0b, 0x02, 0x40];
exports.HEAD_DOWN = [0x40, 0x02, 0x71, 0x00, 0x01, 0x0a, 0x02, 0x40];
exports.FEET_UP = [0x40, 0x02, 0x70, 0x00, 0x01, 0x09, 0x04, 0x40];
exports.FEET_DOWN = [0x40, 0x02, 0x71, 0x00, 0x01, 0x08, 0x04, 0x40];
exports.BOTH_UP = [0x40, 0x02, 0x70, 0x00, 0x01, 0x07, 0x06, 0x40];
exports.BOTH_DOWN = [0x40, 0x02, 0x71, 0x00, 0x01, 0x06, 0x06, 0x40];
exports.STOP_MOVEMENT = [0x40, 0x02, 0x73, 0x00, 0x00, 0x0b, 0x40];
// Light Commands
exports.LIGHT_ON = [0x40, 0x20, 0x72, 0x00, 0x08, 0xde, 0x00, 0x01, 0x02, 0x01, 0x01, 0x01, 0x01, 0x01, 0x40];
exports.LIGHT_OFF = [0x40, 0x20, 0x72, 0x00, 0x08, 0xdf, 0x00, 0x01, 0x02, 0x01, 0x01, 0x01, 0x01, 0x00, 0x40];
// Keep Alive / PIN Command
// PIN digits (e.g., "1234") need to be inserted at indices 6, 7, 8, 9
exports.KEEP_ALIVE_PIN_TEMPLATE = [
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
const getKeepAliveCommand = (pin) => {
    if (pin.length !== 4 || !/^[0-9]{4}$/.test(pin)) {
        throw new Error('PIN must be a 4-digit number string');
    }
    const pinDigits = pin.split('').map(digit => parseInt(digit, 10));
    const command = [...exports.KEEP_ALIVE_PIN_TEMPLATE];
    command[6] = pinDigits[0];
    command[7] = pinDigits[1];
    command[8] = pinDigits[2];
    command[9] = pinDigits[3];
    return command;
};
exports.getKeepAliveCommand = getKeepAliveCommand;
// Feature Request Command
exports.REQUEST_FEATURES = [0x20, 0x71];
//# sourceMappingURL=commands.js.map