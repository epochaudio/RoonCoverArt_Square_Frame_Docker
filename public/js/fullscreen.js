"use strict";

// 全局变量和常量定义
const socket = io();
let currentImageKey = null;
let mouseTimer;
const IMAGE_TIMEOUT = 10000;  // 图片加载超时时间（10秒）
let updateInterval = null;
let playbackTimer = null;
const GRID_UPDATE_INTERVAL = 120000; // 120秒更新周期
const IMAGES_TO_UPDATE = 3; // 每次更新3张图片

// 设置相关
const settings = {
  theme: readCookie("settings['theme']") || 'dark',
  zoneID: readCookie("settings['zoneID']") || null
};

// 样式相关
const css = {
  backgroundColor: '#232629',
  foregroundColor: '#eff0f1',
  colorBackground: '#000000'
};

// 图片加载和缓存管理
class ImageLoader {
    constructor() {
        this.imagePool = new Map();
        this.maxPoolSize = 25;  // 降低缓存数量，16个网格+9个预留
        this.loadTimeout = 8000;  // 8秒超时
    }

    loadImage(url) {
        if (this.imagePool.has(url)) {
            console.log('从缓存加载图片:', url);
            return Promise.resolve(this.imagePool.get(url));
        }

        return new Promise((resolve, reject) => {
            const img = new Image();
            const timeout = setTimeout(() => {
                img.src = '';
                reject(new Error('图片加载超时'));
            }, this.loadTimeout);

            img.onload = () => {
                clearTimeout(timeout);
                this.imagePool.set(url, img);
                this.cleanImagePool();
                resolve(img);
            };

            img.onerror = () => {
                clearTimeout(timeout);
                reject(new Error(`加载图片失败: ${url}`));
            };

            img.src = url;
        });
    }

    cleanImagePool() {
        if (this.imagePool.size > this.maxPoolSize) {
            console.log('清理图片缓存池');
            const entries = Array.from(this.imagePool.entries());
            const toRemove = entries.slice(0, entries.length - this.maxPoolSize);
            toRemove.forEach(([url, img]) => {
                console.log('从缓存池移除:', url);
                // 显式清理图片资源
                img.src = '';
                img.onload = null;
                img.onerror = null;
                this.imagePool.delete(url);
            });
        }
    }
}

// 创建全局图片加载器实例
const imageLoader = new ImageLoader();

// 创建键盘控制器实例
let keyboardController = null;

// 修改现有的图片加载相关函数
async function loadImage(url) {
    try {
        return await imageLoader.loadImage(url);
    } catch (error) {
        console.error('图片加载失败:', error);
        throw error;
    }
}

