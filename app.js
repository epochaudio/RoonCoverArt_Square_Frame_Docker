"use strict";
// Setup general variables
var defaultListenPort = 3666;

var core = null;
var transport = null;
var pairStatus = false;
var zoneStatus = [];
var zoneList = [];

// Change to working directory
try {
  process.chdir(__dirname);
  console.log(`Working directory: ${process.cwd()}`);
} catch (err) {
  console.error(`chdir: ${err}`);
}

// Read command line options
var commandLineArgs = require("command-line-args");
var getUsage = require("command-line-usage");

var optionDefinitions = [
  {
    name: "help",
    alias: "h",
    description: "Display this usage guide.",
    type: Boolean
  },
  {
    name: "port",
    alias: "p",
    description: "Specify the port the server listens on.",
    type: Number
  }
];

var options = commandLineArgs(optionDefinitions, { partial: true });

var usage = getUsage([
  {
    header: "Roon Cover Art",
    content:
      "Roon封面艺术.\n\nUsage: {bold node app.js <options>}"
  },
  {
    header: "Options",
    optionList: optionDefinitions
  },
  {
    content:
      "Project home: {underline https://shop236654229.taobao.com/}"
  }
]);

if (options.help) {
  console.log(usage);
  process.exit();
}

// Read config file
var config = require("config");

var configPort = config.get("server.port");

// Determine listen port
if (options.port) {
  var listenPort = options.port;
} else if (configPort) {
  var listenPort = configPort;
} else {
  var listenPort = defaultListenPort;
}
// Setup Express
var express = require("express");
var http = require("http");
var bodyParser = require("body-parser");
const fs = require("fs").promises;
const { saveArtwork, getImageStats } = require("./utils/imageUtils");

var app = express();
app.use(express.static("public", {
    setHeaders: function(res, path) {
        if (path.endsWith('.js')) {
            res.set('Content-Type', 'application/javascript');
        }
    }
}));
app.use(bodyParser.json());

// 添加 images 目录的静态文件服务
app.use('/images', express.static('images'));

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  next();
});

// Setup Socket IO
var server = http.createServer(app);
var io = require("socket.io").listen(server);

server.listen(listenPort, function() {
  console.log("Listening on port " + listenPort);
});

// Setup Roon
var RoonApi = require("node-roon-api");
var RoonApiImage = require("node-roon-api-image");
var RoonApiStatus = require("node-roon-api-status");
var RoonApiTransport = require("node-roon-api-transport");
var RoonApiBrowse = require("node-roon-api-browse");
var RoonApiSettings = require("node-roon-api-settings");

// 定义设置变量
var settings = {
    output: undefined
};

// 创建设置布局
function makelayout(settings) {
    var l = {
        values:    settings,
        layout:    [],
        has_error: false
    };

    l.layout.push({
        type:    "zone",
        title:   "选择播放区域",
        setting: "output",
    });

    return l;
}

