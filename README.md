# Roon Cover Art Extension

一个用于展示 Roon 专辑封面的扩展程序，支持实时播放显示和艺术墙展示模式。

## 功能特点

1. **实时播放显示**
   - 显示当前播放曲目的专辑封面
   - 自动提取封面主色调作为背景色
   - 支持全屏显示
   - 双击页面任意位置进入全屏模式（按 ESC 退出）
   - 高性能图片切换，支持4K高清显示（2160x2160）
   - 优化的交叉淡入淡出过渡效果

2. **艺术墙模式**
   - 在停止播放15秒后自动切换到艺术墙模式
   - 4x4网格布局展示（16个位置）
      - 每60秒自动更新多张图片
      - 优化布局：20px网格间距和外边距，最大化图片显示区域
   - 优化的书页翻转动画效果（从右向左）
   - 支持多图片连续翻转的视觉体验

3. **专用画屏优化**
   - 针对22寸竖屏（1920x1920）专门优化
   - 支持7x24小时稳定运行
   - 智能图片缓存管理
   - 性能监控和内存优化
   - 防止屏幕保护程序激活

4. **自动保存功能**
   - 自动保存播放过的专辑封面
   - 支持自定义保存目录
   - 智能文件命名（使用image_key和专辑名）
   - 避免重复保存相同图片
   - 支持JPG/PNG格式配置

5. **键盘快捷键控制**
   - 空格键 - 播放/暂停切换
   - ←/→箭头键 - 上一曲/下一曲  
   - P键 - 播放
   - ESC键 - 停止
   - 媒体键 - 支持键盘上的媒体控制键
   - MediaSession API集成，支持操作系统级媒体控制

6. **连接管理**
   - 自动重连机制
   - 健康状态监控
   - 连接状态实时反馈
   - 优化的订阅管理

## 安装方法

### 方法1：使用 Docker（推荐）

#### Docker CLI 简化版：
```bash
# 创建必要的配置目录
mkdir -p /cache/Roonart/images
cd /cache/Roonart
# 创建配置文件（如果不存在）
touch config.json
echo '{}' > config.json

docker run -d \
  --name roon-coverart \
  --network host \
  --restart unless-stopped \
  -v $(pwd)/config.json:/app/config.json \
  -v $(pwd)/images:/app/images \
  epochaudio/coverart:latest
```

#### Docker Compose 简化版：
```yaml
version: '3'
services:
  coverart:
    image: epochaudio/coverart:latest
    container_name: roon-coverart
    network_mode: "host"
    restart: unless-stopped
    volumes:
      - ./images:/app/images:rw
      - ./config.json:/app/config.json:rw
```

#### 🎯 优势

1. **无需手动权限设置** - Dockerfile已处理所有权限问题
2. **简化部署流程** - 减少用户操作步骤
3. **安全性增强** - 以非root用户运行
4. **一致性保证** - 消除环境差异导致的权限问题

### 方法2：手动安装

1. 克隆或下载本仓库
2. 进入项目目录
3. 安装依赖：
```bash
npm install
```
4. 启动服务：
```bash
node app.js
```

## 配置说明

默认端口为3666，可通过以下方式修改：

1. 命令行参数：
```bash
node app.js -p 3000
```

2. 配置文件：
编辑 `config/default.json`：
```json
{
  "server": {
    "port": 3666
  },
  "artwork": {
    "saveDir": "./images",
    "autoSave": true,
    "format": "jpg"
  }
}
```

### 配置项说明

- `server.port`: 服务器监听端口
- `artwork.saveDir`: 专辑封面保存目录
- `artwork.autoSave`: 是否自动保存专辑封面
- `artwork.format`: 保存图片的格式（jpg/png）


## API 端点

项目提供了以下API端点：