// 内存监控
function monitorMemory() {
    if (window.performance && window.performance.memory) {
        const memory = window.performance.memory;
        const usedMB = Math.round(memory.usedJSHeapSize / 1024 / 1024);
        const limitMB = Math.round(memory.jsHeapSizeLimit / 1024 / 1024);
        
        console.log('内存使用情况:', {
            限制: limitMB + 'MB',
            已使用: usedMB + 'MB',
            使用率: Math.round((memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100) + '%'
        });

        // 降低内存阈值到60%
        if (memory.usedJSHeapSize / memory.jsHeapSizeLimit > 0.6) {
            console.log('内存使用过高，开始清理');
            forceCleanup();
        }
    }
}

// 强制清理函数
function forceCleanup() {
    console.log('执行强制内存清理');
    
    // 清理图片缓存
    imageLoader.cleanImagePool();
    
    // 清理显示缓存
    if (typeof displayImageCache !== 'undefined') {
        displayImageCache.clear();
        displayCacheSize = 0;
    }
    
    // 清理DOM中的空图片
    document.querySelectorAll('img[src*="transparent.png"]').forEach(img => {
        img.removeAttribute('src');
    });
    
    // 强制垃圾回收
    if (window.gc) {
        window.gc();
    }
}

// 错误恢复机制
function attemptRecovery() {
    console.log('开始执行恢复程序');
    imageLoader.cleanImagePool();
    if (updateInterval) {
        clearInterval(updateInterval);
        updateInterval = null;
    }
    setTimeout(() => {
        console.log('尝试重新初始化显示');
        initializeGridDisplay();
    }, 5000);
}

// 设备检测
function isTouchDevice() {
    return (('ontouchstart' in window) ||
        (navigator.maxTouchPoints > 0) ||
        (navigator.msMaxTouchPoints > 0));
}

// 时钟功能
function updateTime() {
    const clockContent = document.querySelector('.clock-content');
    if (!clockContent) {
        // 时钟元素不存在时静默返回（专辑显示模式下是正常的）
        return;
    }
    
    const now = new Date();
    const dateStr = now.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        weekday: 'long'
    });
    
    const timeStr = now.toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
    
    const dateElement = clockContent.querySelector('.date');
    const timeElement = clockContent.querySelector('.time');
    
    if (dateElement) {
        dateElement.textContent = dateStr;
    }
    
    if (timeElement) {
        const [hours, minutes, seconds] = timeStr.split(':');
        timeElement.innerHTML = `${hours}:${minutes}<span class="seconds">${seconds}</span>`;
    }
}

// 显示模式切换
function toggleDisplayMode(isPlaying) {
    console.log('切换显示模式, isPlaying:', isPlaying);
    const gridContainer = document.getElementById('gridContainer');
    const playingContainer = document.getElementById('playingContainer');
    
    if (!gridContainer || !playingContainer) {
        console.error('找不到必要的DOM元素:', {
            gridContainer: !!gridContainer,
            playingContainer: !!playingContainer
        });
        return;
    }
    
    if (isPlaying) {
        console.log('切换到播放显示模式');
        gridContainer.classList.add('hidden');
        playingContainer.classList.remove('hidden');
        if (updateInterval) {
            console.log('清除网格更新定时器');
            clearInterval(updateInterval);
            updateInterval = null;
        }
    } else {
        console.log('切换到网格显示模式');
        playingContainer.classList.add('hidden');
        gridContainer.classList.remove('hidden');
        console.log('初始化网格显示');
        initializeGridDisplay();
    }
}

// 图片更新相关函数
async function initializeGridDisplay() {
    if (updateInterval) {
        clearInterval(updateInterval);
    }

    try {
        await updateGridImages();
        // 设置120秒更新间隔
        updateInterval = setInterval(updateRandomImages, GRID_UPDATE_INTERVAL);
        console.log('设置了定时更新，间隔: 120秒');
    } catch (error) {
        console.error('初始化网格显示失败:', error);
        attemptRecovery();
    }
}

async function updateGridImages() {
    console.log('开始获取图片列表');
    const response = await fetch('/api/images');
    if (!response.ok) {
        throw new Error('获取图片列表失败');
    }
    const images = await response.json();
    console.log('获取到的图片列表:', images);
    
    if (images.length === 0) {
        console.log('没有可用的图片');
        return;
    }
    
    const gridItems = document.querySelectorAll('.grid-item:not(.clock)');
    console.log('找到的网格元素数量:', gridItems.length);
    
    const selectedImages = [];
    const usedIndices = new Set();
    
    while (selectedImages.length < 16) {
        const randomIndex = Math.floor(Math.random() * images.length);
        if (!usedIndices.has(randomIndex)) {
            usedIndices.add(randomIndex);
            selectedImages.push(images[randomIndex]);
        }
        if (usedIndices.size === images.length && selectedImages.length < 16) {
            usedIndices.clear();
        }
    }
    
    const loadPromises = Array.from(gridItems).map(async (gridItem, index) => {
        try {
            if (index < selectedImages.length) {
                const imageUrl = `/images/${selectedImages[index]}`;
                console.log('加载图片:', imageUrl);
                const loadedImg = await loadImage(imageUrl);
                const frontImg = gridItem.querySelector('.front');
                const backImg = gridItem.querySelector('.back');
                if (frontImg) frontImg.src = loadedImg.src;
                if (backImg) backImg.src = '/img/transparent.png';
            } else {
                const frontImg = gridItem.querySelector('.front');
                const backImg = gridItem.querySelector('.back');
                if (frontImg) frontImg.src = '/img/transparent.png';
                if (backImg) backImg.src = '/img/transparent.png';
            }
        } catch (error) {
            console.error('加载图片失败:', error);
            const frontImg = gridItem.querySelector('.front');
            const backImg = gridItem.querySelector('.back');
            if (frontImg) frontImg.src = '/img/transparent.png';
            if (backImg) backImg.src = '/img/transparent.png';
        }
    });

    await Promise.all(loadPromises);
}

