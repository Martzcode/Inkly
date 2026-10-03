import { Component, OnInit, signal } from '@angular/core';
import { LucideCopy, LucideMinus, LucideSquare, LucideX } from '@lucide/angular';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { I18nService } from '../../core/i18n/i18n.service';

/**
 * Barre de titre personnalisée (fenêtre `decorations: false`).
 * - Le déplacement se fait via l'attribut `data-tauri-drag-region`.
 * - Les boutons appellent l'API window de Tauri ; hors Tauri
 *   (ex. `npm start` dans un navigateur) ils sont masqués.
 */
@Component({
  selector: 'app-titlebar',
  imports: [LucideCopy, LucideMinus, LucideSquare, LucideX],
  templateUrl: './titlebar.component.html',
  styleUrl: './titlebar.component.css',
})
export class TitlebarComponent implements OnInit {
  readonly isTauri = signal(false);
  readonly isMaximized = signal(false);

  constructor(readonly i18n: I18nService) {}

  async ngOnInit(): Promise<void> {
    // Seul le runtime Tauri conditionne l'affichage des boutons.
    // L'état maximisé est chargé en best-effort : son échec ne doit
    // jamais masquer les boutons.
    if (!isTauri()) {
      return;
    }
    this.isTauri.set(true);
    try {
      this.isMaximized.set(await getCurrentWindow().isMaximized());
    } catch {
      // Permission ou IPC indisponible : on garde l'état par défaut.
    }
    try {
      await getCurrentWindow().onResized(async () => {
        try {
          this.isMaximized.set(await getCurrentWindow().isMaximized());
        } catch {
          // On conserve le dernier état connu.
        }
      });
    } catch {
      // Suivi du resize indisponible : le toggle reste fonctionnel.
    }
  }

  async minimize(): Promise<void> {
    try {
      await getCurrentWindow().minimize();
    } catch {
      // Hors Tauri : action sans effet.
    }
  }

  async toggleMaximize(): Promise<void> {
    try {
      const win = getCurrentWindow();
      await win.toggleMaximize();
      this.isMaximized.set(await win.isMaximized());
    } catch {
      // Hors Tauri : action sans effet.
    }
  }

  async close(): Promise<void> {
    try {
      await getCurrentWindow().close();
    } catch {
      // Hors Tauri : action sans effet.
    }
  }
}
