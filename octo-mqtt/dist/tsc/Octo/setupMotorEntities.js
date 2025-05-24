"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupMotorEntities = void 0;
const Cover_1 = require("../HomeAssistant/Cover");
const buildEntityConfig_1 = require("../Common/buildEntityConfig");
const arrayEquals_1 = require("../Utils/arrayEquals");
const logger_1 = require("../Utils/logger");
const Button_1 = require("../HomeAssistant/Button");
const motorPairs = {
    head: 'legs',
    legs: 'head',
};
const DEFAULT_UP_DURATION_MS = 30000;
// Add preset positions similar to ESPHome implementation
const PRESETS = {
    FLAT: { head: 0, legs: 0 },
    ZERO_G: { head: 15, legs: 30 },
    TV: { head: 45, legs: 5 },
    READING: { head: 60, legs: 10 }
};
const setupMotorEntities = (mqtt, { cache, deviceData, writeCommand, cancelCommands }) => {
    (0, logger_1.logInfo)('[Octo] Setting up motor entities...');
    if (!cache.motorState) {
        cache.motorState = {
            direction: 'STOP',
            head: false,
            legs: false,
            canceled: false,
            headPosition: 0,
            legsPosition: 0,
            headUpDuration: DEFAULT_UP_DURATION_MS,
            feetUpDuration: DEFAULT_UP_DURATION_MS
        };
    }
    let movementStartTime = 0;
    let headStartPosition = 0;
    let legsStartPosition = 0;
    const updateMotorState = (main, command) => {
        const other = motorPairs[main];
        const motorState = cache.motorState;
        const { direction, canceled, ...motors } = motorState;
        const moveMotors = command !== 'STOP';
        if (direction === command && motors[main] === moveMotors)
            return;
        motorState[main] = moveMotors;
        if (motors[other]) {
            if (!moveMotors)
                command = direction;
            else if (direction != command)
                motorState[other] = false;
        }
        motorState.direction = command;
        if (moveMotors) {
            movementStartTime = Date.now();
            headStartPosition = motorState.headPosition;
            legsStartPosition = motorState.legsPosition;
        }
    };
    const move = (motorState) => {
        const { head, legs, direction } = motorState;
        const motor = (head ? 0x2 : 0x0) + (legs ? 0x4 : 0x0);
        if (direction === 'STOP' || motor === 0x0)
            return undefined;
        return {
            command: [0x2, direction == 'OPEN' ? 0x70 : 0x71],
            data: [motor],
        };
    };
    const moveBoth = async (direction) => {
        (0, logger_1.logInfo)(`[Octo] Moving both motors ${direction}`);
        try {
            await writeCommand([0x2, 0x73]);
            const motorState = cache.motorState;
            motorState.head = true;
            motorState.legs = true;
            motorState.direction = direction;
            movementStartTime = Date.now();
            headStartPosition = motorState.headPosition;
            legsStartPosition = motorState.legsPosition;
            const command = {
                command: [0x2, direction === 'OPEN' ? 0x70 : 0x71],
                data: [0x06]
            };
            await writeCommand(command);
            (0, logger_1.logInfo)(`[Octo] Both motors movement started`);
            setTimeout(async () => {
                if (motorState.head && motorState.legs && motorState.direction === direction) {
                    await writeCommand([0x2, 0x73]);
                    (0, logger_1.logInfo)(`[Octo] Both motors auto-stopped after timeout`);
                    updatePositionBasedOnElapsed();
                    motorState.head = false;
                    motorState.legs = false;
                    motorState.direction = 'STOP';
                    publishState('head');
                    publishState('legs');
                }
            }, Math.max(cache.motorState.headUpDuration, cache.motorState.feetUpDuration));
            return true;
        }
        catch (error) {
            (0, logger_1.logError)(`[Octo] Error moving both motors: ${error}`);
            return false;
        }
    };
    const stopAllMotors = async () => {
        (0, logger_1.logInfo)('[Octo] Stopping all motors');
        try {
            await writeCommand([0x2, 0x73]);
            await writeCommand([0x2, 0x73]);
            const motorState = cache.motorState;
            motorState.head = false;
            motorState.legs = false;
            motorState.direction = 'STOP';
            updatePositionBasedOnElapsed();
            movementStartTime = 0;
            publishState('head');
            publishState('legs');
            (0, logger_1.logInfo)('[Octo] All motors stopped successfully');
            return true;
        }
        catch (error) {
            (0, logger_1.logError)(`[Octo] Error stopping motors: ${error}`);
            return false;
        }
    };
    const commandsMatch = (commandA, commandB) => {
        if (commandA === commandB)
            return true;
        if (commandA === undefined || commandB === undefined)
            return false;
        return (0, arrayEquals_1.arrayEquals)(commandA.command, commandB.command) && (0, arrayEquals_1.arrayEquals)(commandA.data || [], commandB.data || []);
    };
    const updatePositionBasedOnElapsed = () => {
        if (movementStartTime === 0)
            return;
        const motorState = cache.motorState;
        const elapsedMs = Date.now() - movementStartTime;
        if (motorState.head) {
            const headDuration = motorState.headUpDuration || DEFAULT_UP_DURATION_MS;
            const headChange = (elapsedMs / headDuration) * 100;
            if (motorState.direction === 'OPEN') {
                motorState.headPosition = Math.min(100, headStartPosition + headChange);
            }
            else {
                motorState.headPosition = Math.max(0, headStartPosition - headChange);
            }
            if (Math.floor(motorState.headPosition) % 5 === 0) {
                (0, logger_1.logInfo)(`[Octo] Head position updated: ${motorState.headPosition.toFixed(1)}%`);
            }
        }
        if (motorState.legs) {
            const legsDuration = motorState.feetUpDuration || DEFAULT_UP_DURATION_MS;
            const legsChange = (elapsedMs / legsDuration) * 100;
            if (motorState.direction === 'OPEN') {
                motorState.legsPosition = Math.min(100, legsStartPosition + legsChange);
            }
            else {
                motorState.legsPosition = Math.max(0, legsStartPosition - legsChange);
            }
            if (Math.floor(motorState.legsPosition) % 5 === 0) {
                (0, logger_1.logInfo)(`[Octo] Legs position updated: ${motorState.legsPosition.toFixed(1)}%`);
            }
        }
    };
    const buildCoverCommand = (main) => async (command) => {
        (0, logger_1.logInfo)(`[Octo] Cover command received for ${main}: ${command}`);
        try {
            if (command === 'STOP') {
                return await stopAllMotors();
            }
            const motorState = cache.motorState;
            const otherMotor = motorPairs[main];
            const bothActive = motorState[main] && motorState[otherMotor];
            if (bothActive) {
                (0, logger_1.logInfo)(`[Octo] Both motors active, moving both ${command}`);
                return await moveBoth(command);
            }
            const originalCommand = move(motorState);
            updateMotorState(main, command);
            const newCommand = move(motorState);
            const sendCommand = async () => {
                if (newCommand) {
                    (0, logger_1.logInfo)(`[Octo] Sending motor command: ${JSON.stringify(newCommand)}`);
                    await writeCommand(newCommand);
                    (0, logger_1.logInfo)(`[Octo] Motor command sent successfully`);
                    const updateInterval = setInterval(() => {
                        updatePositionBasedOnElapsed();
                        const motorState = cache.motorState;
                        if (main === 'head' &&
                            ((motorState.direction === 'OPEN' && motorState.headPosition >= 100) ||
                                (motorState.direction === 'CLOSE' && motorState.headPosition <= 0))) {
                            clearInterval(updateInterval);
                            motorState.head = false;
                            motorState.direction = 'STOP';
                            (0, logger_1.logInfo)(`[Octo] Head reached ${motorState.direction === 'OPEN' ? 'top' : 'bottom'} position`);
                        }
                        if (main === 'legs' &&
                            ((motorState.direction === 'OPEN' && motorState.legsPosition >= 100) ||
                                (motorState.direction === 'CLOSE' && motorState.legsPosition <= 0))) {
                            clearInterval(updateInterval);
                            motorState.legs = false;
                            motorState.direction = 'STOP';
                            (0, logger_1.logInfo)(`[Octo] Legs reached ${motorState.direction === 'OPEN' ? 'top' : 'bottom'} position`);
                        }
                    }, 200);
                    setTimeout(() => {
                        clearInterval(updateInterval);
                        motorState.head = false;
                        motorState.legs = false;
                        motorState.direction = 'STOP';
                        (0, logger_1.logInfo)(`[Octo] Movement timed out, stopping motors`);
                    }, Math.max(motorState.headUpDuration, motorState.feetUpDuration));
                }
            };
            if (commandsMatch(newCommand, originalCommand)) {
                return await sendCommand();
            }
            motorState.canceled = true;
            await cancelCommands();
            motorState.canceled = false;
            if (newCommand) {
                await sendCommand();
                if (motorState.canceled)
                    return;
                movementStartTime = 0;
                motorState.direction = 'STOP';
                motorState.head = false;
                motorState.legs = false;
            }
            (0, logger_1.logInfo)(`[Octo] Sending stop command`);
            await writeCommand([0x2, 0x73]);
        }
        catch (error) {
            (0, logger_1.logError)(`[Octo] Error executing cover command: ${error}`);
        }
    };
    const publishState = (main) => {
        const motorState = cache.motorState;
        const position = main === 'head' ? motorState.headPosition : motorState.legsPosition;
        const haPosition = position / 100;
        if (main === 'head' && cache.headMotor) {
            cache.headMotor.publishPosition(haPosition);
            (0, logger_1.logInfo)(`[Octo] Published head position: ${position.toFixed(1)}%`);
        }
        else if (main === 'legs' && cache.legsMotor) {
            cache.legsMotor.publishPosition(haPosition);
            (0, logger_1.logInfo)(`[Octo] Published legs position: ${position.toFixed(1)}%`);
        }
    };
    // Add a method to move to a preset position
    const moveToPreset = async (presetName) => {
        (0, logger_1.logInfo)(`[Octo] Moving to preset position: ${presetName}`);
        try {
            // Get the preset positions
            const preset = PRESETS[presetName];
            if (!preset) {
                (0, logger_1.logError)(`[Octo] Unknown preset: ${presetName}`);
                return false;
            }
            // Update current positions in cache
            const motorState = cache.motorState;
            // Calculate if we need to move head or feet first to avoid collision
            const headNeedsToMoveDown = motorState.headPosition > preset.head;
            const legsNeedsToMoveDown = motorState.legsPosition > preset.legs;
            // If both need to move down, do that first
            if (headNeedsToMoveDown && legsNeedsToMoveDown) {
                // Move both down
                await moveBoth('CLOSE');
                // Update positions to target
                motorState.headPosition = preset.head;
                motorState.legsPosition = preset.legs;
                publishState('head');
                publishState('legs');
                return true;
            }
            // If both need to move up, do that together
            if (!headNeedsToMoveDown && !legsNeedsToMoveDown) {
                // Move both up
                await moveBoth('OPEN');
                // Update positions to target
                motorState.headPosition = preset.head;
                motorState.legsPosition = preset.legs;
                publishState('head');
                publishState('legs');
                return true;
            }
            // Otherwise, move them individually
            // Move head first
            if (headNeedsToMoveDown !== (motorState.headPosition === preset.head)) {
                // Head needs to move
                motorState.head = true;
                motorState.legs = false;
                motorState.direction = headNeedsToMoveDown ? 'CLOSE' : 'OPEN';
                const command = move(motorState);
                if (command) {
                    await writeCommand(command);
                    // Wait for an appropriate time based on position difference
                    const positionDiff = Math.abs(motorState.headPosition - preset.head);
                    const waitTime = (positionDiff / 100) * motorState.headUpDuration;
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                    // Stop the movement
                    await writeCommand([0x2, 0x73]);
                }
                // Update position
                motorState.headPosition = preset.head;
                publishState('head');
            }
            // Then move legs
            if (legsNeedsToMoveDown !== (motorState.legsPosition === preset.legs)) {
                // Legs need to move
                motorState.head = false;
                motorState.legs = true;
                motorState.direction = legsNeedsToMoveDown ? 'CLOSE' : 'OPEN';
                const command = move(motorState);
                if (command) {
                    await writeCommand(command);
                    // Wait for an appropriate time based on position difference
                    const positionDiff = Math.abs(motorState.legsPosition - preset.legs);
                    const waitTime = (positionDiff / 100) * motorState.feetUpDuration;
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                    // Stop the movement
                    await writeCommand([0x2, 0x73]);
                }
                // Update position
                motorState.legsPosition = preset.legs;
                publishState('legs');
            }
            // Reset state
            motorState.head = false;
            motorState.legs = false;
            motorState.direction = 'STOP';
            (0, logger_1.logInfo)(`[Octo] Moved to preset ${presetName} successfully`);
            return true;
        }
        catch (error) {
            (0, logger_1.logError)(`[Octo] Error moving to preset: ${error}`);
            return false;
        }
    };
    try {
        (0, logger_1.logInfo)('[Octo] Creating head motor entity');
        if (!cache.headMotor) {
            cache.headMotor = new Cover_1.Cover(mqtt, deviceData, (0, buildEntityConfig_1.buildEntityConfig)('MotorHead', { icon: 'mdi:head' }), buildCoverCommand('head'));
            cache.headMotor.setOnline();
            publishState('head');
            (0, logger_1.logInfo)('[Octo] Head motor entity created successfully');
        }
        (0, logger_1.logInfo)('[Octo] Creating legs motor entity');
        if (!cache.legsMotor) {
            cache.legsMotor = new Cover_1.Cover(mqtt, deviceData, (0, buildEntityConfig_1.buildEntityConfig)('MotorLegs', { icon: 'mdi:foot-print' }), buildCoverCommand('legs'));
            cache.legsMotor.setOnline();
            publishState('legs');
            (0, logger_1.logInfo)('[Octo] Legs motor entity created successfully');
        }
        setInterval(() => {
            if (movementStartTime > 0) {
                updatePositionBasedOnElapsed();
                publishState('head');
                publishState('legs');
            }
        }, 1000);
        // Add preset buttons
        (0, logger_1.logInfo)('[Octo] Creating preset buttons');
        // Flat position button
        if (!cache.flatButton) {
            cache.flatButton = new Button_1.Button(mqtt, deviceData, (0, buildEntityConfig_1.buildEntityConfig)('PresetFlat', { icon: 'mdi:bed' }), async () => {
                (0, logger_1.logInfo)('[Octo] Flat position button pressed');
                await moveToPreset('FLAT');
            });
            cache.flatButton.setOnline();
            (0, logger_1.logInfo)('[Octo] Flat position button created');
        }
        // Zero-G position button
        if (!cache.zeroGButton) {
            cache.zeroGButton = new Button_1.Button(mqtt, deviceData, (0, buildEntityConfig_1.buildEntityConfig)('PresetZeroG', { icon: 'mdi:human-handsup' }), async () => {
                (0, logger_1.logInfo)('[Octo] Zero-G position button pressed');
                await moveToPreset('ZERO_G');
            });
            cache.zeroGButton.setOnline();
            (0, logger_1.logInfo)('[Octo] Zero-G position button created');
        }
        // TV position button
        if (!cache.tvButton) {
            cache.tvButton = new Button_1.Button(mqtt, deviceData, (0, buildEntityConfig_1.buildEntityConfig)('PresetTV', { icon: 'mdi:television' }), async () => {
                (0, logger_1.logInfo)('[Octo] TV position button pressed');
                await moveToPreset('TV');
            });
            cache.tvButton.setOnline();
            (0, logger_1.logInfo)('[Octo] TV position button created');
        }
        // Reading position button
        if (!cache.readingButton) {
            cache.readingButton = new Button_1.Button(mqtt, deviceData, (0, buildEntityConfig_1.buildEntityConfig)('PresetMemory', { icon: 'mdi:book-open-variant' }), async () => {
                (0, logger_1.logInfo)('[Octo] Reading position button pressed');
                await moveToPreset('READING');
            });
            cache.readingButton.setOnline();
            (0, logger_1.logInfo)('[Octo] Reading position button created');
        }
        (0, logger_1.logInfo)('[Octo] Motor entities setup complete');
    }
    catch (error) {
        (0, logger_1.logError)(`[Octo] Error setting up motor entities: ${error}`);
    }
};
exports.setupMotorEntities = setupMotorEntities;
//# sourceMappingURL=setupMotorEntities.js.map