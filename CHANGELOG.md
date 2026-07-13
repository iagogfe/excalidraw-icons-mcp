# Changelog

Notable changes to this project. Versions follow [SemVer](https://semver.org/).

## Unreleased

### Fixed
- Arrows/lines loaded through the canvas convert pipeline are now re-normalized (`points[0]` forced to `[0,0]`). Excalidraw requires this; without it a loaded arrow logged "Linear element is not normalized" and jumped off-screen on the first drag or select — it looked like the arrow vanished. Regression test: `npm run test:arrow-drag` (drives a real browser drag via Playwright).

## 1.0.0 — 2026-07-13

First public release. A fork of [yctimlin/mcp_excalidraw](https://github.com/yctimlin/mcp_excalidraw) rebuilt around standardized icon insertion.

### Added
- **Icon search & insertion**: `search_official_icon` + `add_image` — official AWS/Azure/GCP/OCI packs (user-supplied), bundled Kubernetes, simple-icons (CC0), Tabler (MIT), and Iconify (~200k icons, fetched on demand and cached to disk).
- **Community libraries**: `search_library_items` + `insert_library_item` (libraries.excalidraw.com).
- **Per-domain diagram conventions**: `read_diagram_guide` accepts `diagramType` (network, cloud-aws, cloud-gcp, cloud-azure, c4, erd, flowchart, sequence).
- **Auto-layout & validation**: `batch_create_elements` with `autoLayout: true`, plus `validate_layout`.
- 31 MCP tools total; live canvas with real-time WebSocket sync (from upstream).

### Changed
- Rebranded from `mcp_excalidraw` to `excalidraw-icons-mcp`.
- Dropped `winston` (replaced by a small stderr+file logger) and `mermaid` (unused; provided transitively). Updated in-range dependencies.

### Security
- Canvas server binds to `127.0.0.1` by default; path traversal guarded on all file and icon operations. See [SECURITY.md](SECURITY.md).
