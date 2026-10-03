import { Component, effect, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { marked } from 'marked';
import { ApiService } from '../../core/services/api.service';
import { ProjectStore } from '../../core/services/project-store.service';

/**
 * Menu Notes : lecture seule (display mode) d'un fichier Markdown
 * du projet ouvert. Le Markdown est rendu en HTML (titres, gras,
 * listes, code, liens…) — les marqueurs `**` ne sont jamais affichés bruts.
 * Ouverture via double-clic sur une icône du canvas.
 */
@Component({
  selector: 'app-notes',
  imports: [RouterLink],
  templateUrl: './notes.component.html',
  styleUrl: './notes.component.css',
})
export class NotesComponent {
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly html = signal('');

  constructor(
    readonly store: ProjectStore,
    private api: ApiService,
  ) {
    marked.setOptions({ breaks: true });
    effect(() => {
      const projectPath = this.store.projectPath();
      const fileId = this.store.activeNoteId();
      if (!projectPath || !fileId) {
        this.html.set('');
        return;
      }
      void this.load(projectPath, fileId);
    });
  }

  choose(id: string): void {
    this.store.openNote(id);
  }

  private async load(projectPath: string, fileId: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const raw = await this.api.readMarkdownFile(projectPath, fileId);
      const rendered = (await marked.parse(raw)) as string;
      this.html.set(rendered);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : String(e));
      this.html.set('');
    } finally {
      this.loading.set(false);
    }
  }
}
