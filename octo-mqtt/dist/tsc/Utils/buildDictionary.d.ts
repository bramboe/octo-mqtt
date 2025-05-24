import { Dictionary } from './Dictionary';
export declare const buildDictionary: <TItem, TValue>(items: TItem[], mapper: (item: TItem) => {
    key: string;
    value: TValue;
}) => Dictionary<TValue>;