// 创建 Roon API 实例
var roon = new RoonApi({
    extension_id:        "com.epochaudio.coverart",
    display_name:        "Cover Art",
    display_version:     "3.1.4",
    publisher:           "门耳朵制作",
    email:              "masked",
    website:            "https://shop236654229.taobao.com/",

    core_paired: function(_core) {
        console.log('Roon Core 配对成功');
        core = _core;
        pairStatus = true;
        
        // 更新连接管理器状态
        if (connectionManager) {
            connectionManager.setCore(_core);
        }

        // 初始化 transport 服务
        transport = _core.services.RoonApiTransport;
        if (!transport) {
            console.error('Transport service 不可用');
            svc_status.set_status("Transport服务不可用", true);
            return;
        }

        // 使用订阅管理器订阅zones变化
        if (subscriptionManager) {
            try {
                subscriptionManager.subscribe(transport, 'zones', (cmd, data) => {
            console.log('收到zones订阅响应:', cmd, data);
            
            try {
                if (cmd == "Subscribed") {
                    // 初始化 zones
                    zoneStatus = data.zones || [];
                    
                    // 如果有保存的区域设置，只显示选中的区域
                    if (settings.output) {
                        const selectedZone = zoneStatus.find(z => 
                            z.outputs.some(o => o.output_id === settings.output.output_id)
                        );
                        if (selectedZone) {
                            io.emit("zoneStatus", [selectedZone]);
                            return;
                        }
                    }
                    
                    // 发送所有可用的zones，让用户手动选择
                    io.emit("zoneStatus", zoneStatus);
                } else if (cmd == "Changed") {
                    // 处理 zones 变化
                    if (data.zones_removed) {
                        data.zones_removed.forEach(zone => {
                            zoneStatus = zoneStatus.filter(z => z.zone_id !== zone.zone_id);
                        });
                    }
                    if (data.zones_added) {
                        zoneStatus = [...zoneStatus, ...data.zones_added];
                    }
                    if (data.zones_changed) {
                        data.zones_changed.forEach(changed => {
                            const idx = zoneStatus.findIndex(z => z.zone_id === changed.zone_id);
                            if (idx !== -1) {
                                zoneStatus[idx] = changed;
                                
                                // 如果是选中的区域，发送状态更新
                                if (settings.output && 
                                    changed.outputs.some(o => o.output_id === settings.output.output_id)) {
                                    // 发送播放状态更新
                                    if (changed.state === "playing" && changed.now_playing) {
                                        console.log('播放信息:', {
                                            image_key: changed.now_playing.image_key,
                                            three_line: changed.now_playing.three_line,
                                            state: changed.state,
                                            raw: changed.now_playing
                                        });
                                        io.emit("nowplaying", {
                                            ...changed.now_playing,  // 传递完整的 now_playing 信息
                                            state: "playing"
                                        });
                                    } else if (changed.state !== "playing") {
                                        console.log('非播放状态:', changed.state);
                                        io.emit("notPlaying", { state: changed.state });
                                    }
                                    io.emit("zoneStatus", [changed]);
                                }
                            }
                        });
                    }
                    
                    // 如果没有选中的区域，发送所有区域状态
                    if (!settings.output) {
                        io.emit("zoneStatus", zoneStatus);
                    }
                }
            } catch (err) {
                console.error('处理zones更新时出错:', err);
            }
        });
            } catch (err) {
                console.error('订阅zones失败:', err);
            }
        }

        // 通知客户端
        io.emit("pairStatus", { pairEnabled: true });
        svc_status.set_status("已连接到Roon Core", false);
    },

    core_unpaired: function(_core) {
        console.log('Roon Core 配对断开');
        
        // 清理可能无效的token
        if (_core && _core.core_id) {
            try {
                const roonstate = roon.load_config("roonstate") || {};
                if (roonstate.tokens && roonstate.tokens[_core.core_id]) {
                    console.log('检测到配对断开，清理可能无效的token:', _core.core_id);
                    delete roonstate.tokens[_core.core_id];
                    
                    // 如果这是当前配对的core，也清理paired_core_id
                    if (roonstate.paired_core_id === _core.core_id) {
                        delete roonstate.paired_core_id;
                        console.log('清理当前配对的core_id');
                    }
                    
                    roon.save_config("roonstate", roonstate);
                    console.log('无效token已清理');
                }
            } catch (error) {
                console.error('清理token时出错:', error);
            }
        }
        
        // 重置状态
        core = null;
        transport = null;
        pairStatus = false;
        zoneStatus = [];
        zoneList = [];
        
        // 通知客户端
        io.emit("pairStatus", { pairEnabled: false });
        svc_status.set_status("等待配对", true);
        
        // 触发连接管理器重连（如果有的话）
        if (connectionManager) {
            console.log('配对断开，启动自动重连机制');
            setTimeout(() => {
                connectionManager.startReconnect();
            }, 2000); // 延迟2秒再开始重连
        }
    }
});

// 创建状态服务
var svc_status = new RoonApiStatus(roon);

