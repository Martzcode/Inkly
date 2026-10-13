import { Injectable } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';

export interface AppInfo {
  name: string;
  version: string;
  identifier: string;
}

export interface ProjectFile {
  id: string;
  name: string;
}

export interface NodePosition {
  x: number;
  y: number;
}

/** Style de liaison : 0 = courbe simple, 1 = une pointe, 2 = deux pointes. */
export type EdgeStyle = 0 | 1 | 2;

export interface CanvasEdge {
  id: string;
  from: string;
  to: string;
  directed: boolean;
  /** Deux pointes (sans effet si `directed` est faux). Absent des anciens canvas (= simple). */
  doubleHeaded?: boolean;
}

/** Dérive le style d'une liaison (compatible anciens canvas sans `doubleHeaded`). */
export function edgeStyle(edge: Pick<CanvasEdge, 'directed' | 'doubleHeaded'>): EdgeStyle {
  if (!edge.directed) return 0;
  return edge.doubleHeaded ? 2 : 1;
}

export interface CanvasDoc {
  version: number;
  nodes: Record<string, NodePosition>;
  edges: CanvasEdge[];
  favorites: string[];
}

export interface SearchHit {
  id: string;
  name: string;
  matchCount: number;
  excerpt: string;
}

/**
 * Couche d'accès au backend Rust (Tauri commands).
 * Toute invocation `invoke()` doit passer par ici — jamais
 * directement dans les composants.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  greet(name: string): Promise<string> {
    return invoke<string>('greet', { name });
  }

  appInfo(): Promise<AppInfo> {
    return invoke<AppInfo>('app_info');
  }

  listMarkdownFiles(projectPath: string): Promise<ProjectFile[]> {
    return invoke<ProjectFile[]>('list_markdown_files', { projectPath });
  }

  loadCanvas(projectPath: string): Promise<CanvasDoc> {
    return invoke<CanvasDoc>('load_canvas', { projectPath });
  }

  saveCanvas(projectPath: string, canvas: CanvasDoc): Promise<void> {
    return invoke<void>('save_canvas', { projectPath, canvas });
  }

  readMarkdownFile(projectPath: string, fileId: string): Promise<string> {
    return invoke<string>('read_markdown_file', { projectPath, fileId });
  }

  writeMarkdownFile(projectPath: string, fileId: string, content: string): Promise<void> {
    return invoke<void>('write_markdown_file', { projectPath, fileId, content });
  }

  renameMarkdownFile(projectPath: string, fileId: string, newId: string): Promise<string> {
    return invoke<string>('rename_markdown_file', { projectPath, fileId, newId });
  }

  searchNotes(projectPath: string, query: string): Promise<SearchHit[]> {
    return invoke<SearchHit[]>('search_notes', { projectPath, query });
  }
}
