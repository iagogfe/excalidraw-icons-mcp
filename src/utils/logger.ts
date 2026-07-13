import * as path from 'path';
import * as fs from 'fs';
import { homedir, tmpdir } from 'os';

/**
 * Choose a platform-compatible default log path. MCP servers are launched in
 * the caller's working directory, so a relative path would scatter log files
 * across unrelated project and cloud-synced folders.
 *
 * LOG_FILE_PATH can still override this default.
 */
function defaultLogPath(): string {
  if (process.platform === 'darwin') {
    return path.join(homedir(), 'Library', 'Logs', 'excalidraw-mcp.log');
  }
  if (process.platform === 'win32') {
    const base = process.env.LOCALAPPDATA || path.join(homedir(), 'AppData', 'Local');
    return path.join(base, 'Excalidraw-MCP', 'excalidraw.log');
  }
  // Linux and other POSIX platforms: follow the XDG state convention.
  const xdgState = process.env.XDG_STATE_HOME || path.join(homedir(), '.local', 'state');
  return path.join(xdgState, 'excalidraw-mcp', 'excalidraw.log');
}

const LOG_FILE_PATH = process.env.LOG_FILE_PATH || defaultLogPath();

function ensureWritableLogFile(filePath: string): string {
  const logDir = path.dirname(filePath);
  fs.mkdirSync(logDir, { recursive: true });
  fs.accessSync(logDir, fs.constants.W_OK);
  return filePath;
}

function resolveLogFilePath(): string {
  try {
    return ensureWritableLogFile(LOG_FILE_PATH);
  } catch (error) {
    if (process.env.LOG_FILE_PATH) {
      throw error;
    }
  }

  return ensureWritableLogFile(path.join(tmpdir(), 'excalidraw-mcp.log'));
}

const RESOLVED_LOG_FILE_PATH = resolveLogFilePath();

// ponytail: replaced winston (dep + 40-line config) with a stderr+file shim.
// Same routing: all levels to the log file, warn+error also to stderr.
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 } as const;
type Level = keyof typeof LEVELS;
const MAX_LEVEL = LEVELS[(process.env.LOG_LEVEL as Level) in LEVELS ? (process.env.LOG_LEVEL as Level) : 'info'];

function log(level: Level, message: string, meta?: unknown): void {
  if (LEVELS[level] > MAX_LEVEL) return;
  const ts = new Date().toISOString().replace('T', ' ').replace('Z', '');
  const extra = meta && typeof meta === 'object' && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  const line = `${ts} [${level}] ${message}${extra}\n`;
  try { fs.appendFileSync(RESOLVED_LOG_FILE_PATH, line); } catch { /* file sink is best-effort */ }
  if (level === 'warn' || level === 'error') process.stderr.write(line);
}

const logger = {
  error: (m: string, meta?: unknown) => log('error', m, meta),
  warn: (m: string, meta?: unknown) => log('warn', m, meta),
  info: (m: string, meta?: unknown) => log('info', m, meta),
  debug: (m: string, meta?: unknown) => log('debug', m, meta),
};

export default logger;