// 创建设置服务
var svc_settings = new RoonApiSettings(roon, {
    get_settings: function(cb) {
        cb(makelayout(settings));
    },
    save_settings: function(req, isdryrun, new_settings) {
        let l = makelayout(new_settings.values);
        req.send_complete(l.has_error ? "NotValid" : "Success", { settings: l });

        if (!l.has_error && !isdryrun) {
            settings = l.values;
            roon.save_config("settings", settings);
            
            // 如果已配对，更新区域状态
            if (pairStatus && settings.output) {
                console.log('更新选中的区域:', settings.output);
                const selectedZone = zoneStatus.find(z => 
                    z.outputs.some(o => o.output_id === settings.output.output_id)
                );
                
                if (selectedZone) {
                    console.log('找到匹配的区域:', selectedZone.zone_id);
                    io.emit("zoneStatus", [selectedZone]);
                }
            }
        }
    }
});

// 初始化服务
roon.init_services({
    required_services: [RoonApiTransport, RoonApiImage, RoonApiBrowse],
    provided_services: [svc_settings, svc_status]
});

// 设置初始状态
svc_status.set_status("扩展已启用", false);

// 加载保存的设置
settings = roon.load_config("settings") || {
    output: undefined
};

// 开始发现 Roon Core
roon.start_discovery();

function refresh_browse(zone_id, options, callback) {
  options = Object.assign(
    {
      hierarchy: "browse",
      zone_or_output_id: zone_id
    },
    options
  );

  core.services.RoonApiBrowse.browse(options, function(error, payload) {
    if (error) {
      console.log(error, payload);
      return;
    }

    if (payload.action == "list") {
      var items = [];
      if (payload.list.display_offset > 0) {
        var listoffset = payload.list.display_offset;
      } else {
        var listoffset = 0;
      }
      core.services.RoonApiBrowse.load(
        {
          hierarchy: "browse",
          offset: listoffset,
          set_display_offset: listoffset
        },
        function(error, payload) {
          callback(payload);
        }
      );
    }
  });
}

function load_browse(listoffset, callback) {
  core.services.RoonApiBrowse.load(
    {
      hierarchy: "browse",
      offset: listoffset,
      set_display_offset: listoffset
    },
    function(error, payload) {
      callback(payload);
    }
  );
}

// ---------------------------- WEB SOCKET --------------
io.on("connection", function(socket) {
  // 发送当前配对状态
  socket.emit("pairStatus", { pairEnabled: pairStatus });
  
  // 如果已配对且有区域信息，发送区域状态
  if (pairStatus && zoneStatus.length > 0) {
    socket.emit("zoneStatus", zoneStatus);
  }

  socket.on("getZone", function() {
    if (pairStatus && zoneStatus.length > 0) {
      socket.emit("zoneStatus", zoneStatus);
    } else {
      console.log('Zones未就绪或为空');
      socket.emit("zoneStatus", []);
    }
  });

  socket.on("changeVolume", function(msg) {
    transport.change_volume(msg.output_id, "absolute", msg.volume);
  });

  socket.on("changeSetting", function(msg) {
    var settings = [];

    if (msg.setting == "shuffle") {
      settings.shuffle = msg.value;
    } else if (msg.setting == "auto_radio") {
      settings.auto_radio = msg.value;
    } else if (msg.setting == "loop") {
      settings.loop = msg.value;
    }

    transport.change_settings(msg.zone_id, settings, function(error) {});
  });

  socket.on("goPrev", function(msg) {
    transport.control(msg, "previous");
  });

  socket.on("goNext", function(msg) {
    transport.control(msg, "next");
  });

  socket.on("goPlayPause", function(msg) {
    transport.control(msg, "playpause");
  });

  socket.on("goPlay", function(msg) {
    transport.control(msg, "play");
  });

  socket.on("goPause", function(msg) {
    transport.control(msg, "pause");
  });

  socket.on("goStop", function(msg) {
    transport.control(msg, "stop");
  });

  // 键盘快捷键传输控制处理器
  socket.on("transport", function(msg) {
    console.log('收到传输控制命令:', msg);
    
    if (!msg.zoneID) {
      console.warn('未提供zoneID，无法执行传输控制');
      return;
    }
    
    // 构造传输控制消息
    const transportMsg = {
      zone_id: msg.zoneID
    };
    
    switch (msg.command) {
      case 'playpause':
        transport.control(transportMsg, "playpause");
        break;
      case 'play':
        transport.control(transportMsg, "play");
        break;
      case 'pause':
        transport.control(transportMsg, "pause");
        break;
      case 'stop':
        transport.control(transportMsg, "stop");
        break;
      case 'previous':
        transport.control(transportMsg, "previous");
        break;
      case 'next':
        transport.control(transportMsg, "next");
        break;
      default:
        console.warn('未知的传输控制命令:', msg.command);
    }
  });
});

