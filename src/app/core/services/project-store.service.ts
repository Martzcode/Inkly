import { Injectable, computed, signal } from '@angular/core';
import { ApiService, CanvasDoc, CanvasEdge, ProjectFile } from './api.service';

export interface BoardNode extends ProjectFile {
  x: number;
  y: number;
}

/**
 * État du projet ouvert : dossier + fichiers md + graphe canvas.
 * Le canvas est persisté dans `<projet>/.inkly/canvas.json` via le backend.
 */
@Injectable({ providedIn: 'root' })
export class ProjectStore {
  readonly projectPath = signal<string | null>(null);
  readonly files = signal<ProjectFile[]>([]);
  readonly positions = signal<Record<string, { x: number; y: number }>>({});
  readonly edges = signal<CanvasEdge[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly dirty = signal(false);
  /** Note ouverte en lecture dans le menu Notes (double-clic canvas). */
  readonly activeNoteId = signal<string | null>(null);
  /** Favoris du projet ouvert (persistés dans `.inkly/canvas.json`). */
  readonly favorites = signal<string[]>([]);

  readonly isFavorite = (id: string): boolean => this.favorites().includes(id);

  readonly favoriteFiles = computed<ProjectFile[]>(() => {
    const fav = new Set(this.favorites());
    return this.files().filter((f) => fav.has(f.id));
  });

  readonly nodes = computed<BoardNode[]>(() => {
    const pos = this.positions();
    return this.files().map((f, i) => ({
      ...f,
      x: pos[f.id]?.x ?? 80 + (i % 6) * 140,
      y: pos[f.id]?.y ?? 80 + Math.floor(i / 6) * 140,
    }));
  });

  constructor(private api: ApiService) {}

  async openProject(projectPath: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [files, canvas] = await Promise.all([
        this.api.listMarkdownFiles(projectPath),
        this.api.loadCanvas(projectPath).catch(
          () =>
            ({
              version: 1,
              nodes: {},
              edges: [],
              favorites: [],
            }) as CanvasDoc,
        ),
      ]);
      this.projectPath.set(projectPath);
      this.files.set(files);
      this.positions.set(canvas.nodes ?? {});
      this.edges.set(canvas.edges ?? []);
      // Ne garde que les favoris qui existent encore dans le dossier.
      const known = new Set(files.map((f) => f.id));
      this.favorites.set((canvas.favorites ?? []).filter((id) => known.has(id)));
      this.dirty.set(false);
      if (!files.some((f) => f.id === this.activeNoteId())) {
        this.activeNoteId.set(null);
      }
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      this.loading.set(false);
    }
  }

  setNodePosition(id: string, x: number, y: number): void {
    this.positions.update((p) => ({ ...p, [id]: { x, y } }));
    this.dirty.set(true);
  }

  addEdge(from: string, to: string, directed: boolean): CanvasEdge | null {
    if (from === to) return null;
    const exists = this.edges().some((e) =>
      e.directed
        ? e.from === from && e.to === to && e.directed === directed
        : (e.from === from && e.to === to) || (e.from === to && e.to === from),
    );
    if (exists) return null;
    const edge: CanvasEdge = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      from,
      to,
      directed,
    };
    this.edges.update((list) => [...list, edge]);
    this.dirty.set(true);
    return edge;
  }

  removeEdge(id: string): void {
    this.edges.update((list) => list.filter((e) => e.id !== id));
    this.dirty.set(true);
  }

  toggleEdgeDirection(id: string): void {
    this.edges.update((list) =>
      list.map((e) => (e.id === id ? { ...e, directed: !e.directed } : e)),
    );
    this.dirty.set(true);
  }

  async save(): Promise<void> {
    const path = this.projectPath();
    if (!path) return;
    const canvas: CanvasDoc = {
      version: 1,
      nodes: this.positions(),
      edges: this.edges(),
      favorites: this.favorites(),
    };
    // Inclut les positions courantes des nœuds (même non déplacés).
    for (const n of this.nodes()) {
      if (!canvas.nodes[n.id]) canvas.nodes[n.id] = { x: n.x, y: n.y };
    }
    await this.api.saveCanvas(path, canvas);
    this.dirty.set(false);
  }

  close(): void {
    this.projectPath.set(null);
    this.files.set([]);
    this.positions.set({});
    this.edges.set([]);
    this.dirty.set(false);
    this.error.set(null);
    this.activeNoteId.set(null);
    this.favorites.set([]);
  }

  toggleFavorite(id: string): boolean {
    let added = false;
    this.favorites.update((list) => {
      if (list.includes(id)) return list.filter((f) => f !== id);
      added = true;
      return [...list, id];
    });
    this.dirty.set(true);
    return added;
  }

  openNote(id: string): void {
    this.activeNoteId.set(id);
  }

  closeNote(): void {
    this.activeNoteId.set(null);
  }

  /** Recharge la liste des fichiers (après création/suppression externe). */
  async refreshFiles(): Promise<void> {
    const path = this.projectPath();
    if (!path) return;
    this.loading.set(true);
    try {
      const files = await this.api.listMarkdownFiles(path);
      this.files.set(files);
      const known = new Set(files.map((f) => f.id));
      this.favorites.update((list) => list.filter((id) => known.has(id)));
      const active = this.activeNoteId();
      if (active && !known.has(active)) this.activeNoteId.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Crée une note vide (`base.md`, `base 2.md`… si collision),
   * rafraîchit la liste et retourne l'identifiant final.
   */
  async createNote(wanted: string): Promise<string> {
    const path = this.projectPath();
    if (!path) throw new Error('No project open');
    let base = wanted
      .trim()
      .replace(/[/\\]+/g, '')
      .replace(/\.\.+/g, '.')
      .replace(/\.markdown$/i, '')
      .replace(/\.md$/i, '')
      .trim();
    if (!base) base = 'note';
    const taken = new Set(this.files().map((f) => f.id.toLowerCase()));
    let candidate = `${base}.md`;
    let n = 2;
    while (taken.has(candidate.toLowerCase())) {
      candidate = `${base} ${n++}.md`;
    }
    await this.api.writeMarkdownFile(path, candidate, '');
    await this.refreshFiles();
    return candidate;
  }
}