async function updateRandomImages() {
    console.log('开始随机更新图片...');
    try {
        const response = await fetch('/api/images');
        if (!response.ok) {
            throw new Error('获取图片列表失败');
        }
        const images = await response.json();
        console.log('可用图片总数:', images.length);
        if (images.length === 0) return;

        // 获取当前显示的所有图片
        const gridItems = document.querySelectorAll('.grid-item:not(.clock)');
        console.log('网格图片元素数量:', gridItems.length);
        
        const currentImages = Array.from(gridItems).map(item => {
            const frontImg = item.querySelector('.front');
            const path = frontImg.src.split('/').pop();
            return path === 'transparent.png' ? null : path;
        });
        console.log('当前显示的图片:', currentImages);

        // 随机选择5个不同位置进行更新
        const positions = Array.from({ length: gridItems.length }, (_, i) => i)
            .filter(i => !gridItems[i].closest('.clock')); // 排除时钟位置
        
        const updatePositions = [];
        for (let i = 0; i < IMAGES_TO_UPDATE && positions.length > 0; i++) {
            const randomIndex = Math.floor(Math.random() * positions.length);
            updatePositions.push(positions.splice(randomIndex, 1)[0]);
        }
        console.log('将要更新的位置:', updatePositions);

        // 为每个位置选择一个新图片并预加载
        const updates = await Promise.all(updatePositions.map(async position => {
            // 选择一个不在当前显示列表中的图片
            let newImage;
            do {
                const randomIndex = Math.floor(Math.random() * images.length);
                newImage = images[randomIndex];
            } while (currentImages.includes(newImage));
            
            const imageUrl = `/images/${newImage}`;
            try {
                const loadedImg = await loadImage(imageUrl);
                return { position, newImage, loadedImg };
            } catch (error) {
                console.error(`位置 ${position} 预加载失败:`, error);
                return { position, error: true };
            }
        }));

        // 依次执行翻转动画
        for (let i = 0; i < updates.length; i++) {
            const update = updates[i];
            if (update.error) continue;

            const gridItem = gridItems[update.position];
            const backImg = gridItem.querySelector('.back');
            
            // 等待前一张图片的动画完成（3秒间隔）
            if (i > 0) {
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
            
            console.log(`位置 ${update.position} 将更新为:`, update.newImage);
            
            // 先更新背面的图片
            backImg.src = update.loadedImg.src;
            
            // 执行翻转动画
            console.log(`对位置 ${update.position} 应用翻转效果`);
            gridItem.classList.add('flip');
            
            // 更新当前图片列表
            currentImages[update.position] = update.newImage;
            
            // 等待翻转动画完成
            await new Promise(resolve => {
                setTimeout(() => {
                    // 翻转完成后，交换前后图片
                    const frontImg = gridItem.querySelector('.front');
                    frontImg.src = update.loadedImg.src;
                    backImg.src = '/img/transparent.png';
                    // 重置翻转状态
                    gridItem.classList.remove('flip');
                    resolve();
                }, 500); // 与 CSS transition 时间相匹配
            });
        }
    } catch (error) {
        console.error('更新随机图片失败:', error);
    }
}

// 图片更新函数
function updateImage(imageKey, albumName) {
    console.log('开始更新图片:', { imageKey, albumName });
    if (!imageKey) {
        console.log('无图片key，使用默认图片');
        $('#coverImage').attr('src', '/img/transparent.png');
        return;
    }

    const imageUrl = '/roonapi/getImage?image_key=' + imageKey + 
        '&albumName=' + encodeURIComponent(albumName || '') +
        '&scale=full&format=image/jpeg&quality=100';
    console.log('图片URL:', imageUrl);
    
    $('#coverImage').attr('src', imageUrl);
}

// Cookie 相关函数
function readCookie(name) {
    return Cookies.get(name);
}

function setCookie(name, value) {
    Cookies.set(name, value, { expires: 365 });
}

// 主题设置
function setTheme(theme) {
    settings.theme = theme;
    updateImage(currentImageKey);
}

// 传输控制处理函数
function handleTransportCommand(data) {
    console.log('发送传输控制命令:', data);
    if (socket && socket.connected) {
        socket.emit('transport', {
            zoneID: settings.zoneID,
            command: data.command
        });
    } else {
        console.warn('Socket 未连接，无法发送传输控制命令');
    }
}

// 更新MediaSession信息
function updateMediaSessionInfo(nowPlaying) {
    if (keyboardController && nowPlaying) {
        const metadata = {
            title: nowPlaying.three_line?.line1 || '未知标题',
            artist: nowPlaying.three_line?.line2 || '未知艺术家',
            album: nowPlaying.three_line?.line3 || nowPlaying.album || '未知专辑',
            artwork: nowPlaying.image_key ? [
                {
                    src: `/roonapi/getImage4k?image_key=${nowPlaying.image_key}`,
                    sizes: '2160x2160',
                    type: 'image/jpeg'
                },
                {
                    src: `/roonapi/getImage?image_key=${nowPlaying.image_key}&scale=full&format=image/jpeg`,
                    sizes: '1080x1080',
                    type: 'image/jpeg'
                }
            ] : []
        };
        
        keyboardController.updateMediaSession(metadata);
    }
}

// 事件监听器设置
document.addEventListener('DOMContentLoaded', function() {
    const isTouch = isTouchDevice();
    updateTime();
    setInterval(updateTime, 1000);
    initializeGridDisplay();
    
    // 初始化键盘控制器
    if (typeof KeyboardController !== 'undefined') {
        keyboardController = new KeyboardController();
        keyboardController.on('transport', handleTransportCommand);
        console.log('键盘控制器已初始化并连接到传输控制');
    } else {
        console.warn('KeyboardController 类未找到');
    }
    
    // 启动内存监控，每2分钟检查一次
    setInterval(monitorMemory, 120000);
    
    // 每10分钟执行一次强制清理
    setInterval(forceCleanup, 600000);
});

// Socket.IO 事件处理
socket.on('pairStatus', function(payload) {
    console.log('收到配对状态:', payload);
    const pairDisabled = document.getElementById('pairDisabled');
    if (payload && payload.pairEnabled === true) {
        if (pairDisabled) pairDisabled.style.display = 'none';
        console.log('发送getZone请求:', settings.zoneID || true);
        socket.emit("getZone", settings.zoneID || true);
    } else {
        if (pairDisabled) pairDisabled.style.display = 'flex';
    }
});

socket.on('zoneStatus', function(payload) {
    console.log('收到区域状态:', payload);
    if (payload && payload.length > 0) {
        if (!settings.zoneID) {
            settings.zoneID = payload[0].zone_id;
            console.log('设置新的zoneID:', settings.zoneID);
            setCookie("settings['zoneID']", settings.zoneID);
        }
        
        const zone = payload.find(z => z.zone_id === settings.zoneID) || payload[0];
        console.log('当前zone详细信息:', {
            zone_id: zone.zone_id,
            display_name: zone.display_name,
            state: zone.state,
            now_playing: zone.now_playing ? {
                image_key: zone.now_playing.image_key,
                three_line: zone.now_playing.three_line,
                album: zone.now_playing.album
            } : '无播放信息'
        });

        if (zone.now_playing && zone.now_playing.image_key !== currentImageKey) {
            const nowPlaying = zone.now_playing;
            console.log('更新图片key:', nowPlaying.image_key);
            currentImageKey = nowPlaying.image_key;
            
            // 获取专辑名称
            const albumName = nowPlaying.three_line?.line3 || nowPlaying.album;
            
            console.log('专辑信息:', {
                albumName,
                来源: nowPlaying.three_line?.line3 ? 'three_line.line3' : 'album字段',
                原始数据: {
                    three_line: nowPlaying.three_line,
                    album: nowPlaying.album
                }
            });
            
            if (albumName) {
                updateImage(currentImageKey, albumName);
            } else {
                console.warn('警告：无法获取专辑名称，完整数据:', nowPlaying);
                updateImage(currentImageKey);
            }
            
            // 更新MediaSession信息
            updateMediaSessionInfo(nowPlaying);
            
            // 只在播放状态时切换到专辑显示模式
            if (zone.state === 'playing') {
                console.log('检测到播放状态，切换到专辑显示');
                toggleDisplayMode(true);
            }
        }
        
        // 更新MediaSession播放状态
        if (keyboardController) {
            const playbackState = zone.state === 'playing' ? 'playing' : 
                                 zone.state === 'paused' ? 'paused' : 'none';
            keyboardController.setPlaybackState(playbackState);
        }
        
        // 处理非播放状态（paused, stopped等）
        if (zone.state && zone.state !== 'playing') {
            console.log('检测到非播放状态:', zone.state);
            // 清除任何现有的切换定时器
            if (playbackTimer) {
                console.log('清除现有定时器');
                clearTimeout(playbackTimer);
            }
            
            console.log('设置5秒切换定时器');
            playbackTimer = setTimeout(() => {
                console.log('5秒已到，切换到网格显示');
                toggleDisplayMode(false);
            }, 5000);
        }
    } else {
        console.log('未收到区域信息或区域列表为空');
    }
});

socket.on('notPlaying', function(data) {
    console.log('收到非播放状态事件:', data);
    try {
        if (playbackTimer) {
            console.log('清除现有定时器');
            clearTimeout(playbackTimer);
        }
        
        console.log('设置5秒切换定时器');
        playbackTimer = setTimeout(() => {
            console.log('5秒已到，切换到网格显示');
            toggleDisplayMode(false);
        }, 5000); // 5秒后切换到网格显示
    } catch (error) {
        console.error('处理非播放状态事件时出错:', error);
    }
});

socket.on('nowplaying', function(data) {
    console.log('收到开始播放事件:', data);
    
    try {
        if (data && data.image_key) {
            console.log('更新当前播放封面');
            currentImageKey = data.image_key;
            
            // 获取专辑名称
            const albumName = data.three_line?.line3 || data.album;
            
            if (albumName) {
                updateImage(data.image_key, albumName);
            } else {
                console.warn('警告：无法获取专辑名称，完整数据:', data);
                updateImage(data.image_key);
            }
            
            // 更新MediaSession信息
            updateMediaSessionInfo(data);
            
            // 设置MediaSession为播放状态
            if (keyboardController) {
                keyboardController.setPlaybackState('playing');
            }
            
            // 立即切换到播放显示模式
            toggleDisplayMode(true);
        }
        
        // 清除任何现有的切换定时器
        if (playbackTimer) {
            console.log('取消切换定时器');
            clearTimeout(playbackTimer);
            playbackTimer = null;
        }
    } catch (error) {
        console.error('处理播放事件时出错:', error);
    }
});
