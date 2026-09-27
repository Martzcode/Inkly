import { Injectable } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';

export interface AppInfo {
  name: string;
  version: string;
  identifier: string;
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
}
