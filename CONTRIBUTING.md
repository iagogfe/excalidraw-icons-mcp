# Contributing

Thanks for your interest! This project is a canvas server + MCP server for AI-driven Excalidraw diagrams.

## Repo structure

```
src/index.ts            MCP server (stdio): tools, schemas, handlers
src/server.ts           Canvas server: Express + WebSocket + REST API
src/officialIcons.ts    Icon search across local packs / simple-icons / Tabler / Iconify
src/diagramConventions.ts  Per-domain conventions served by read_diagram_guide
src/libraries.ts        Community libraries.excalidraw.com integration
src/layout.ts           Auto-layout + layout validation
frontend/               Excalidraw web UI (Vite + React)
skills/excalidraw-skill Portable agent skill (MCP + REST fallback)
scripts/                Self-checks (run via npm run test:*)
icons/                  Icon packs; vendor packs (aws/azure/gcp/oracle) are user-supplied and gitignored
```

## Local setup

```bash
npm ci
npm run build          # frontend + server
npm run canvas         # canvas server on :3000
node dist/index.js     # MCP server (stdio), EXPRESS_SERVER_URL=http://127.0.0.1:3000
```

## Tests

```bash
npm run type-check
npm run test:bind          # local bind regression
npm run test:libraries     # library search/insert
npm run test:conventions   # diagram conventions integrity
```

## Vendor icon packs

Official AWS/Azure/GCP/OCI packs require accepting each vendor's license, so they are not bundled. Download them yourself and drop the SVGs under `icons/<vendor>/` — see README. Never commit them.

## Pull requests

- Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`...).
- One logical change per PR; include a self-check (script or `npm run test:*`) for non-trivial logic.
- Run `npm run type-check` before pushing.
