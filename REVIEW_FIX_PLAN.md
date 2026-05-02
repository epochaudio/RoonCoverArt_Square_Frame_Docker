# Code Review Fix Plan

This document tracks the repository-wide review findings and the planned fixes.

## Scope

- Server entrypoint, routes, services, and Socket.IO control path
- Frontend image loading and transport-control usage
- Docker and manual install documentation
- Runtime configuration, local persistence, and dependency security

## Fix Checklist

- [x] Remove real `config.json` from version control and add a safe example file.
- [x] Align manual install documentation with the maintained `src/server.js` entrypoint.
- [x] Restrict browser cross-origin access to the HTTP and Socket.IO control surfaces.
- [x] Harden Socket.IO transport, volume, and settings handlers with input validation and command allowlists.
- [x] Encode saved image filenames safely for browser URLs.
- [x] Make `artwork.format` affect image fetch options and saved file extensions.
- [x] Track and clean up Roon zone subscriptions during disconnects/re-pairing.
- [x] Upgrade vulnerable production dependencies and refresh `package-lock.json`.
- [x] Re-run syntax, startup, and audit checks.

## Residual Risk

- `npm audit --omit=dev` still reports `node-roon-api -> ip@1.1.5` high-severity advisories with no fix available from npm. This dependency is pinned through the Roon API package and should be revisited when Roon publishes an updated package or when the integration is replaced.

## Docker And Compose Follow-Up

- [x] Make the default Compose file run the published image without an implicit local build.
- [x] Add a separate `docker-compose.build.yml` override for local image builds.
- [x] Preserve image defaults by mounting only `config/local.json` instead of the whole `config/` directory.
- [x] Add Compose and image health checks for `/api/pair`.
- [x] Document direct image usage, local builds, and Compose environment variables.

## Notes

- `config.json` is a local runtime persistence file for Roon pairing state and must not be committed.
- The legacy `app.js` entrypoint is not aligned with the current modular `src/server.js` implementation.
- The app is commonly deployed on a trusted LAN with host networking, but exposed control endpoints still need validation.
