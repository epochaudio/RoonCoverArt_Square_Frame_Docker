const roonService = require('./roonService');

const TRANSPORT_COMMANDS = new Set(['playpause', 'play', 'pause', 'stop', 'previous', 'next']);
const SETTINGS = new Set(['shuffle', 'auto_radio', 'loop']);

function isObject(value) {
    return value !== null && typeof value === 'object';
}

class SocketService {
    init(io) {
        this.io = io;

        io.on("connection", (socket) => this.handleConnection(socket));

        // Listen to RoonService events and broadcast
        roonService.on('pairStatus', (data) => io.emit('pairStatus', data));
        roonService.on('zoneStatus', (data) => io.emit('zoneStatus', data));
        roonService.on('nowplaying', (data) => io.emit('nowplaying', data));
        roonService.on('notPlaying', (data) => io.emit('notPlaying', data));
    }

    handleConnection(socket) {
        // Send initial state
        socket.emit("pairStatus", { pairEnabled: roonService.pairStatus });
        socket.emit("zoneStatus", roonService.getVisibleZones());

        socket.on("getZone", () => {
            socket.emit("zoneStatus", roonService.getVisibleZones());
        });

        socket.on("changeVolume", (msg) => {
            if (!isObject(msg) || !msg.output_id || !Number.isFinite(msg.volume)) {
                console.warn('Invalid changeVolume message:', msg);
                return;
            }
            roonService.changeVolume(msg.output_id, "absolute", msg.volume);
        });

        socket.on("changeSetting", (msg) => {
            if (!isObject(msg) || !msg.zone_id || !SETTINGS.has(msg.setting)) {
                console.warn('Invalid changeSetting message:', msg);
                return;
            }

            const settings = {};
            if (msg.setting == "shuffle") settings.shuffle = msg.value;
            else if (msg.setting == "auto_radio") settings.auto_radio = msg.value;
            else if (msg.setting == "loop") settings.loop = msg.value;

            roonService.changeSettings(msg.zone_id, settings);
        });

        socket.on("transport", (msg) => {
            if (!isObject(msg) || !msg.zoneID || !TRANSPORT_COMMANDS.has(msg.command)) {
                console.warn('Invalid transport message:', msg);
                return;
            }
            roonService.control(msg.zoneID, msg.command);
        });

        // Legacy individual events (mapped to transport)
        const legacyCommands = {
            goPlayPause: 'playpause',
            goPlay: 'play',
            goPause: 'pause',
            goStop: 'stop',
            goPrev: 'previous',
            goNext: 'next'
        };

        Object.entries(legacyCommands).forEach(([eventName, command]) => {
            socket.on(eventName, (msg) => {
                if (!isObject(msg) || !msg.zone_id) {
                    console.warn(`Invalid ${eventName} message:`, msg);
                    return;
                }
                roonService.control(msg.zone_id, command);
            });
        });
    }
}

module.exports = new SocketService();
