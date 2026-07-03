export type ExcalidrawElementType = 'rectangle' | 'ellipse' | 'diamond' | 'arrow' | 'text' | 'line' | 'freedraw' | 'image';

// Excalidraw element types
export const EXCALIDRAW_ELEMENT_TYPES: Record<string, ExcalidrawElementType> = {
  RECTANGLE: 'rectangle',
  ELLIPSE: 'ellipse',
  DIAMOND: 'diamond',
  ARROW: 'arrow',
  TEXT: 'text',
  FREEDRAW: 'freedraw',
  LINE: 'line',
  IMAGE: 'image'
} as const;

// Server-side element with metadata
export interface ServerElement {
  id: string;
  type: ExcalidrawElementType;
  x: number;
  y: number;
  width?: number;
  height?: number;
  angle?: number;
  strokeColor?: string;
  backgroundColor?: string;
  fillStyle?: string;
  strokeWidth?: number;
  strokeStyle?: string;
  roughness?: number;
  opacity?: number;
  groupIds?: string[];
  frameId?: string | null;
  roundness?: {
    type: number;
    value?: number;
  } | null;
  seed?: number;
  versionNonce?: number;
  isDeleted?: boolean;
  locked?: boolean;
  link?: string | null;
  customData?: Record<string, any> | null;
  boundElements?: readonly { id: string; type: 'text' | 'arrow' }[] | null;
  updated?: number;
  containerId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  version?: number;
  syncedAt?: string;
  source?: string;
  syncTimestamp?: string;
  text?: string;
  originalText?: string;
  fontSize?: number;
  fontFamily?: string | number;
  label?: {
    text: string;
  };
  points?: any;
  // Arrow element binding: connect arrows to shapes by element ID
  start?: { id: string };
  end?: { id: string };
}

// WebSocket message types
export interface WebSocketMessage {
  type: WebSocketMessageType;
  [key: string]: any;
}

export type WebSocketMessageType =
  | 'initial_elements'
  | 'element_created'
  | 'element_updated'
  | 'element_deleted'
  | 'elements_batch_created'
  | 'elements_synced'
  | 'sync_status'
  | 'mermaid_convert'
  | 'canvas_cleared'
  | 'export_image_request'
  | 'set_viewport'
  | 'files_added'
  | 'file_deleted';

export interface InitialElementsMessage extends WebSocketMessage {
  type: 'initial_elements';
  elements: ServerElement[];
}

export interface ElementCreatedMessage extends WebSocketMessage {
  type: 'element_created';
  element: ServerElement;
}

export interface ElementUpdatedMessage extends WebSocketMessage {
  type: 'element_updated';
  element: ServerElement;
}

export interface ElementDeletedMessage extends WebSocketMessage {
  type: 'element_deleted';
  elementId: string;
}

export interface BatchCreatedMessage extends WebSocketMessage {
  type: 'elements_batch_created';
  elements: ServerElement[];
}

export interface SyncStatusMessage extends WebSocketMessage {
  type: 'sync_status';
  elementCount: number;
  timestamp: string;
}

export interface MermaidConvertMessage extends WebSocketMessage {
  type: 'mermaid_convert';
  mermaidDiagram: string;
  config?: MermaidConfig;
  timestamp: string;
}

// Mermaid conversion types
export interface MermaidConfig {
  startOnLoad?: boolean;
  flowchart?: {
    curve?: 'linear' | 'basis';
  };
  themeVariables?: {
    fontSize?: string;
  };
  maxEdges?: number;
  maxTextSize?: number;
}

// Snapshot types
export interface Snapshot {
  name: string;
  elements: ServerElement[];
  createdAt: string;
}

// In-memory storage for Excalidraw elements
export const elements = new Map<string, ServerElement>();

// In-memory storage for snapshots
export const snapshots = new Map<string, Snapshot>();

// In-memory file storage for image elements (Excalidraw BinaryFiles)
export interface ExcalidrawFile {
  id: string;
  dataURL: string;
  mimeType: string;
  created: number;
}
export const files = new Map<string, ExcalidrawFile>();

// Helper function to generate unique IDs
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

// Normalize fontFamily from string names to numeric values that Excalidraw expects
// Excalidraw uses: 1 = Virgil (handwritten), 2 = Helvetica (sans-serif), 3 = Cascadia (monospace)
// 5 = Excalifont, 6 = Nunito, 7 = Lilita One, 8 = Comic Shanns
export function normalizeFontFamily(fontFamily: string | number | undefined): number | undefined {
  if (fontFamily === undefined) return undefined;
  if (typeof fontFamily === 'number') return fontFamily;
  const map: Record<string, number> = {
    'virgil': 1, 'hand': 1, 'handwritten': 1,
    'helvetica': 2, 'sans': 2, 'sans-serif': 2,
    'cascadia': 3, 'mono': 3, 'monospace': 3,
    'excalifont': 5,
    'nunito': 6,
    'lilita': 7, 'lilita one': 7,
    'comic shanns': 8, 'comic': 8,
    '1': 1, '2': 2, '3': 3, '5': 5, '6': 6, '7': 7, '8': 8,
  };
  return map[fontFamily.toLowerCase()];
}
