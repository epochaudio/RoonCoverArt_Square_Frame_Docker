const roonService = require('./roonService');

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
            roonService.changeVolume(msg.output_id, "absolute", msg.volume);
        });

        socket.on("changeSetting", (msg) => {
            const settings = {};
            if (msg.setting == "shuffle") settings.shuffle = msg.value;
            else if (msg.setting == "auto_radio") settings.auto_radio = msg.value;
            else if (msg.setting == "loop") settings.loop = msg.value;

            roonService.changeSettings(msg.zone_id, settings);
        });

        socket.on("transport", (msg) => {
            if (!msg.zoneID) return;
            // legacy mapping
            const command = msg.command;
            roonService.control(msg.zoneID, command);
        });

        // Legacy individual events (mapped to transport)
        ['playpause', 'play', 'pause', 'stop'].forEach(cmd => {
            socket.on(`go${cmd.charAt(0).toUpperCase() + cmd.slice(1)}`, (msg) => {
                roonService.control(msg.zone_id, cmd);
            });
        });

        socket.on("goPrev", (msg) => roonService.control(msg.zone_id, "previous"));
        socket.on("goNext", (msg) => roonService.control(msg.zone_id, "next"));
    }
}

module.exports = new SocketService();
