"use strict";

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const roonService = require('./roonService');

const EV_KEY = 0x01;
const KEY_PRESSED = 1;

const EVENT_SIZE = ['ia32', 'arm'].includes(process.arch) ? 16 : 24;
const EVENT_TYPE_OFFSET = EVENT_SIZE - 8;
const EVENT_CODE_OFFSET = EVENT_SIZE - 6;
const EVENT_VALUE_OFFSET = EVENT_SIZE - 4;

const DEFAULT_DEBOUNCE_MS = 180;
const CONTROL_WARNING_INTERVAL_MS = 10000;

const KEY_CODES = {
    KEY_SPACE: 57,
    KEY_UP: 103,
    KEY_LEFT: 105,
    KEY_RIGHT: 106,
    KEY_DOWN: 108,
    KEY_PAUSE: 119,
    KEY_STOP: 128,
    KEY_NEXTSONG: 163,
    KEY_PLAYPAUSE: 164,
    KEY_PREVIOUSSONG: 165,
    KEY_STOPCD: 166,
    KEY_PLAY: 207
};

const KEY_NAMES = Object.entries(KEY_CODES).reduce((names, [name, code]) => {
    names[code] = name;
    return names;
}, {});

const KEY_COMMANDS = new Map([
    [KEY_CODES.KEY_RIGHT, 'next'],
    [KEY_CODES.KEY_NEXTSONG, 'next'],
    [KEY_CODES.KEY_LEFT, 'previous'],
    [KEY_CODES.KEY_PREVIOUSSONG, 'previous'],
    [KEY_CODES.KEY_SPACE, 'playpause'],
    [KEY_CODES.KEY_PLAYPAUSE, 'playpause'],
    [KEY_CODES.KEY_UP, 'play'],
    [KEY_CODES.KEY_PLAY, 'play'],
    [KEY_CODES.KEY_DOWN, 'stop'],
    [KEY_CODES.KEY_STOP, 'stop'],
    [KEY_CODES.KEY_STOPCD, 'stop'],
    [KEY_CODES.KEY_PAUSE, 'pause']
]);

function isEnabled(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return true;
    return !['0', 'false', 'no', 'off'].includes(normalized);
}

function parseDebounceMs(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_DEBOUNCE_MS;
}

function splitDeviceList(value) {
    return String(value || '')
        .split(',')
        .map(devicePath => devicePath.trim())
        .filter(Boolean);
}

function getDeviceRealPath(devicePath) {
    const resolvedPath = path.resolve(devicePath);
    try {
        return fs.realpathSync.native(resolvedPath);
    } catch (err) {
        return resolvedPath;
    }
}

class KeyboardService {
    constructor() {
        this.started = false;
        this.debounceMs = DEFAULT_DEBOUNCE_MS;
        this.deviceBuffers = new Map();
        this.deviceReaders = new Map();
        this.lastKeyEventAt = new Map();
        this.lastControlWarningAt = new Map();
    }

    start() {
        if (this.started || !isEnabled(process.env.KEYBOARD_ENABLED)) {
            return;
        }

        this.started = true;
        this.debounceMs = parseDebounceMs(process.env.KEYBOARD_DEBOUNCE_MS);

        const devices = this.resolveDevices();
        if (devices.length === 0) {
            console.warn('Host keyboard control is enabled, but no keyboard input devices were found.');
            return;
        }

        devices.forEach(device => this.openDevice(device));
    }

    stop() {
        this.deviceReaders.forEach(reader => reader.kill());
        this.deviceReaders.clear();
        this.deviceBuffers.clear();
        this.started = false;
    }

    resolveDevices() {
        const explicitDevices = [
            ...splitDeviceList(process.env.KEYBOARD_DEVICE),
            ...splitDeviceList(process.env.KEYBOARD_DEVICES)
        ];

        const candidates = explicitDevices.length > 0
            ? explicitDevices
            : this.discoverKeyboardDevices();

        return this.uniqueDevices(candidates);
    }

    discoverKeyboardDevices() {
        return [
            ...this.discoverKeyboardSymlinks('/dev/input/by-id'),
            ...this.discoverKeyboardSymlinks('/dev/input/by-path'),
            ...this.discoverProcBusKeyboardDevices()
        ];
    }

    discoverKeyboardSymlinks(directory) {
        try {
            return fs.readdirSync(directory)
                .filter(name => name.endsWith('-event-kbd'))
                .map(name => path.join(directory, name));
        } catch (err) {
            return [];
        }
    }