// Web Routes
app.get("/", function(req, res) {
  res.sendFile(__dirname + "/public/index.html");
});

app.get("/roonapi/getImage", function(req, res) {
  console.log('收到图片请求:', {
    image_key: req.query.image_key,
    albumName: req.query.albumName
  });

  if (!core || !core.services || !core.services.RoonApiImage) {
    console.log('Roon Core未就绪或未配对');
    res.status(500).json({ error: 'Roon Core未就绪或未配对' });
    return;
  }

  core.services.RoonApiImage.get_image(
    req.query.image_key,
    { scale: "fit", width: 1080, height: 1080, format: "image/jpeg" },
    async function(cb, contentType, body) {
      console.log('获取图片结果:', {
        success: !!body,
        contentType,
        size: body ? body.length : 0
      });

      if (!body) {
        console.log('获取图片失败');
        res.status(500).json({ error: '获取图片失败' });
        return;
      }

      // 检查是否启用了自动保存功能
      const autoSave = config.has('artwork.autoSave') ? config.get('artwork.autoSave') : true;
      console.log('自动保存状态:', {
        autoSave,
        hasAlbumName: !!req.query.albumName,
        image_key: req.query.image_key
      });
      
      if (autoSave && req.query.albumName) {
        try {
          console.log('开始保存专辑封面:', req.query.albumName);
          await saveArtwork(body, req.query.albumName);
        } catch (error) {
          console.error('保存专辑封面时出错:', error);
        }
      }
      
      res.contentType = contentType;
      res.writeHead(200, { "Content-Type": "image/jpeg" });
      res.end(body, "binary");
    }
  );
});

app.get("/roonapi/getImage4k", function(req, res) {
  if (!core || !core.services || !core.services.RoonApiImage) {
    console.log('Roon Core未就绪或未配对');
    res.status(500).json({ error: 'Roon Core未就绪或未配对' });
    return;
  }
  
  core.services.RoonApiImage.get_image(
    req.query.image_key,
    { scale: "fit", width: 2160, height: 2160, format: "image/jpeg" },
    function(cb, contentType, body) {
      if (!body) {
        console.log('获取图片失败');
        res.status(500).json({ error: '获取图片失败' });
        return;
      }
      
      res.contentType = contentType;
      res.writeHead(200, { "Content-Type": "image/jpeg" });
      res.end(body, "binary");
    }
  );
});

app.post("/roonapi/goRefreshBrowse", function(req, res) {
  refresh_browse(req.body.zone_id, req.body.options, function(payload) {
    res.send({ data: payload });
  });
});

app.post("/roonapi/goLoadBrowse", function(req, res) {
  load_browse(req.body.listoffset, function(payload) {
    res.send({ data: payload });
  });
});

app.use(
  "/jquery/jquery.min.js",
  express.static(__dirname + "/node_modules/jquery/dist/jquery.min.js")
);

app.use(
  "/js-cookie/js.cookie.js",
  express.static(__dirname + "/node_modules/js-cookie/src/js.cookie.js")
);

