import { Component, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LucideSearch, LucideX } from '@lucide/angular';
import { ApiService, SearchHit } from '../../core/services/api.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { ProjectStore } from '../../core/services/project-store.service';

/**
 * Menu Recherche : barre en haut, en bas la liste des `.md` du projet
 * dont le contenu contient le mot recherché (insensible à la casse).
 * Un clic ouvre la note en lecture dans le menu Notes.
 */
@Component({
  selector: 'app-search',
  imports: [RouterLink, LucideSearch, LucideX],
  templateUrl: './search.component.html',
  styleUrl: './search.component.css',
})
export class SearchComponent {
  readonly query = signal('');
  readonly hits = signal<SearchHit[]>([]);
  readonly searching = signal(false);
  readonly searched = signal(false);
  readonly error = signal<string | null>(null);

  private debounce: ReturnType<typeof setTimeout> | null = null;
  private requestId = 0;

  constructor(
    readonly store: ProjectStore,
    readonly i18n: I18nService,
    private api: ApiService,
    private router: Router,
  ) {}

  onInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.query.set(value);
    if (this.debounce) clearTimeout(this.debounce);
    if (!value.trim()) {
      this.hits.set([]);
      this.searched.set(false);
      this.error.set(null);
      return;
    }
    this.debounce = setTimeout(() => void this.run(value), 300);
  }

  clear(): void {
    this.query.set('');
    this.hits.set([]);
    this.searched.set(false);
    this.error.set(null);
    if (this.debounce) clearTimeout(this.debounce);
  }

  open(id: string): void {
    this.store.openNote(id);
    void this.router.navigate(['/notes']);
  }

  private async run(rawQuery: string): Promise<void> {
    const projectPath = this.store.projectPath();
    if (!projectPath || !rawQuery.trim()) return;
    const id = ++this.requestId;
    this.searching.set(true);
    this.error.set(null);
    try {
      const hits = await this.api.searchNotes(projectPath, rawQuery);
      if (id !== this.requestId) return; // réponse périmée
      this.hits.set(hits);
      this.searched.set(true);
    } catch (e) {
      if (id !== this.requestId) return;
      this.error.set(e instanceof Error ? e.message : String(e));
    } finally {
      if (id === this.requestId) this.searching.set(false);
    }
  }
}
