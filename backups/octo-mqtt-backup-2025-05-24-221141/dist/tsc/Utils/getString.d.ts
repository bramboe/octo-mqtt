import Strings from '../Strings/en';
export declare const loadStrings: (language?: string) => Promise<void>;
export type StringsKey = keyof typeof Strings;
export declare const getString: (key: StringsKey) => string;