// 添加状态查看路由
app.get("/roonapi/artworkStatus", async function(req, res) {
  try {
    const saveDir = config.has('artwork.saveDir') 
      ? config.get('artwork.saveDir') 
      : './images';
    
    const stats = await getImageStats(saveDir);
    res.json({
      enabled: config.has('artwork.autoSave') ? config.get('artwork.autoSave') : true,
      saveDir: saveDir,
      ...stats
    });
  } catch (error) {
    console.error('获取状态失败:', error);
    res.status(500).json({ error: '获取状态失败' });
  }
});

// 添加获取图片列表的路由
app.get("/api/images", async function(req, res) {
  try {
    const saveDir = config.has('artwork.saveDir') ? config.get('artwork.saveDir') : './images';
    const files = await fs.readdir(saveDir);
    const imageFiles = files.filter(file => /\.(jpg|jpeg|png)$/i.test(file));
    res.json(imageFiles);
  } catch (error) {
    console.error('获取图片列表失败:', error);
    res.status(500).json({ error: '获取图片列表失败' });
  }
});

app.get("/api/status", function(req, res) {
    if (!core || !transport) {
        res.status(500).json({ error: "未连接到 Roon Core" });
        return;
    }

    // 如果有选定的区域，返回其状态
    if (settings.output) {
        const zone = zoneStatus.find(z => 
            z.outputs.some(o => o.output_id === settings.output.output_id)
        );
        
        if (zone && zone.state === "playing" && zone.now_playing) {
            res.json({
                is_playing: true,
                ...zone.now_playing
            });
            return;
        }
    }
    
    res.json({ is_playing: false });
});

app.get("/api/pair", function(req, res) {
    res.json({ pairEnabled: pairStatus });
});

app.get("/api/zones", function(req, res) {
    if (!core || !transport) {
        res.status(500).json({ error: "未连接到 Roon Core" });
        return;
    }
    res.json(zoneStatus);
});

// =========================== EventEmitter 基类 ===========================

class EventEmitter {
    constructor() {
        this.events = {};
    }

    on(event, callback) {
        if (!this.events[event]) {
            this.events[event] = [];
        }
        this.events[event].push(callback);
    }

    emit(event, data) {
        const callbacks = this.events[event];
        if (callbacks) {
            callbacks.forEach(callback => callback(data));
        }
    }

    off(event, callback) {
        const callbacks = this.events[event];
        if (callbacks) {
            this.events[event] = callbacks.filter(cb => cb !== callback);
        }
    }
}

// =========================== 优化的管理类 ===========================

// 连接状态管理器
class RoonConnectionManager extends EventEmitter {
    constructor() {
        super();
        this.state = 'disconnected'; // disconnected, connecting, paired
        this.core = null;
        this.reconnectTimer = null;
        this.maxReconnectAttempts = 5;
        this.currentReconnectAttempt = 0;
        this.reconnectInterval = 5000;
        this.lastConnectedTime = null;
    }
    
    setState(newState) {
        const oldState = this.state;
        this.state = newState;
        console.log(`连接状态变化: ${oldState} -> ${newState}`);
        this.emit('stateChange', { oldState, newState });
    }
    
    setCore(core) {
        this.core = core;
        if (core) {
            this.lastConnectedTime = Date.now();
            this.stopReconnect();
            this.setState('paired');
        } else {
            this.setState('disconnected');
        }
    }
    
    startReconnect() {
        if (this.reconnectTimer) return;
        
        console.log('启动自动重连机制');
        this.setState('connecting');
        
        this.reconnectTimer = setInterval(() => {
            if (this.currentReconnectAttempt >= this.maxReconnectAttempts) {
                console.log(`重连失败，已达到最大尝试次数 ${this.maxReconnectAttempts}`);
                this.stopReconnect();
                this.setState('disconnected');
                this.emit('reconnectFailed');
                return;
            }
            
            this.currentReconnectAttempt++;
            console.log(`重连尝试 ${this.currentReconnectAttempt}/${this.maxReconnectAttempts}`);
            
            // 重新开始发现
            roon.start_discovery();
        }, this.reconnectInterval);
    }
    
