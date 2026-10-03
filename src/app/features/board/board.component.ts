import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LucideFileText, LucideStar, LucideX } from '@lucide/angular';
import { I18nService } from '../../core/i18n/i18n.service';
import { ProjectStore } from '../../core/services/project-store.service';

interface DragState {
  id: string;
  offsetX: number;
  offsetY: number;
}

/**
 * Canvas du projet : icônes Markdown déplaçables + liaisons
 * façon mind-mapping (trait simple ou flèche avec pointe).
 * Persistance auto dans `<projet>/.inkly/canvas.json`.
 */
@Component({
  selector: 'app-board',
  imports: [RouterLink, LucideFileText, LucideStar, LucideX],
  templateUrl: './board.component.html',
  styleUrl: './board.component.css',
})
export class BoardComponent implements OnInit, OnDestroy {
  /** Nouveau lien créé avec une pointe (true) ou simple trait (false). */
  readonly directedDefault = signal(true);
  readonly selectedSourceId = signal<string | null>(null);
  readonly selectedEdgeId = signal<string | null>(null);

  readonly selectedEdge = computed(() =>
    this.store.edges().find((e) => e.id === this.selectedEdgeId()) ?? null,
  );

  private drag: DragState | null = null;
  private dragMoved = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  // Taille carte fichier (doit matcher le CSS).
  private readonly nodeW = 124;
  private readonly nodeH = 92;

  constructor(
    readonly store: ProjectStore,
    readonly i18n: I18nService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    if (!this.store.projectPath()) {
      this.router.navigate(['/home']);
    }
  }

  ngOnDestroy(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    // Navigation sidebar : le projet reste ouvert en fond,
    // on flush la sauvegarde en attente pour ne rien perdre.
    if (this.store.dirty() && this.store.projectPath()) {
      void this.store.save();
    }
  }

  // --- Liaisons (création par 2 clics) + ouverture note ---

  onNodeClick(event: MouseEvent, id: string): void {
    if (this.dragMoved) {
      this.dragMoved = false;
      return; // clic issu d'un drag : ignorer
    }
    if (event.detail > 1) return; // double-clic : géré par openNote, pas de liaison
    const source = this.selectedSourceId();
    if (!source) {
      this.selectedSourceId.set(id);
      this.selectedEdgeId.set(null);
      return;
    }
    if (source === id) {
      this.selectedSourceId.set(null);
      return;
    }
    this.store.addEdge(source, id, this.directedDefault());
    this.selectedSourceId.set(null);
    this.scheduleSave();
  }

  cancelLinking(): void {
    this.selectedSourceId.set(null);
  }

  /** Double-clic : ouvre la note en lecture dans le menu Notes. */
  openNote(id: string): void {
    this.selectedSourceId.set(null);
    this.dragMoved = false;
    this.store.openNote(id);
    void this.router.navigate(['/notes']);
  }

  /** Étoile : ajoute/retire des favoris du projet (sans lier ni ouvrir). */
  toggleFavorite(event: MouseEvent, id: string): void {
    event.stopPropagation();
    this.dragMoved = false;
    this.store.toggleFavorite(id);
    this.scheduleSave();
  }

  isFavorite(id: string): boolean {
    return this.store.isFavorite(id);
  }

  onEdgeClick(id: string, event: MouseEvent): void {
    event.stopPropagation();
    this.selectedEdgeId.set(id);
    this.selectedSourceId.set(null);
  }

  deleteSelectedEdge(): void {
    const id = this.selectedEdgeId();
    if (!id) return;
    this.store.removeEdge(id);
    this.selectedEdgeId.set(null);
    this.scheduleSave();
  }

  toggleSelectedEdge(): void {
    const id = this.selectedEdgeId();
    if (!id) return;
    this.store.toggleEdgeDirection(id);
    this.scheduleSave();
  }

  // --- Drag & drop des icônes ---

  onNodePointerDown(event: PointerEvent, id: string): void {
    const node = this.store.nodes().find((n) => n.id === id);
    if (!node) return;
    this.drag = { id, offsetX: event.clientX - node.x, offsetY: event.clientY - node.y };
    this.dragMoved = false;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  onNodePointerMove(event: PointerEvent, id: string): void {
    if (!this.drag || this.drag.id !== id) return;
    this.dragMoved = true;
    const x = Math.max(0, Math.round(event.clientX - this.drag.offsetX));
    const y = Math.max(0, Math.round(event.clientY - this.drag.offsetY));
    this.store.setNodePosition(id, x, y);
  }

  onNodePointerUp(): void {
    if (this.drag) {
      this.drag = null;
      this.scheduleSave();
    }
  }

  // --- Géométrie des flèches ---

  edgeLine(edgeId: string): { x1: number; y1: number; x2: number; y2: number } {
    const edge = this.store.edges().find((e) => e.id === edgeId);
    const nodes = this.store.nodes();
    const a = nodes.find((n) => n.id === edge?.from);
    const b = nodes.find((n) => n.id === edge?.to);
    if (!a || !b) return { x1: 0, y1: 0, x2: 0, y2: 0 };
    const ax = a.x + this.nodeW / 2;
    const ay = a.y + this.nodeH / 2;
    const bx = b.x + this.nodeW / 2;
    const by = b.y + this.nodeH / 2;
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    // Raccourcit pour partir/arriver au bord des cartes.
    const trimA = Math.min(56, len / 2 - 4);
    const trimB = Math.min(62, len / 2 - 4);
    return {
      x1: ax + (dx / len) * trimA,
      y1: ay + (dy / len) * trimA,
      x2: bx - (dx / len) * trimB,
      y2: by - (dy / len) * trimB,
    };
  }

  // --- Sauvegarde / fermeture ---

  async closeProject(): Promise<void> {
    try {
      if (this.store.dirty()) await this.store.save();
    } finally {
      this.store.close();
      await this.router.navigate(['/home']);
    }
  }

  /** Sauvegarde auto (debounce) : aucun bouton, tout est persistant. */
  private async saveNow(): Promise<void> {
    if (!this.store.projectPath()) return;
    try {
      await this.store.save();
    } catch (e) {
      console.warn('Inkly: autosave failed', e);
    }
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.saveNow(), 600);
  }

  fileLabel(id: string): string {
    return id.length > 18 ? `${id.slice(0, 16)}…` : id;
  }
}
