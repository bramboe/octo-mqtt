"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Timer = void 0;
const deferred_1 = require("./deferred");
const wait_1 = require("./wait");
class Timer {
    constructor(onTick, count = 1, waitTime, onFinish) {
        this.onTick = onTick;
        this.count = count;
        this.waitTime = waitTime;
        this.onFinish = onFinish;
        this.finished = new deferred_1.Deferred();
        this.canceled = new deferred_1.Deferred();
        this.isCanceled = false;
        this.extendCount = (count) => (this.count = count);
        this.start = async () => {
            while (this.count > 0) {
                try {
                    const remainingCount = --this.count;
                    const promises = [this.onTick()];
                    if (this.waitTime && (remainingCount || this.waitAtEnd))
                        promises.push((0, wait_1.wait)(this.waitTime));
                    await Promise.race([this.canceled, Promise.all(promises)]);
                }
                catch (err) {
                    this.finished.reject(err);
                }
                if (this.isCanceled)
                    break;
            }
            if (this.onFinish)
                await this.onFinish();
            this.finished.resolve();
        };
        this.cancel = async () => {
            this.canceled.resolve();
            this.isCanceled = true;
            this.count = 0;
            await this.finished;
        };
        this.waitAtEnd = this.count === 1 && !!this.waitTime;
    }
}
exports.Timer = Timer;
//# sourceMappingURL=Timer.js.map