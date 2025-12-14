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
        const zones = roonService.getZoneStatus();
        if (roonService.pairStatus && zones && zones.length > 0) {
            // Apply filtering logic if settings.output is set (already done in roonService.getZoneStatus relative to internal state, 
            // but roonService.emitZones handles filtering. 
            // roonService.getZoneStatus returns raw zones.
            // Actually roonService.emitZones logic should be reused or we just emit the cached filtered result??
            // Let's just ask roonService to emit the current state for this socket or generally.
            // Simpler: roonService stores zoneStatus. roonService.emitZones() sends to all.
            // But for a specific new connection, we want to send JUST to them potentially, or just re-emit to all is fine (low traffic).

            // Better: socket.emit with filtered zones.
            // Use roonService logic

            // Ideally roonService should have a getVisibleZones() method.
            // For now, let's just use what roonService exposes or listen to events.
            // roonService.emitZones() broadcasts.

            // Let's implement a 'getFilteredZones' in roonService? 
            // Or just:
            if (roonService.settings && roonService.settings.output) {
                const selectedZone = zones.find(z =>
                    z.outputs.some(o => o.output_id === roonService.settings.output.output_id)
                );
                if (selectedZone) {
                    socket.emit("zoneStatus", [selectedZone]);
                } else {
                    // Selected zone not found, maybe offline
                    socket.emit("zoneStatus", []);
                }
            } else {
                socket.emit("zoneStatus", zones);
            }
        } else {
            socket.emit("zoneStatus", []);
        }

        socket.on("getZone", () => {
            const zones = roonService.getZoneStatus();
            if (roonService.pairStatus && zones && zones.length > 0) {
                // Same filtering logic
                if (roonService.settings && roonService.settings.output) {
                    const selectedZone = zones.find(z =>
                        z.outputs.some(o => o.output_id === roonService.settings.output.output_id)
                    );
                    socket.emit("zoneStatus", selectedZone ? [selectedZone] : []);
                } else {
                    socket.emit("zoneStatus", zones);
                }
            } else {
                socket.emit("zoneStatus", []);
            }
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
