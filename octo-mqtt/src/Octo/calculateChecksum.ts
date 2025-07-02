import { byte } from '../Utils/byte';
import { sum } from '../Utils/sum';

export const calculateChecksum = (bytes: number[]): number => byte((bytes.reduce(sum) ^ 0xff) + 1); 