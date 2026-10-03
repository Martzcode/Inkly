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

export interface CanvasEdge {
  id: string;
  from: string;
  to: string;
  directed: boolean;
}

export interface CanvasDoc {
  version: number;
  nodes: Record<string, NodePosition>;
  edges: CanvasEdge[];
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
}