    stopReconnect() {
        if (this.reconnectTimer) {
            console.log('停止自动重连');
            clearInterval(this.reconnectTimer);
            this.reconnectTimer = null;
            this.currentReconnectAttempt = 0;
        }
    }
    
    getConnectionInfo() {
        return {
            state: this.state,
            lastConnectedTime: this.lastConnectedTime,
            reconnectAttempts: this.currentReconnectAttempt,
            isReconnecting: !!this.reconnectTimer
        };
    }
}

// 订阅管理器
class SubscriptionManager {
    constructor() {
        this.subscriptions = new Map();
    }
    
    subscribe(service, type, callback, options = {}) {
        const key = `${service.constructor.name}-${type}`;
        console.log(`订阅服务: ${key}`);
        
        // 如果已存在订阅，先取消
        if (this.subscriptions.has(key)) {
            this.unsubscribe(key);
        }
        
        try {
            const subscribeMethod = `subscribe_${type}`;
            if (typeof service[subscribeMethod] !== 'function') {
                throw new Error(`服务不支持订阅类型: ${type}`);
            }
            
            const subscription = service[subscribeMethod](callback);
            this.subscriptions.set(key, {
                subscription,
                service,
                type,
                callback,
                options,
                createdAt: Date.now()
            });
            
            return key;
        } catch (error) {
            console.error(`订阅失败 ${key}:`, error);
            throw error;
        }
    }
    
    unsubscribe(key) {
        const sub = this.subscriptions.get(key);
        if (sub) {
            try {
                console.log(`取消订阅: ${key}`);
                const unsubscribeMethod = `unsubscribe_${sub.type}`;
                if (typeof sub.service[unsubscribeMethod] === 'function') {
                    sub.service[unsubscribeMethod](sub.subscription);
                }
                this.subscriptions.delete(key);
                return true;
            } catch (error) {
                console.error(`取消订阅失败 ${key}:`, error);
                return false;
            }
        }
        return false;
    }
    
    unsubscribeAll() {
        console.log(`取消所有订阅 (${this.subscriptions.size} 个)`);
        const keys = Array.from(this.subscriptions.keys());
        let successCount = 0;
        
        keys.forEach(key => {
            if (this.unsubscribe(key)) {
                successCount++;
            }
        });
        
        console.log(`成功取消 ${successCount}/${keys.length} 个订阅`);
        return successCount;
    }
    
    getSubscriptionInfo() {
        const subscriptions = [];
        for (const [key, sub] of this.subscriptions) {
            subscriptions.push({
                key,
                type: sub.type,
                service: sub.service.constructor.name,
                createdAt: sub.createdAt,
                uptime: Date.now() - sub.createdAt
            });
        }
        return subscriptions;
    }
}

// 配置管理器
class ConfigManager {
    constructor(roon) {
        this.roon = roon;
        this.configVersion = '1.0';
        this.defaultConfig = {
            output: undefined,
            preferences: {
                autoReconnect: true,
                reconnectInterval: 5000,
                healthCheckInterval: 30000
            }
        };
    }
    
    async saveConfig(key, data) {
        try {
            const configData = {
                ...data,
                version: this.configVersion,
                timestamp: Date.now()
            };
            
            console.log(`保存配置: ${key}`);
            this.roon.save_config(key, configData);
            
            // 验证保存
            const saved = this.roon.load_config(key);
            if (!saved || saved.timestamp !== configData.timestamp) {
                throw new Error('配置保存验证失败');
            }
            
            console.log(`配置保存成功: ${key}`);
            return true;
        } catch (error) {
            console.error(`保存配置失败 ${key}:`, error);
            return false;
        }
    }
    
    loadConfig(key) {
        try {
            const config = this.roon.load_config(key);
            if (!config) {
                console.log(`配置不存在，使用默认配置: ${key}`);
                return this.defaultConfig;
            }
            
            // 检查版本兼容性
            if (config.version !== this.configVersion) {
                console.log(`配置版本不匹配，迁移配置: ${config.version} -> ${this.configVersion}`);
                return this.migrateConfig(config);
            }
            
            console.log(`加载配置成功: ${key}`);
            return config;
        } catch (error) {
            console.error(`加载配置失败 ${key}:`, error);
            return this.defaultConfig;
        }
    }
    
