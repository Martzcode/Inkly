import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild, computed, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LucideChevronDown, LucideFilePlus, LucideFileText, LucideStar, LucideX } from '@lucide/angular';
import { I18nService } from '../../core/i18n/i18n.service';
import { EdgeStyle, edgeStyle } from '../../core/services/api.service';
import { ProjectStore } from '../../core/services/project-store.service';
import { EdgePreviewComponent } from '../../shared/edge-preview/edge-preview.component';

interface DragState {
  id: string;
  offsetX: number;
  offsetY: number;
}

/**
 * Canvas du projet : icônes Markdown déplaçables + liaisons
 * façon mind-mapping (courbe simple, une ou deux pointes).
 * Persistance auto dans `<projet>/.inkly/canvas.json`.
 */
@Component({
  selector: 'app-board',
  imports: [RouterLink, EdgePreviewComponent, LucideChevronDown, LucideFilePlus, LucideFileText, LucideStar, LucideX],
  templateUrl: './board.component.html',
  styleUrl: './board.component.css',
})
export class BoardComponent implements OnInit, OnDestroy {
  /** Styles de liaison proposés : simple, une pointe, deux pointes. */
  readonly edgeStyles: EdgeStyle[] = [0, 1, 2];
  /** Style appliqué aux nouvelles liaisons (choisi dans la liste déroulante). */
  readonly styleDefault = signal<EdgeStyle>(1);
  readonly styleMenuOpen = signal(false);
  readonly selectedSourceId = signal<string | null>(null);
  readonly selectedEdgeId = signal<string | null>(null);

  readonly selectedEdge = computed(() =>
    this.store.edges().find((e) => e.id === this.selectedEdgeId()) ?? null,
  );

  private drag: DragState | null = null;
  private dragMoved = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  /** Fantôme sous le curseur pendant le glisser depuis le bouton « nouvelle note ». */
  readonly dragNew = signal<{ x: number; y: number } | null>(null);
  private newDragStart: { x: number; y: number } | null = null;
  private newDragging = false;

  @ViewChild('canvas') canvasRef?: ElementRef<HTMLElement>;

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
    this.store.addEdge(source, id, this.styleDefault());
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

  // --- Création de note (clic = coin haut gauche, drop = à la position) ---

  onNewPointerDown(event: PointerEvent): void {
    this.newDragStart = { x: event.clientX, y: event.clientY };
    this.newDragging = false;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  onNewPointerMove(event: PointerEvent): void {
    if (!this.newDragStart) return;
    if (!this.newDragging) {
      const moved = Math.hypot(event.clientX - this.newDragStart.x, event.clientY - this.newDragStart.y);
      if (moved <= 6) return;
      this.newDragging = true;
    }
    this.dragNew.set({ x: event.clientX, y: event.clientY });
  }

  async onNewPointerUp(event: PointerEvent): Promise<void> {
    const wasDragging = this.newDragging;
    this.newDragStart = null;
    this.newDragging = false;
    this.dragNew.set(null);
    if (wasDragging) {
      const el = this.canvasRef?.nativeElement;
      if (el) {
        const r = el.getBoundingClientRect();
        if (
          event.clientX >= r.left &&
          event.clientX <= r.right &&
          event.clientY >= r.top &&
          event.clientY <= r.bottom
        ) {
          await this.createNoteAt(
            Math.max(0, Math.round(event.clientX - r.left + el.scrollLeft - this.nodeW / 2)),
            Math.max(0, Math.round(event.clientY - r.top + el.scrollTop - this.nodeH / 2)),
          );
        }
      }
      return; // déposé hors canvas : annulé, aucun fichier créé
    }
    // Clic simple : toujours dans le coin haut gauche visible, quitte à
    // chevaucher une note existante (la nouvelle reste affichée au-dessus).
    const el = this.canvasRef?.nativeElement;
    await this.createNoteAt(
      Math.max(0, Math.round((el ? el.scrollLeft : 0) + 16)),
      Math.max(0, Math.round((el ? el.scrollTop : 0) + 16)),
    );
  }

  onNewPointerCancel(): void {
    this.newDragStart = null;
    this.newDragging = false;
    this.dragNew.set(null);
  }

  /** Dernière note créée par le bouton : affichée au-dessus en cas de chevauchement. */
  readonly topNoteId = signal<string | null>(null);

  /** Crée le fichier .md puis fige sa position sur le canvas. */
  private async createNoteAt(x: number, y: number): Promise<string | null> {
    if (!this.store.projectPath()) return null;
    try {
      const id = await this.store.createNote(this.i18n.t('notes.untitled'));
      this.store.setNodePosition(id, x, y);
      await this.store.save();
      this.topNoteId.set(id);
      return id;
    } catch (e) {
      console.warn('Inkly: create note failed', e);
      return null;
    }
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

  /** Liste déroulante du style : ouvrir / fermer / choisir. */
  toggleStyleMenu(): void {
    this.styleMenuOpen.update((open) => !open);
  }

  closeStyleMenu(): void {
    this.styleMenuOpen.set(false);
  }

  pickStyle(style: EdgeStyle): void {
    this.styleDefault.set(style);
    this.styleMenuOpen.set(false);
  }

  /** Fait cycler le style par défaut : simple → une pointe → deux pointes. */
  cycleDefaultStyle(): void {
    this.styleDefault.update((s) => ((s + 1) % 3) as EdgeStyle);
  }

  /** Fait cycler le style de la liaison sélectionnée. */
  cycleSelectedEdge(): void {
    const id = this.selectedEdgeId();
    if (!id) return;
    this.store.cycleEdgeStyle(id);
    this.scheduleSave();
  }

  /** Libellé traduit d'un style (infobulles / accessibilité). */
  styleLabel(style: EdgeStyle): string {
    return this.i18n.t(
      style === 0 ? 'board.stylePlain' : style === 1 ? 'board.styleSingle' : 'board.styleDouble',
    );
  }

  /** Style d'une liaison (0, 1 ou 2 pointes). */
  edgeStyleOf(edgeId: string): EdgeStyle {
    const edge = this.store.edges().find((e) => e.id === edgeId);
    return edge ? edgeStyle(edge) : 0;
  }

  @HostListener('keydown.escape')
  onEscape(): void {
    this.closeStyleMenu();
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

  // --- Géométrie des liaisons (courbes quadratiques) ---

  /** Extrémités raccourcies au bord des cartes (centres décalés). */
  private edgeEnds(edgeId: string): { x1: number; y1: number; x2: number; y2: number } {
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

  /** Chemin SVG `M … Q …` : courbe douce entre les deux cartes. */
  edgePath(edgeId: string): string {
    const { x1, y1, x2, y2 } = this.edgeEnds(edgeId);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    // Courbure perpendiculaire, proportionnelle mais bornée.
    const off = Math.min(36, Math.max(10, len * 0.18));
    const cx = (x1 + x2) / 2 + (-dy / len) * off;
    const cy = (y1 + y2) / 2 + (dx / len) * off;
    const f = (n: number): number => Math.round(n * 10) / 10;
    return `M ${f(x1)} ${f(y1)} Q ${f(cx)} ${f(cy)} ${f(x2)} ${f(y2)}`;
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
