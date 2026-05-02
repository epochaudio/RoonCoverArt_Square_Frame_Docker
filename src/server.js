"use strict";

const express = require('express');
const http = require('http');
const bodyParser = require('body-parser');
const path = require('path');
const config = require('config');
const socketIO = require('socket.io');

const apiRoutes = require('./routes/api');
const roonService = require('./services/roonService');
const socketService = require('./services/socketService');

// Setup process
process.chdir(path.join(__dirname, '..')); // Move to root if running from src
console.log(`Working directory: ${process.cwd()}`);

// Config
const defaultListenPort = 3666;
const configPort = config.has("server.port") ? config.get("server.port") : defaultListenPort;
const listenPort = process.env.PORT || configPort;
const configuredOrigins = process.env.ALLOWED_ORIGINS
    || (config.has("server.allowedOrigins") ? config.get("server.allowedOrigins") : []);
const allowedOrigins = new Set(
    (Array.isArray(configuredOrigins) ? configuredOrigins : String(configuredOrigins).split(','))
        .map(origin => origin.trim())
        .filter(Boolean)
);

function isOriginAllowed(origin) {
    return !origin || allowedOrigins.has(origin);
}

// Express setup
const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: {
        origin: (origin, callback) => callback(null, isOriginAllowed(origin)),
        methods: ["GET", "POST"]
    },
    allowRequest: (req, callback) => callback(null, isOriginAllowed(req.headers.origin))
});

// Middleware
app.use(bodyParser.json());
app.use(express.static('public', {
    setHeaders: (res, path) => {
        if (path.endsWith('.js')) {
            res.set('Content-Type', 'application/javascript');
        }
    }
}));
app.use('/images', express.static('images'));

// Legacy Node Modules mappings
app.use("/jquery", express.static(path.join(__dirname, "../node_modules/jquery/dist")));
app.use("/js-cookie", express.static(path.join(__dirname, "../node_modules/js-cookie/src")));

// CORS
app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && isOriginAllowed(origin)) {
        res.header("Access-Control-Allow-Origin", origin);
        res.header("Vary", "Origin");
    }
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    if (req.method === "OPTIONS") {
        return res.sendStatus(isOriginAllowed(origin) ? 204 : 403);
    }
    next();
});

// Routes
app.use('/', apiRoutes);
app.get("/", (req, res) => res.sendFile(path.resolve(__dirname, "../public/index.html")));

// Init Services
socketService.init(io);
roonService.start();

// Start Server
server.listen(listenPort, () => {
    console.log(`Roon Cover Art Server listening on port ${listenPort}`);
});

// Error handling
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