    discoverProcBusKeyboardDevices() {
        let content;
        try {
            content = fs.readFileSync('/proc/bus/input/devices', 'utf8');
        } catch (err) {
            return [];
        }

        return content
            .split(/\n\s*\n/)
            .flatMap(block => {
                const handlerLine = block.split('\n').find(line => line.startsWith('H: Handlers='));
                if (!handlerLine || !/\bkbd\b/.test(handlerLine)) return [];

                const eventMatches = handlerLine.match(/\bevent\d+\b/g) || [];
                return eventMatches.map(eventName => `/dev/input/${eventName}`);
            });
    }

    uniqueDevices(devicePaths) {
        const seen = new Set();
        const devices = [];

        devicePaths.forEach(devicePath => {
            const realPath = getDeviceRealPath(devicePath);
            if (seen.has(realPath)) return;

            seen.add(realPath);
            devices.push({ path: devicePath, realPath });
        });

        return devices;
    }

    openDevice(device) {
        const reader = spawn('cat', [device.path], {
            stdio: ['ignore', 'pipe', 'pipe']
        });

        this.deviceReaders.set(device.realPath, reader);
        this.deviceBuffers.set(device.realPath, Buffer.alloc(0));

        console.log(`Host keyboard control listening on ${device.path}`);

        reader.stdout.on('data', chunk => {
            this.handleDeviceData(device, chunk);
        });

        reader.stderr.on('data', chunk => {
            const message = chunk.toString().trim();
            if (message) console.warn(`Keyboard input device ${device.path}: ${message}`);
        });

        reader.on('error', err => {
            console.warn(`Failed to read keyboard input device ${device.path}: ${err.message}`);
        });

        reader.on('exit', (code, signal) => {
            this.deviceReaders.delete(device.realPath);
            this.deviceBuffers.delete(device.realPath);
            if (code !== 0 && signal !== 'SIGTERM') {
                console.warn(`Keyboard input reader for ${device.path} exited with code ${code || signal}`);
            }
        });
    }

    handleDeviceData(device, chunk) {
        let buffer = Buffer.concat([
            this.deviceBuffers.get(device.realPath) || Buffer.alloc(0),
            chunk
        ]);

        while (buffer.length >= EVENT_SIZE) {
            const eventBuffer = buffer.subarray(0, EVENT_SIZE);
            this.handleInputEvent(device, eventBuffer);
            buffer = buffer.subarray(EVENT_SIZE);
        }

        this.deviceBuffers.set(device.realPath, buffer);
    }

    handleInputEvent(device, eventBuffer) {
        const type = eventBuffer.readUInt16LE(EVENT_TYPE_OFFSET);
        if (type !== EV_KEY) return;

        const code = eventBuffer.readUInt16LE(EVENT_CODE_OFFSET);
        const value = eventBuffer.readInt32LE(EVENT_VALUE_OFFSET);
        if (value !== KEY_PRESSED) return;

        const command = KEY_COMMANDS.get(code);
        if (!command) return;

        if (this.isDebounced(code)) return;

        this.dispatchCommand(command, code, device.path);
    }

    isDebounced(code) {
        const now = Date.now();
        const lastEventAt = this.lastKeyEventAt.get(code) || 0;
        if (now - lastEventAt < this.debounceMs) {
            return true;
        }

        this.lastKeyEventAt.set(code, now);
        return false;
    }

    dispatchCommand(command, code, devicePath) {
        const zone = this.getControlZone();
        if (!zone) {
            this.warnControlUnavailable('No Roon zone is available for host keyboard control.');
            return;
        }

        const controlled = roonService.control(zone.zone_id, command);
        if (!controlled) {
            this.warnControlUnavailable('Roon transport is not ready for host keyboard control.');
            return;
        }

        const keyName = KEY_NAMES[code] || `KEY_${code}`;
        console.log(`Host keyboard ${keyName} from ${devicePath} -> ${command} (${zone.display_name || zone.zone_id})`);
    }

    getControlZone() {
        const selectedZone = roonService.getSelectedZone();
        if (selectedZone) return selectedZone;

        const visibleZones = roonService.getVisibleZones();
        return visibleZones.length > 0 ? visibleZones[0] : null;
    }

    warnControlUnavailable(message) {
        const now = Date.now();
        const lastWarnedAt = this.lastControlWarningAt.get(message) || 0;
        if (now - lastWarnedAt < CONTROL_WARNING_INTERVAL_MS) return;

        this.lastControlWarningAt.set(message, now);
        console.warn(message);
    }
}

module.exports = new KeyboardService();
