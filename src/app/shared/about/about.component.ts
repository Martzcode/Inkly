import { Component, HostListener, output } from '@angular/core';
import { LucideX } from '@lucide/angular';
import { openUrl } from '@tauri-apps/plugin-opener';
import { I18nService } from '../../core/i18n/i18n.service';

/**
 * Fenêtre « À propos » d'Inkly : brève description + liens externes.
 * Les liens s'ouvrent dans le navigateur par défaut via le plugin
 * `opener` (fallback `window.open` hors Tauri, ex. `npm start`).
 */
@Component({
  selector: 'app-about',
  imports: [LucideX],
  templateUrl: './about.component.html',
  styleUrl: './about.component.css',
})
export class AboutComponent {
  readonly closed = output<void>();

  readonly repoUrl = 'https://github.com/Martzcode/Inkly';
  readonly authorUrl = 'https://github.com/Martzcode';
  readonly authorName = 'Martzcode';

  constructor(readonly i18n: I18nService) {}

  @HostListener('keydown.escape')
  onEscape(): void {
    this.close();
  }

  close(): void {
    this.closed.emit();
  }

  /** Ouvre une URL externe dans le navigateur par défaut. */
  async openExternal(url: string): Promise<void> {
    try {
      await openUrl(url);
    } catch {
      window.open(url, '_blank', 'noopener');
    }
  }
}
