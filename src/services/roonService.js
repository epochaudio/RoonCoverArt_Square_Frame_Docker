const RoonApi = require("node-roon-api");
const RoonApiImage = require("node-roon-api-image");
const RoonApiStatus = require("node-roon-api-status");
const RoonApiTransport = require("node-roon-api-transport");
const RoonApiBrowse = require("node-roon-api-browse");
const RoonApiSettings = require("node-roon-api-settings");
const EventEmitter = require('events');

class RoonService extends EventEmitter {
    constructor() {
        super();
        this.core = null;
        this.transport = null;
        this.pairStatus = false;
        this.zoneStatus = [];
        this.settings = { output: undefined };

        this.initServices();
    }

    initServices() {
        this.roon = new RoonApi({
            extension_id: "com.epochaudio.coverart",
            display_name: "Cover Art",
            display_version: "3.1.4",
            publisher: "门耳朵制作",
            email: "masked",
            website: "https://shop236654229.taobao.com/",

            core_paired: (core) => this.handleCorePaired(core),
            core_unpaired: (core) => this.handleCoreUnpaired(core)
        });

        this.svc_status = new RoonApiStatus(this.roon);
        this.svc_settings = new RoonApiSettings(this.roon, {
            get_settings: (cb) => cb(this.makeLayout(this.settings)),
            save_settings: (req, isdryrun, new_settings) => {
                let l = this.makeLayout(new_settings.values);
                req.send_complete(l.has_error ? "NotValid" : "Success", { settings: l });
                if (!l.has_error && !isdryrun) {
                    this.settings = l.values;
                    this.roon.save_config("settings", this.settings);
                    this.updateSelectedZone();
                }
            }
        });

        this.roon.init_services({
            required_services: [RoonApiTransport, RoonApiImage, RoonApiBrowse],
            provided_services: [this.svc_settings, this.svc_status]
        });

        this.svc_status.set_status("Extension enabled", false);
        this.settings = this.roon.load_config("settings") || { output: undefined };
    }

    start() {
        this.roon.start_discovery();
    }

    makeLayout(settings) {
        let l = {
            values: settings,
            layout: [],
            has_error: false
        };
        l.layout.push({
            type: "zone",
            title: "Select Zone",
            setting: "output",
        });
        return l;
    }

    handleCorePaired(core) {
        console.log('Roon Core Paired');
        this.core = core;
        this.transport = core.services.RoonApiTransport;
        this.pairStatus = true;

        if (!this.transport) {
            console.error('Transport service unavailable');
            this.svc_status.set_status("Transport unavailable", true);
            return;
        }

        this.transport.subscribe_zones((cmd, data) => this.handleZoneEvent(cmd, data));

        this.emit('pairStatus', { pairEnabled: true });
        this.svc_status.set_status("Connected to Roon Core", false);
    }

    handleCoreUnpaired(core) {
        console.log('Roon Core Unpaired');
        this.core = null;
        this.transport = null;
        this.pairStatus = false;
        this.zoneStatus = [];

        this.emit('pairStatus', { pairEnabled: false });
        this.svc_status.set_status("Waiting for pairing", true);
    }

    handleZoneEvent(cmd, data) {
        try {
            if (cmd === "Subscribed") {
                this.zoneStatus = data.zones || [];
                this.emitZones();
            } else if (cmd === "Changed") {
                if (data.zones_removed) {
                    data.zones_removed.forEach(zone => {
                        this.zoneStatus = this.zoneStatus.filter(z => z.zone_id !== zone.zone_id);
                    });
                }
                if (data.zones_added) {
                    this.zoneStatus = [...this.zoneStatus, ...data.zones_added];
                }
                if (data.zones_changed) {
                    data.zones_changed.forEach(changed => {
                        const idx = this.zoneStatus.findIndex(z => z.zone_id === changed.zone_id);
                        if (idx !== -1) {
                            this.zoneStatus[idx] = changed;
                            this.checkZoneUpdate(changed);
                        }
                    });
                }
                this.emitZones();
            }
        } catch (err) {
            console.error('Error handling zone event:', err);
        }
    }

    checkZoneUpdate(zone) {
        if (!this.settings.output) return;

        if (!this.isSelectedZone(zone)) return;

        if (zone.state === "playing" && zone.now_playing) {
            this.emit("nowplaying", {
                ...zone.now_playing,
                state: "playing"
            });
        } else if (zone.state !== "playing") {
            this.emit("notPlaying", { state: zone.state });
        }
    }

    emitZones() {
        this.emit("zoneStatus", this.getVisibleZones());
    }

    updateSelectedZone() {
        if (this.pairStatus) {
            this.emitZones();
        }
    }

    isSelectedZone(zone) {
        if (!this.settings.output || !zone || !zone.outputs) return false;
        return zone.outputs.some(o => o.output_id === this.settings.output.output_id);
    }

    getSelectedZone() {
        if (!this.core || !this.transport || !this.settings.output) return null;
        return this.zoneStatus.find(z => this.isSelectedZone(z)) || null;
    }

    getVisibleZones() {
        if (!this.core || !this.transport) return [];
        const selectedZone = this.getSelectedZone();
        return selectedZone ? [selectedZone] : this.zoneStatus;
    }

    // Public API Methods

    getImage(image_key, options, callback) {
        if (!this.core || !this.core.services.RoonApiImage) {
            return callback("Core not paired", null, null);
        }
        this.core.services.RoonApiImage.get_image(image_key, options, callback);
    }

    control(zoneId, command) {
        if (!this.transport) return;
        const msg = { zone_id: zoneId };
        this.transport.control(msg, command);
    }

    changeVolume(outputId, mode, value) {
        if (!this.transport) return;
        this.transport.change_volume(outputId, mode, value);
    }

    changeSettings(zoneId, settings) {
        if (!this.transport) return;
        this.transport.change_settings(zoneId, settings, (err) => { });
    }

    browse(options, callback) {
        if (!this.core || !this.core.services.RoonApiBrowse) {
            return callback("Core not paired");
        }
        this.core.services.RoonApiBrowse.browse(options, (err, payload) => {
            if (err) return callback(err);
            if (payload.action === 'list') {
                // Auto load if list
                const offset = payload.list.display_offset || 0;
                this.core.services.RoonApiBrowse.load({
                    hierarchy: "browse",
                    offset: offset,
                    set_display_offset: offset
                }, (err, payload) => callback(err, payload));
            } else {
                callback(null, payload);
            }
        });
    }

    loadBrowse(options, callback) {
        if (!this.core || !this.core.services.RoonApiBrowse) {
            return callback("Core not paired");
        }
        this.core.services.RoonApiBrowse.load(options, (err, payload) => callback(err, payload));
    }

    getZoneStatus() {
        if (!this.core || !this.transport) return null;
        return this.zoneStatus;
    }
}

module.exports = new RoonService();