- `GET /roonapi/getImage?image_key=xxx&albumName=xxx` - 获取专辑封面图片（标准分辨率1080x1080）
- `GET /roonapi/getImage4k?image_key=xxx` - 获取4K高清专辑封面（2160x2160）
- `GET /api/images/random?count=16` - [新增] 随机获取指定数量的封面图片（性能优化）
- `GET /api/status` - 获取当前播放状态
- `GET /api/pair` - 获取Roon Core配对状态
- `GET /api/zones` - 获取所有可用的播放区域
- `GET /api/images` - 获取已保存的专辑封面列表
- `GET /roonapi/artworkStatus` - 获取图片保存状态和统计信息

## 使用说明

1. 访问 `http://localhost:3666`（或您配置的端口）
2. 在 Roon 中启用扩展
3. 选择要显示的播放区域
4. 开始使用！

## 显示要求

- 屏幕：22寸竖屏（1920x1920）
- 环境：专用WebView，全屏显示
- 运行：支持7x24小时稳定运行

## 注意事项

1. 确保 images 目录具有正确的读写权限
   ```bash
   # 进入项目目录
   cd /path/to/coverart
   
   # 设置正确的所有权和权限
   sudo chown -R 1000:1000 images
   sudo chmod 755 images
   ```
   注意：这些命令需要在宿主机上执行，而不是在容器内。用户ID 1000对应容器内的node用户。

2. Docker 安装时请确保正确映射配置文件和图片目录
3. 建议使用 Chrome 或基于 Chromium 的浏览器以获得最佳体验

## 图片保存机制

### 工作原理

1. **触发条件**
- 图片保存是通过 `/roonapi/getImage` API 端点触发的
- 当有设备请求图片时，服务器会：
  1. 从 Roon Core 获取图片
  2. 检查自动保存设置
  3. 如果启用了自动保存，则保存图片

2. **重要说明**
- 如果没有设备访问网页界面，不会触发图片保存
- 即使 Roon 正在播放音乐，如果没有设备访问网页，也不会保存图片
- 图片保存是在设备请求图片时才会触发

3. **解决方案**
如果需要在没有设备访问的情况下也保存图片，可以：
- 修改代码，在接收到 `nowplaying` 事件时直接保存图片
- 使用一个始终运行的轻量级客户端（如 headless browser）来访问页面
- 或者创建一个独立的保存服务，直接监听 Roon 事件并保存图片

4. **配置说明**
可以在 `config/default.json` 中配置自动保存行为：
```json
{
  "artwork": {
    "saveDir": "./images",
    "autoSave": true,
    "format": "jpg"
  }
}
```

## 更新记录

### 3.1.3 (2025-12) 代码重构与优化
- **后端重构**：将单体应用拆分为模块化服务（Server, Roon, Image, Socket），提升代码可维护性
- **性能优化**：
  - 新增 `/api/images/random` 接口，按需加载随机图片
  - 艺术墙模式不再下载全量图片列表，大幅降低网络和内存开销
- **Docker 优化**：
  - 修复 Token 持久化配置，确保重启不丢失配对信息
  - 优化 Dockerfile 入口点和目录权限
- **现代化**：全面升级为 Async/Await 异步处理

### 3.1.1 (2024-07)
- 添加专用画屏显示优化功能
- 新增高性能图片预加载和缓存机制
- 实现交叉淡入淡出图片切换效果
- 添加性能监控和内存管理
- 优化4K图片显示支持（2160x2160）
- 改进艺术墙网格布局为4x4（16个位置）
- 增强连接管理和自动重连机制
- 优化图片保存功能，避免重复保存
- 提升长时间运行稳定性


### 3.0.8 (2024-03)
- 优化图片切换动画效果
- 实现渐变式明暗过渡
- 提升视觉体验流畅度

### 3.0.7 (2024-03)
- 优化定时器管理机制
- 改进图片翻转动画性能
- 提升内存使用效率
- 修复长时间运行可能导致卡死的问题

### 3.0.6 (2024-03)
- 优化网格显示的图片翻转效果
  - 实现从右向左的书页翻转动画
  - 优化翻转时的图片加载和切换
  - 改进多图片连续翻转的视觉体验

