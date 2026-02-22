"use strict";

/**
 * 键盘快捷键控制器类
 * 支持音乐播放控制和媒体键
 */
class KeyboardController extends EventEmitter {
    constructor() {
        super();
        this.isEnabled = true;
        this.keydownHandler = null;
        this.keyupHandler = null;
        this.keyMap = {
            // 基本控制键
            'Space': 'playPause',
            'KeyP': 'play',
            'Escape': 'stop',
            'ArrowLeft': 'previous',
            'ArrowRight': 'next',
            
            // 媒体键映射
            'MediaPlayPause': 'playPause',
            'MediaPlay': 'play',
            'MediaPause': 'pause',
            'MediaStop': 'stop',
            'MediaTrackPrevious': 'previous',
            'MediaTrackNext': 'next'
        };
        
        this.init();
    }

    init() {
        this.setupKeyboardEvents();
        this.setupMediaSession();
        console.log('键盘控制器已初始化');
    }

    setupKeyboardEvents() {
        this.keydownHandler = (event) => {
            if (!this.isEnabled) return;
            
            // 阻止某些键的默认行为
            if (this.shouldPreventDefault(event.code)) {
                event.preventDefault();
            }
            
            this.handleKeyPress(event);
        };

        this.keyupHandler = (event) => {
            if (!this.isEnabled) return;
            
            // 对于某些键，在keyup时也阻止默认行为
            if (this.shouldPreventDefault(event.code)) {
                event.preventDefault();
            }
        };

        document.addEventListener('keydown', this.keydownHandler, true);
        document.addEventListener('keyup', this.keyupHandler, true);
    }

    shouldPreventDefault(keyCode) {
        // 阻止这些键的默认浏览器行为
        const preventKeys = ['Space', 'ArrowLeft', 'ArrowRight', 'Escape'];
        return preventKeys.includes(keyCode);
    }

    handleKeyPress(event) {
        const action = this.keyMap[event.code];
        
        if (action) {
            console.log(`键盘快捷键触发: ${event.code} -> ${action}`);
            this.executeAction(action);
        }
    }

    executeAction(action) {
        switch (action) {
            case 'playPause':
                this.emit('transport', { command: 'playpause' });
                break;
            case 'play':
                this.emit('transport', { command: 'play' });
                break;
            case 'pause':
                this.emit('transport', { command: 'pause' });
                break;
            case 'stop':
                this.emit('transport', { command: 'stop' });
                break;
            case 'previous':
                this.emit('transport', { command: 'previous' });
                break;
            case 'next':
                this.emit('transport', { command: 'next' });
                break;
            default:
                console.warn('未知的播放控制动作:', action);
        }
    }

    setupMediaSession() {
        if ('mediaSession' in navigator) {
            console.log('设置 MediaSession API');
            
            // 设置媒体会话元数据（当有播放内容时会更新）
            navigator.mediaSession.metadata = new MediaMetadata({
                title: 'Roon 音乐播放器',
                artist: '',
                album: '',
                artwork: []
            });

            // 设置播放控制处理器
            const actionHandlers = {
                'play': () => this.executeAction('play'),
                'pause': () => this.executeAction('pause'),
                'stop': () => this.executeAction('stop'),
                'previoustrack': () => this.executeAction('previous'),
                'nexttrack': () => this.executeAction('next')
            };

            for (const [action, handler] of Object.entries(actionHandlers)) {
                try {
                    navigator.mediaSession.setActionHandler(action, handler);
                    console.log(`MediaSession 动作已设置: ${action}`);
                } catch (error) {
                    console.warn(`设置 MediaSession 动作失败: ${action}`, error);
                }
            }
        } else {
            console.warn('浏览器不支持 MediaSession API');
        }
    }

    updateMediaSession(metadata) {
        if ('mediaSession' in navigator && metadata) {
            try {
                navigator.mediaSession.metadata = new MediaMetadata({
                    title: metadata.title || '',
                    artist: metadata.artist || '',
                    album: metadata.album || '',
                    artwork: metadata.artwork || []
                });
                console.log('MediaSession 元数据已更新:', metadata);
            } catch (error) {
                console.error('更新 MediaSession 元数据失败:', error);
            }
        }
    }

    setPlaybackState(state) {
        if ('mediaSession' in navigator) {
            try {
                // state 可以是 'none', 'paused', 'playing'
                navigator.mediaSession.playbackState = state;
                console.log('MediaSession 播放状态已更新:', state);
            } catch (error) {
                console.error('设置 MediaSession 播放状态失败:', error);
            }
        }
    }

    enable() {
        this.isEnabled = true;
        console.log('键盘控制器已启用');
    }

    disable() {
        this.isEnabled = false;
        console.log('键盘控制器已禁用');
    }

    destroy() {
        this.isEnabled = false;
        // 清理事件监听器
        if (this.keydownHandler) {
            document.removeEventListener('keydown', this.keydownHandler, true);
            this.keydownHandler = null;
        }
        if (this.keyupHandler) {
            document.removeEventListener('keyup', this.keyupHandler, true);
            this.keyupHandler = null;
        }
        
        // 清理 MediaSession
        if ('mediaSession' in navigator) {
            try {
                navigator.mediaSession.setActionHandler('play', null);
                navigator.mediaSession.setActionHandler('pause', null);
                navigator.mediaSession.setActionHandler('stop', null);
                navigator.mediaSession.setActionHandler('previoustrack', null);
                navigator.mediaSession.setActionHandler('nexttrack', null);
                console.log('MediaSession 动作处理器已清理');
            } catch (error) {
                console.warn('清理 MediaSession 时出错:', error);
            }
        }
        
        console.log('键盘控制器已销毁');
    }
}

// 导出到全局作用域
if (typeof window !== 'undefined') {
    window.KeyboardController = KeyboardController;
}
