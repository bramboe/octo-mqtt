"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Commands = void 0;
var Commands;
(function (Commands) {
    Commands[Commands["PresetFlat"] = 134217728] = "PresetFlat";
    Commands[Commands["PresetZeroG"] = 4096] = "PresetZeroG";
    Commands[Commands["PresetMemory1"] = 8192] = "PresetMemory1";
    Commands[Commands["PresetMemory2"] = 16384] = "PresetMemory2";
    Commands[Commands["PresetMemory3"] = 32768] = "PresetMemory3";
    Commands[Commands["PresetMemory4"] = 65536] = "PresetMemory4";
    Commands[Commands["MotorHeadUp"] = 1] = "MotorHeadUp";
    Commands[Commands["MotorHeadDown"] = 2] = "MotorHeadDown";
    Commands[Commands["MotorFeetUp"] = 4] = "MotorFeetUp";
    Commands[Commands["MotorFeetDown"] = 8] = "MotorFeetDown";
    Commands[Commands["MotorTiltUp"] = 16] = "MotorTiltUp";
    Commands[Commands["MotorTiltDown"] = 32] = "MotorTiltDown";
    Commands[Commands["MotorLumbarUp"] = 64] = "MotorLumbarUp";
    Commands[Commands["MotorLumbarDown"] = 128] = "MotorLumbarDown";
    Commands[Commands["MassageHeadUp"] = 2048] = "MassageHeadUp";
    Commands[Commands["MassageHeadDown"] = 8388608] = "MassageHeadDown";
    Commands[Commands["MassageFootUp"] = 1024] = "MassageFootUp";
    Commands[Commands["MassageFootDown"] = 16777216] = "MassageFootDown";
    Commands[Commands["MassageStep"] = 256] = "MassageStep";
    Commands[Commands["MassageTimerStep"] = 512] = "MassageTimerStep";
    Commands[Commands["MassageWaveStep"] = 268435456] = "MassageWaveStep";
    Commands[Commands["ToggleSafetyLights"] = 131072] = "ToggleSafetyLights";
    // Reset = 0x8001000,
    // MassageWaveStep = 0x100000,
    // MassageMode2 = 0x200000,
    // MassageLumbarUp = 0x400000,
})(Commands || (exports.Commands = Commands = {}));
//# sourceMappingURL=Commands.js.map