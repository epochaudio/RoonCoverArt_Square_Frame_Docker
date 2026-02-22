# CoverArt 重构路线图（按收益排序）

## 目标

在不破坏现有功能（Roon 配对、播放封面显示、停止后网格墙、封面自动保存）的前提下，降低前后端重复逻辑、清理遗留代码、提高可维护性。

## 当前问题概览

- 前端存在双状态源：`public/js/fullscreen.js`（Socket 实时）与 `public/js/main.js`（HTTP 轮询）并存。
- 前端存在未接入或未使用代码：`public/js/fullscreen-display.js`、`NoSleep.min.js`、若干未使用变量。
- 后端 zone 过滤逻辑重复出现在 `roonService`、`socketService`、`api`。
- 版本号不一致（`package.json` / 前端 `app.js` / Roon 扩展版本）。
- `KeyboardController.destroy()` 的事件解绑实现无效。
- 仓库中保留旧版 `app.js` 单体实现，与 `src/` 模块化实现并存。

## 执行顺序（按收益排序）

### P0：前端去冗余（高收益、低风险）

1. 移除 `public/index.html` 中 `public/js/main.js` 的加载。
2. 保留 `public/js/app.js`（仅作为 `KeyboardController` 的 `EventEmitter` 依赖）。
3. 清理 `public/js/fullscreen.js` 中确定未使用的变量与死代码。
4. 移除未使用脚本引用（如 `NoSleep.min.js`，若未启用防息屏）。
5. 明确 `public/js/fullscreen-display.js` 状态：接入或删除。

预期收益：

- 消除双状态源与重复轮询请求。
- 降低前端维护成本与运行时噪音。

### P1：前端结构收敛（中高收益、中风险）

1. 从 `public/js/fullscreen.js` 提取局部公共函数（zone 选择、封面 URL 构造、计时器管理）。
2. 为后续模块化拆分做准备（不强制一次拆成多文件）。

预期收益：

- 降低主文件复杂度，减少重复分支。

### P2：后端公共逻辑抽取（高收益、低风险）

1. 在 `src/services/roonService.js` 新增：
   - `getSelectedZone()`
   - `getVisibleZones()`
2. `src/services/socketService.js` 改为复用上述方法，删除重复 zone 过滤逻辑。
3. `src/routes/api.js` 改为复用 `getSelectedZone()`，统一选中 zone 的获取方式。
4. 视情况补充轻量参数校验（如 `/api/images/random?count=` 上限）。

预期收益：

- 单一后端过滤逻辑来源。
- 减少行为偏差风险。

### P3：遗留实现边界梳理（中收益、中风险）

1. 明确 `app.js` 为历史版本（文档标注 / 移动到 `legacy/` / 删除其引用）。
2. 对比旧版 `app.js` 中的连接管理、订阅管理、健康监控能力，确认是否需要迁回 `src/`。

说明：

- 该阶段会涉及功能对照，风险高于纯去冗余，建议在 P0/P2 稳定后处理。

### P4：一致性与维护性修复（中收益、低风险）

1. 统一版本号来源与显示（`package.json`、Roon 扩展版本、前端版本）。
2. 修复 `KeyboardController.destroy()` 的事件解绑问题。
3. 降低未配对阶段的错误日志噪音（如 `/api/status` 返回语义优化）。

### P5：回归保护（中收益、中风险）

1. 为 `ImageService` 增加基础单元测试（文件名清洗、随机图、上限清理）。
2. 为 zone 变更处理提取可测逻辑（如 reducer）。
3. 固化手工验证清单。

## 本次执行范围（当前轮）

按顺序优先完成：

1. P0（前端去冗余）
2. P2（后端公共逻辑抽取）
3. P4（一致性与维护性修复）

P1/P3/P5 中涉及较大结构变动或测试建设的部分，将根据改动风险与时间继续推进，并在结果中明确“已完成 / 延后”。

## 验收标准

- 页面只由一套前端状态源驱动（Socket 实时事件）。
- `zone` 过滤逻辑在后端只有一处权威实现。
- 未使用脚本/代码状态明确（删除或接入）。
- 播放时显示当前封面；停止/暂停后按原逻辑切回网格。
- 封面自动保存与本地网格图接口行为保持可用。

## 本轮执行结果（已完成）

- 已新增本重构路线文档并作为执行基线。
- 已执行 P0：
  - `public/index.html` 移除 `main.js`、`NoSleep.min.js`、`fullscreen-display.js` 的运行时加载。
  - `public/js/fullscreen.js` 清理未使用变量/函数（不改功能路径）。
  - 说明：`public/js/main.js` 与 `public/js/fullscreen-display.js` 文件暂时保留为遗留代码，但不再参与页面运行。
- 已执行 P2：
  - `src/services/roonService.js` 新增 `isSelectedZone()`、`getSelectedZone()`、`getVisibleZones()`。
  - `src/services/socketService.js` 改为复用 `getVisibleZones()`，删除重复过滤逻辑。
  - `src/routes/api.js` 的 `/api/status` 改为复用 `getSelectedZone()`。
  - `src/routes/api.js` 的 `/api/images/random` 增加 `count` 取值钳制（1..64）。
- 已执行 P4：
  - 统一版本号为 `3.1.4`（`package.json`、`package-lock.json`、`public/js/app.js`）。
  - 修复 `KeyboardController.destroy()` 事件解绑无效问题（保存监听器引用后解绑）。
  - `/api/status` 在未连接 Roon Core 时改为非错误响应（返回 `{ connected: false, is_playing: false }`）。
- 已执行一小步 P1：
  - `public/js/fullscreen.js` 抽出非播放回退定时器与当前 zone 解析的公共函数，减少重复代码。

## 本轮未执行（后续）

- P3：`app.js` 遗留能力对照与迁移/退役决策。
- P5：单元测试与回归保护建设。
