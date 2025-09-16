# Repository Guidelines

## Project Structure & Module Organization
Core runtime code lives in `app.js`, which boots the Express server, Roon API bindings, and Socket.IO. Shared helpers are in `utils/`, notably `utils/imageUtils.js`. Static client assets sit under `public/` (`js/`, `css/`, `img/`, and `favicons/`), while user-supplied artwork and exports belong in `images/`. Environment defaults and overrides are read from `config/default.json` and optional developer-specific `config/local.json`.

## Build, Test, and Development Commands
Run `npm install` once to hydrate dependencies. Start the integration server with `npm start` (equivalent to `node app.js`), then visit the configured port (defaults to `http://localhost:3666`). Inspect available CLI switches via `node app.js --help`. Use `docker-compose up` if you prefer the containerized runtime defined in `docker-compose.yml`.

## Coding Style & Naming Conventions
Maintain Node 6 compatible JavaScript: favor `const`/`let` but avoid syntax needing transpilers. Files use 2-space indentation and double quotes for server-side strings; browser scripts in `public/js/` follow camelCase functions and kebab-case filenames. Keep modules self-contained and export via `module.exports`. Static assets in `public/img/` should be kebab-case without spaces.

## Testing Guidelines
The project currently relies on manual verification. After changes, run `npm start` and confirm album browsing, fullscreen toggling, and image retrieval pathways. When altering Roon API interactions or socket events, monitor server logs for warnings and test against a Roon core with representative zones. Add lightweight telemetry or assertions where feasible to guard new logic.

## Commit & Pull Request Guidelines
Recent history mixes `feat:`-prefixed Conventional Commits (`feat: 优化网格显示的图片翻转效果`) with terse Mandarin summaries. Prefer English Conventional Commit headers (`feat:`, `fix:`, `chore:`) followed by concise intent. PRs should describe the user impact, list manual verification steps, and attach screenshots or GIFs when modifying UI in `public/`. Reference related issues and note any configuration changes needed for reviewers.

## Configuration & Asset Tips
Copy `config/local.json.EXAMPLE` to `config/local.json` for workspace-specific overrides (ports, image scaling). Do not commit personal API tokens. Place large image batches in `images/` and keep backups outside the repo; `images_backup/` is ignored for this reason.
