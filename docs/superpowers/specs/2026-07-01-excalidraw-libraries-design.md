# Excalidraw Libraries Support — Design

**Date:** 2026-07-01
**Status:** Approved (brainstorming complete)

## Goal

Let the AI use community Excalidraw libraries (libraries.excalidraw.com) when drawing diagrams, so that e.g. an AWS database is rendered with the official RDS icon instead of a generic rectangle.

## Decisions (from brainstorming)

| Question | Decision |
|----------|----------|
| Library source | Hybrid: fetch from libraries.excalidraw.com on demand + local disk cache |
| Scope | All 230 manifest libraries searchable; curated set highlighted for the AI |
| Tool surface | 2 tools: `search_library_items` + `insert_library_item` |
| Architecture | All logic in the MCP server (`src/libraries.ts` + tools in `src/index.ts`); canvas server untouched |

## Data layer (`src/libraries.ts`)

- **Manifest**: `GET https://libraries.excalidraw.com/libraries.json` (~197KB, 230 libs) and `stats.json` (download counts). Cached on disk at `~/.cache/mcp-excalidraw/libraries/` (override: `EXCALIDRAW_LIBRARY_CACHE_DIR`). TTL 7 days; stale cache is used when offline.
- **Library files**: `GET https://libraries.excalidraw.com/libraries/<source>` (`.excalidrawlib` v2: `{ libraryItems: [{ id, name, elements[] }] }`). Downloaded on first search that needs them; cached indefinitely, invalidated when the manifest `version` for that library changes.
- **Curated set** (constant, keyed by domain keywords): aws-architecture-icons (aws), azure-cloud-services (azure), gcp-icons (gcp), system-design (system design, microservice), software-architecture (architecture), UML-ER-library (uml, er, entity), network-topology-icons (network), dev_ops (devops, ci).

## Tools

### `search_library_items`
- **Input**: `{ query: string, limit?: number (default 10) }`
- **Behavior**:
  1. Match query against manifest (library name/description), ranked by total downloads.
  2. If the query matches a curated domain keyword, or a matched library is already cached: download/load the library and match against **item names** (e.g. "Lambda", "RDS").
- **Output**: list of `{ ref: "<source>#<itemIndex>", itemName, libraryName, downloads, elementCount }` plus a hint line telling the AI to call `insert_library_item` with a `ref`.

### `insert_library_item`
- **Input**: `{ ref: string, x: number, y: number, targetWidth?: number }`
- **Behavior**: load the library from cache/network, instantiate the item (below), sync to canvas via the existing `batchCreateElementsOnCanvas`.
- **Output**: created element ids + bounding box. The response names one "anchor" element id (the largest shape in the item) so the AI can bind arrows to it via `startElementId`/`endElementId`, and can use the bbox to position labels nearby.

## Instantiation rules

1. Deep-clone `item.elements`; translate so the item's bounding-box origin lands at `(x, y)`.
2. If `targetWidth` given, scale uniformly (x/y/width/height/fontSize/points).
3. Regenerate all element ids (`generateId`); remap `groupIds` old→new and add one extra shared groupId wrapping the whole item so it moves as a unit.
4. Remap internal references by the new ids: `boundElements[].id`, `containerId`, `startBinding.elementId`, `endBinding.elementId`.
5. Elements of `type: "image"` are NOT supported in v1 — return a clear error ("item uses embedded images; pick a vector item"). Top technical libraries are vector-only.

## Instructions update

Append to `MCP_INSTRUCTIONS`:

> For cloud infrastructure (AWS/Azure/GCP), UML, network, or system-design diagrams: call `search_library_items` before drawing generic shapes, and insert official icons with `insert_library_item` (e.g. an AWS database → the RDS icon).

## Error handling

- Network down + no cache → actionable error (check network / retry); other MCP tools unaffected.
- Invalid `ref` or library missing from manifest → error suggesting a new search.
- Malformed library JSON → skip that library, log a warning.

## Testing

- **Unit** (no network in CI): instantiation against a local `.excalidrawlib` fixture — unique ids, remapped groups, correct scaling, bbox at target position.
- **Stdio**: `tools/list` includes both tools; manual end-to-end `search` → `insert` against a live canvas.
- `type-check` + `build:server` clean.

## Out of scope (v1)

- Items with embedded images (`type: image` + files).
- Private libraries; publishing libraries; frontend UI for library browsing.

## Deviation (implementation)

"Canvas server untouched" was relaxed by one minimal change: `CreateElementSchema`
in `src/server.ts` gained `.passthrough()`. The zod default (strip) removed
library-element props (`angle`, `containerId`, `textAlign`, …), breaking icon
fidelity. No endpoint or behavior changes beyond preserving unknown props.
