# excalidraw-icons-mcp

MCP server for Excalidraw with vendor-icon search (AWS/Azure/GCP/OCI/Kubernetes),
plus a canvas server the MCP talks to over HTTP. TypeScript, Node >= 20, npm.
Public repository, MIT.

- Install: `npm ci`
- Type check: `npm run type-check`
- Build: `npm run build` (frontend via Vite, server via tsc)
- Run locally: `npm run canvas` then point an MCP client at `dist/index.js`
- Tests: the `test:*` scripts are standalone probes (`scripts/*.mjs`), not a
  suite. There is no `npm test` yet — adding one is the single highest-value
  change to this repo's CI.
- Linter: none. The style gate is the only automated style check.

Distribution is by container image (`ghcr.io/iagogfe/excalidraw-icons-mcp` and
`-canvas`) and by cloning. The npm package name is reserved in `package.json`
but has never been published.

## CI

Four workflows, all self-contained. A public repository cannot call a reusable
workflow from a private one, so nothing here is shared with `iagogfe/workflows`
— the style gate is a copy under `.github/actions/gate-estilo`, and a fix there
has to be carried across by hand.

- `ci.yml` — build matrix (Node 20/22/24) and the style gate
- `security.yml` — Gitleaks, osv-scanner, Semgrep, CodeQL
- `docker.yml` — Hadolint, build, Trivy, publish to ghcr.io
- `scorecard.yml` — OpenSSF Scorecard (public repositories only)

Actions are pinned by full SHA with the version in a trailing comment; tags are
mutable and were the vector of the tj-actions and trivy-action attacks.
Dependabot bumps both together.

## Conventions

Rules tagged **[gate]** are measured on every PR by
`.github/actions/gate-estilo`, which compares this branch against the base and
fails if the count got worse. Old debt never blocks — only what the PR adds.
Where the gate threshold differs from the rule, the rule is the target and the
threshold is the point where you get interrupted. To exclude vendored or
generated code, list the globs in a `.gate-estilo-ignore` file at the root;
this repo does not need one today.

On a pull request from a fork the token is read-only, so the gate cannot post
its comment. It still runs and still fails — the table goes to the job summary.

Everything untagged is checked by nobody. It exists to shape the code as it is
written, and no CI job will remind you of it — that covers most of the
Comments, Tests, Dependencies and Structure sections below. Whatever this
repo's own linter adds on top is stated in the header above, and it is not the
same in every project.

## Code style

- Functions: 4-20 lines. Split if longer. **[gate]** — counted above 60 NLOC.
  The gate measures NLOC, not physical lines, so comments never make a
  function "long".
- Files: under 500 lines. Split by responsibility. **[gate]**
- One thing per function, one responsibility per module (SRP).
- Names: specific and unique. Avoid `data`, `handler`, `Manager`. **[gate]** —
  those three names are counted where they are declared, not where used.
  Prefer names that return <5 grep hits in the codebase.
- Types: explicit. No `any`, no `Dict`, no untyped functions. **[gate]** —
  the gate counts lines containing `any`, `@ts-ignore` or `@ts-expect-error`.
  Lines, not occurrences: `function f(x: any): any` counts once.
- No code duplication. Extract shared logic into a function/module.
  **[gate, informational]** — reported, never blocking: near-identical and
  identical blocks are hard to tell apart, and the wrong abstraction costs
  more than the duplication.
- Early returns over nested ifs. Max 2 levels of indentation. **[gate]** —
  approximated by cyclomatic complexity above 10, which is the closest thing
  a parser can measure.
- Exception messages must include the offending value and expected shape.

## Comments

- Keep your own comments. Don't strip them on refactor — they carry
  intent and provenance.
- Write WHY, not WHAT. Skip `// increment counter` above `i++`.
- Docstrings on public functions: intent + one usage example.
- Reference issue numbers / commit SHAs when a line exists because
  of a specific bug or upstream constraint.

## Tests

- Tests run with a single command: see the header of this file.
- Every new function gets a test. Bug fixes get a regression test.
- Mock external I/O (API, DB, filesystem) with named fake classes,
  not inline stubs.
- Tests must be F.I.R.S.T: fast, independent, repeatable,
  self-validating, timely.

## Dependencies

- Inject dependencies through constructor/parameter, not global/import.
- Wrap third-party libs behind a thin interface owned by this project.

## Structure

- Follow the framework's convention (Rails, Django, Next.js, etc.).
- Prefer small focused modules over god files.
- Predictable paths: controller/model/view, src/lib/test, etc.

## Formatting

- Use the language default formatter (`cargo fmt`, `gofmt`, `prettier`,
  `black`, `rubocop -A`). Don't discuss style beyond that.

## Logging

- Structured JSON when logging for debugging / observability.
- Plain text only for user-facing CLI output. **[gate]** — `console.log`
  outside the CLI directories is counted.
