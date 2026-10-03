import { Component, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LucideFolderOpen } from '@lucide/angular';
import { open } from '@tauri-apps/plugin-dialog';
import { ProjectStore } from '../../core/services/project-store.service';

/**
 * Page d'accueil : message de bienvenue + ouverture d'un projet.
 * `openFolder()` ouvre l'explorateur natif, charge les `.md` puis
 * navigue vers `/board` (canvas + liaisons).
 */
@Component({
  selector: 'app-home',
  imports: [RouterLink, LucideFolderOpen],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
})
export class HomeComponent {
  readonly opening = signal(false);
  readonly error = signal<string | null>(null);

  constructor(
    readonly store: ProjectStore,
    private router: Router,
  ) {}

  async openFolder(): Promise<void> {
    if (this.opening()) return;
    this.opening.set(true);
    this.error.set(null);
    try {
      const picked = await open({ directory: true, multiple: false });
      if (!picked) return; // annulé par l'utilisateur
      const projectPath = Array.isArray(picked) ? picked[0] : picked;
      if (!projectPath) return;
      await this.store.openProject(projectPath);
      await this.router.navigate(['/board']);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : String(e));
    } finally {
      this.opening.set(false);
    }
  }

  async closeProject(): Promise<void> {
    try {
      if (this.store.dirty()) await this.store.save();
    } finally {
      this.store.close();
    }
  }
}
