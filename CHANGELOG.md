# Changelog

Notable changes to this project. Versions follow [SemVer](https://semver.org/).

## 2.0.0 — 2026-08-03

### Changed
- **Migrated to MCP SDK v2 (spec 2026-07-28)** — the breaking change behind the major. Tool registration, transport and capability negotiation follow the new SDK; clients pinned to SDK v1 behavior need to update.

### Added
- Icon search quality: acronym/abbreviation expansion in queries, word-normalized scoring with noise filtering, OCI and blob-storage aliases, Kubernetes pack indexed under full resource names.
- Icon-search eval harness (offline gold set, recall@3) and an end-to-end tool-call latency benchmark (`npm run test:*`).
- Security CI: Gitleaks, osv-scanner, Semgrep and CodeQL (`security.yml`), OpenSSF Scorecard, Hadolint + Trivy on the images, all actions pinned by full SHA.

### Fixed
- Frontend merges canonical server state on `initial_elements` re-broadcast instead of staying divergent forever.
- Arrows/lines loaded through the canvas convert pipeline are now re-normalized (`points[0]` forced to `[0,0]`). Excalidraw requires this; without it a loaded arrow logged "Linear element is not normalized" and jumped off-screen on the first drag or select — it looked like the arrow vanished. Regression test: `npm run test:arrow-drag` (drives a real browser drag via Playwright).
- Vendor icon packs excluded from the npm tarball.
- `nanoid` (transitive, via mermaid-to-excalidraw) bumped to 5; verified in browser.
- Docker smoke test resolved the canvas image by full SHA while `metadata-action` published the short one — image sha tags now use `format=long`.

### Performance
- Iconify network fallback only fires when no bundled source matches; domain-first index scan with early reject; normalized names precomputed at index build.
- Logger streams to a file sink instead of per-line `appendFileSync`; Express `etag`/`x-powered-by` disabled on the local tool API.

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
