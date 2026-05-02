# Docker 安装说明（当前版本）

本文基于当前已发布镜像和当前 `docker-compose.yml` 配置编写。默认推荐直接拉取镜像使用；需要本地构建时，叠加 `docker-compose.build.yml`。

## 1. 说明（当前持久化方式）

当前容器使用两套配置/状态文件：

- `./config/local.json` -> `/app/config/local.json`
  - 用于应用配置（`node-config`）
  - 镜像内保留 `config/default.json`，宿主机只覆盖 `config/local.json`
- `./config.json` -> `/app/config.json`
  - 用于 Roon 授权与扩展状态持久化（避免重启后重复授权）

重要：
- 应用端口等参数请改 `config/local.json`
- 不要把 Roon 授权状态写进 `config/local.json`

## 2. 镜像标签

当前可用镜像（已发布）：

- `epochaudio/coverart:latest`
- `epochaudio/coverart:3.1.5`

## 3. 准备目录与文件

在部署目录准备以下内容：

```bash
mkdir -p images config
test -f config.json || printf '{}\n' > config.json
test -f config/local.json || printf '{\n  "server": {\n    "port": "3666"\n  }\n}\n' > config/local.json
```

说明：
- `images/` 用于保存封面图
- `config.json` 用于保存 Roon 授权/配对状态（必须保留）
- `config/local.json` 用于覆盖默认配置

如果你只想用默认端口 `3666`，保留上面的默认 `config/local.json` 即可。

## 4. 推荐方式：先拉取镜像，再用 Docker Compose 启动

先拉取官方镜像（最简单、最快）：

```bash
docker pull epochaudio/coverart:latest
```

当前仓库的 `docker-compose.yml` 已包含运行已发布镜像所需的挂载、持久化、健康检查和基础安全设置。

启动：

```bash
docker compose up -d
```

查看日志：

```bash
docker compose logs -f
```

查看健康状态：

```bash
docker compose ps
```

停止：

```bash
docker compose down
```

## 5. 首次使用（Roon 授权）

首次启动后需要在 Roon 中授权扩展：

1. 打开 Roon
2. 进入 `Settings` -> `Extensions`
3. 找到 `CoverArt_Square_Docker`
4. 点击启用/授权

授权完成后，状态会写入宿主机的 `./config.json`。

后续容器重启/升级时，只要 `./config.json` 仍然挂载并可写，就不需要重新授权。

## 6. 修改端口（可选）

编辑 `config/local.json`，例如改为 `3667`：

```json
{
  "server": {
    "port": "3667"
  }
}
```

然后重启容器：

```bash
docker compose up -d
```

## 7. 升级镜像（保留授权和图片）

如果使用 `latest`（推荐）：

```bash
docker pull epochaudio/coverart:latest
docker compose up -d
```

如果你固定版本（例如 `3.1.5`），用 `COVERART_IMAGE` 指定镜像标签：

```bash
docker pull epochaudio/coverart:3.1.5
COVERART_IMAGE=epochaudio/coverart:3.1.5 docker compose up -d
```

## 8. 本地构建镜像（可选）

如果需要基于当前源码构建镜像：

```bash
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

本地构建会执行 `npm ci --omit=dev`，需要能访问 npm registry 和 GitHub 上的 Roon API 依赖。

## 9. 不使用 Compose（可选）

也可以直接先拉取镜像，再使用 `docker run`：

```bash
docker pull epochaudio/coverart:latest
```

```bash
docker run -d \
  --name coverart-app \
  --restart unless-stopped \
  --network host \
  -e ROON_PERSIST_PATH=/app/config.json \
  -v "$(pwd)/images:/app/images" \
  -v "$(pwd)/config/local.json:/app/config/local.json:ro" \
  -v "$(pwd)/config.json:/app/config.json" \
  epochaudio/coverart:latest
```

## 10. Compose 环境变量

可按需设置：

- `COVERART_IMAGE`: 镜像标签，默认 `epochaudio/coverart:latest`
- `COVERART_CONTAINER_NAME`: 容器名，默认 `coverart-app`
- `ALLOWED_ORIGINS`: 允许跨源浏览器访问的 Origin 列表，多个值用逗号分隔

## 11. 常见问题

### 11.1 每次重启都要重新授权

检查以下几点：

- `./config.json` 是否存在（应该是文件，不是目录）
- `docker-compose.yml` 是否挂载了 `./config.json:/app/config.json`
- 宿主机上的 `config.json` 是否可写

快速检查：

```bash
ls -l config.json
```

### 11.2 改了 `config.json` 里的端口但不生效

这是正常现象。

- `config.json` 是 Roon 授权状态文件
- 应用端口应写在 `config/local.json`

### 11.3 macOS / Windows 上 `host` 网络模式不可用

当前配置使用 `network_mode: "host"`（Linux 环境最方便）。

如果你在 Docker Desktop（macOS/Windows）上运行，需要改成端口映射方式，例如：

```yaml
ports:
  - "3666:3666"
```

并移除：

```yaml
network_mode: "host"
```
