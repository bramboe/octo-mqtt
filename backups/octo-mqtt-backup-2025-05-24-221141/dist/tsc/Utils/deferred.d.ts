export declare class Deferred<T = void> {
    private _resolve;
    private _reject;
    private _promise;
    constructor();
    get promise(): Promise<T>;
    resolve(value: T | PromiseLike<T>): void;
    reject(reason?: any): void;
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null): Promise<TResult1 | TResult2>;
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null): Promise<T | TResult>;
    finally(onfinally?: (() => void) | null): Promise<T>;
}
