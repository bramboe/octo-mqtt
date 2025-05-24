"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Deferred = void 0;
class Deferred {
    constructor() {
        this._promise = new Promise((resolve, reject) => {
            this._resolve = resolve;
            this._reject = reject;
        });
    }
    get promise() {
        return this._promise;
    }
    resolve(value) {
        this._resolve(value);
    }
    reject(reason) {
        this._reject(reason);
    }
    then(onfulfilled, onrejected) {
        return this._promise.then(onfulfilled, onrejected);
    }
    catch(onrejected) {
        return this._promise.catch(onrejected);
    }
    finally(onfinally) {
        return this._promise.finally(onfinally);
    }
}
exports.Deferred = Deferred;
//# sourceMappingURL=deferred.js.map