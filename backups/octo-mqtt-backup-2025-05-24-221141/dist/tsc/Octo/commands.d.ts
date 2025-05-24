export declare const HEAD_UP: number[];
export declare const HEAD_DOWN: number[];
export declare const FEET_UP: number[];
export declare const FEET_DOWN: number[];
export declare const BOTH_UP: number[];
export declare const BOTH_DOWN: number[];
export declare const STOP_MOVEMENT: number[];
export declare const LIGHT_ON: number[];
export declare const LIGHT_OFF: number[];
export declare const KEEP_ALIVE_PIN_TEMPLATE: number[];
/**
 * Generates the keep-alive command with the provided PIN.
 * @param pin A 4-digit string.
 * @returns The command array.
 */
export declare const getKeepAliveCommand: (pin: string) => number[];
export declare const REQUEST_FEATURES: number[];
