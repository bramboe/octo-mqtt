export declare const extractPacketFromMessage: (message: Uint8Array) => {
    command: number[];
    data: number[];
} | null;
