"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loopWithWait = void 0;
const wait_1 = require("./wait");
const loopWithWait = async (items, body, delay = 50) => {
    let itemsLeft = items.length;
    for (const item of items) {
        await body(item);
        if (--itemsLeft)
            await (0, wait_1.wait)(delay);
    }
};
exports.loopWithWait = loopWithWait;
//# sourceMappingURL=loopWithWait.js.map