const express = require('express');
const router = express.Router();
const roonService = require('../services/roonService');
const imageService = require('../services/imageService');
const config = require('config');

// Image API
router.get('/roonapi/getImage', async (req, res) => {
    const { image_key, albumName } = req.query;

    roonService.getImage(image_key, { scale: "fit", width: 1080, height: 1080, format: "image/jpeg" }, async (error, contentType, body) => {
        if (error || !body) {
            console.error('Error fetching image:', error);
            return res.status(500).json({ error: 'Failed to fetch image' });
        }

        const autoSave = config.has('artwork.autoSave') ? config.get('artwork.autoSave') : true;
        if (autoSave && albumName) {
            // Fire and forget save to avoid blocking response
            imageService.saveArtwork(body, albumName).catch(err => console.error('Auto-save failed:', err));
        }

        res.contentType(contentType);
        res.send(body);
    });
});

router.get('/roonapi/getImage4k', (req, res) => {
    const { image_key } = req.query;
    roonService.getImage(image_key, { scale: "fit", width: 2160, height: 2160, format: "image/jpeg" }, (error, contentType, body) => {
        if (error || !body) {
            return res.status(500).json({ error: 'Failed to fetch image' });
        }
        res.contentType(contentType);
        res.send(body);
    });
});

router.get('/roonapi/artworkStatus', async (req, res) => {
    try {
        const stats = await imageService.getImageStats();
        res.json({
            enabled: config.has('artwork.autoSave') ? config.get('artwork.autoSave') : true,
            saveDir: imageService.saveDir,
            ...stats
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get status' });
    }
});

// Legacy API for full list (kept for compatibility if needed, but we recommend random)
router.get('/api/images', async (req, res) => {
    try {
        const images = await imageService.getImages();
        res.json(images);
    } catch (error) {
        res.status(500).json({ error: 'Failed to get images' });
    }
});

// NEW: Random Images API
router.get('/api/images/random', async (req, res) => {
    const requestedCount = parseInt(req.query.count, 10);
    const count = Math.min(64, Math.max(1, Number.isNaN(requestedCount) ? 16 : requestedCount));
    try {
        const images = await imageService.getRandomImages(count);
        res.json(images);
    } catch (error) {
        console.error('Random images error:', error);
        res.status(500).json({ error: 'Failed to get random images' });
    }
});

router.get('/api/status', (req, res) => {
    if (!roonService.core || !roonService.transport) {
        return res.json({ connected: false, is_playing: false });
    }

    // Check if playing in selected zone
    if (roonService.settings.output) {
        const zone = roonService.getSelectedZone();
        if (zone && zone.state === "playing" && zone.now_playing) {
            return res.json({ connected: true, is_playing: true, ...zone.now_playing });
        }
    }
    res.json({ connected: true, is_playing: false });
});

router.get('/api/pair', (req, res) => {
    res.json({ pairEnabled: roonService.pairStatus });
});

router.get('/api/zones', (req, res) => {
    if (!roonService.core || !roonService.transport) {
        return res.status(500).json({ error: "Not connected to Roon Core" });
    }
    res.json(roonService.getZoneStatus());
});

router.post("/roonapi/goRefreshBrowse", (req, res) => {
    roonService.browse({
        hierarchy: "browse",
        zone_or_output_id: req.body.zone_id,
        ...req.body.options
    }, (err, payload) => {
        if (err) return res.status(500).send(err);
        res.send({ data: payload });
    });
});

router.post("/roonapi/goLoadBrowse", (req, res) => {
    roonService.loadBrowse({
        hierarchy: "browse",
        offset: req.body.listoffset,
        set_display_offset: req.body.listoffset
    }, (err, payload) => {
        if (err) return res.status(500).send(err);
        res.send({ data: payload });
    });
});

module.exports = router;
