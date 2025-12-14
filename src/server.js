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

// Express setup
const app = express();
const server = http.createServer(app);
const io = socketIO(server);

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
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

// Routes
app.use('/', apiRoutes);
app.get("/", (req, res) => res.sendFile(path.resolve(__dirname, "../public/fullscreen.html")));

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
