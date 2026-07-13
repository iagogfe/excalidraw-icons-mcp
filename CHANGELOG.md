# Changelog

Notable changes to this project. Versions follow [SemVer](https://semver.org/).

## Unreleased

- Per-domain diagram conventions in `read_diagram_guide` via `diagramType` (network, cloud-aws, cloud-gcp, cloud-azure, c4, erd, flowchart, sequence)
- Support for user-supplied official vendor icon packs under `icons/{aws,azure,gcp,oracle}` (gitignored; see README)

## 1.0.x — excalidraw-icons-mcp

- Rebrand from mcp_excalidraw fork to excalidraw-icons-mcp
- Standardized icon libraries: `search_official_icon` + `add_image` (bundled Kubernetes, simple-icons, Tabler, Iconify on-demand with disk cache)
- Community library support: `search_library_items` + `insert_library_item` (libraries.excalidraw.com)
- Auto-layout for batch creation (`autoLayout: true`) and `validate_layout`
- Performance: single-batch creation flows, dead-code cleanup, dependency pruning

## Upstream (yctimlin/mcp_excalidraw v2.0)

- 26 MCP tools: element CRUD, layout, scene awareness (`describe_scene`, `get_canvas_screenshot`), file I/O, snapshots, Mermaid conversion, shareable URLs, viewport control
- Live canvas with real-time WebSocket sync
