export declare class Timer {
    private onTick;
    private count;
    private waitTime?;
    private onFinish?;
    private finished;
    private canceled;
    private isCanceled;
    private waitAtEnd?;
    constructor(onTick: () => void | Promise<void>, count?: number, waitTime?: number | undefined, onFinish?: (() => void | Promise<void>) | undefined);
    extendCount: (count: number) => number;
    start: () => Promise<void>;
    cancel: () => Promise<void>;
}