    migrateConfig(oldConfig) {
        // 配置迁移逻辑
        const migratedConfig = {
            ...this.defaultConfig,
            ...oldConfig,
            version: this.configVersion,
            timestamp: Date.now()
        };
        
        console.log('配置迁移完成');
        return migratedConfig;
    }
}

// 健康监控器
class HealthMonitor extends EventEmitter {
    constructor(connectionManager) {
        super();
        this.connectionManager = connectionManager;
        this.healthCheckInterval = null;
        this.lastPingTime = null;
        this.checkInterval = 30000; // 30秒
        this.failureCount = 0;
        this.maxFailures = 3;
    }
    
    startHealthCheck() {
        if (this.healthCheckInterval) return;
        
        console.log(`启动健康检查 (间隔: ${this.checkInterval}ms)`);
        this.healthCheckInterval = setInterval(() => {
            this.pingCore();
        }, this.checkInterval);
    }
    
    stopHealthCheck() {
        if (this.healthCheckInterval) {
            console.log('停止健康检查');
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
            this.failureCount = 0;
        }
    }
    
    async pingCore() {
        try {
            if (!this.connectionManager.core || !this.connectionManager.core.services) {
                throw new Error('Core不可用');
            }
            
            // 简单的健康检查 - 检查transport服务
            const transport = this.connectionManager.core.services.RoonApiTransport;
            if (!transport) {
                throw new Error('Transport服务不可用');
            }
            
            this.lastPingTime = Date.now();
            this.failureCount = 0;
            this.emit('healthCheck', { 
                status: 'ok', 
                timestamp: this.lastPingTime,
                uptime: this.lastPingTime - this.connectionManager.lastConnectedTime
            });
            
        } catch (error) {
            this.failureCount++;
            console.error(`健康检查失败 (${this.failureCount}/${this.maxFailures}):`, error.message);
            
            this.emit('healthCheck', { 
                status: 'error', 
                error: error.message,
                failureCount: this.failureCount,
                timestamp: Date.now()
            });
            
            // 如果连续失败次数达到阈值，触发重连
            if (this.failureCount >= this.maxFailures) {
                console.log('健康检查连续失败，触发重连');
                this.connectionManager.startReconnect();
                this.stopHealthCheck();
            }
        }
    }
    
    getHealthStatus() {
        return {
            isRunning: !!this.healthCheckInterval,
            lastPingTime: this.lastPingTime,
            failureCount: this.failureCount,
            maxFailures: this.maxFailures,
            checkInterval: this.checkInterval
        };
    }
}

// =========================== 初始化优化管理器 ===========================

// 声明管理器变量
var connectionManager = null;
var subscriptionManager = null;
var configManager = null;
var healthMonitor = null;

// 在这里初始化管理器（在所有类定义之后）
function initializeManagers() {
    console.log('初始化优化管理器...');
    
    // 初始化管理器实例
    connectionManager = new RoonConnectionManager();
    subscriptionManager = new SubscriptionManager();
    configManager = new ConfigManager(roon);
    healthMonitor = new HealthMonitor(connectionManager);

    // 设置事件监听
    connectionManager.on('stateChange', (data) => {
        console.log(`连接状态变化: ${data.oldState} -> ${data.newState}`);
        io.emit("connectionStatus", {
            state: data.newState,
            info: connectionManager.getConnectionInfo()
        });
    });

    connectionManager.on('reconnectFailed', () => {
        console.log('自动重连失败，请检查Roon Core状态');
        svc_status.set_status("自动重连失败", true);
    });

    healthMonitor.on('healthCheck', (data) => {
        if (data.status === 'error') {
            console.log(`健康检查失败: ${data.error}`);
        }
    });

    console.log('优化管理器初始化完成');
}

// 延迟初始化，确保所有类都已定义
setTimeout(initializeManagers, 100);
