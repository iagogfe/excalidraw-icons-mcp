# Security Policy

## Supported Versions

Only the latest release receives security fixes.

| Version | Supported |
|---------|-----------|
| latest  | ✅ |
| older   | ❌ |

## Security Posture

- The canvas server binds to `127.0.0.1` by default and has **no built-in authentication**. If you expose it (`HOST=0.0.0.0`, Docker), put network-level access controls in front of it.
- The MCP server runs over stdio and only talks to the canvas server URL you configure (`EXPRESS_SERVER_URL`).
- `export_to_excalidraw_url` uploads an encrypted copy of your scene to excalidraw.com — anyone with the generated link can view it.
- Vendor icon packs (`icons/aws`, `icons/azure`, `icons/gcp`, `icons/oracle`) are user-supplied and never redistributed by this repo.

## Reporting a Vulnerability

Use GitHub's [private vulnerability reporting](https://github.com/iagogfe/excalidraw-icons-mcp/security/advisories/new) for this repository. Please do not open public issues for security problems.

You can expect an initial response within 7 days.
