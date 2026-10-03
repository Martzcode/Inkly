import { Component, ElementRef, OnDestroy, SecurityContext, ViewChild, effect, signal } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import {
  LucideBold,
  LucideCode,
  LucideCodeXml,
  LucideHeading1,
  LucideHeading2,
  LucideHeading3,
  LucideHouse,
  LucideItalic,
  LucideLink,
  LucideLink2Off,
  LucideList,
  LucideListOrdered,
  LucideMinus,
  LucidePilcrow,
  LucideRedo2,
  LucideRemoveFormatting,
  LucideStrikethrough,
  LucideTable,
  LucideTextQuote,
  LucideUndo2,
} from '@lucide/angular';
import { marked } from 'marked';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { ApiService } from '../../core/services/api.service';
import { I18nService } from '../../core/i18n/i18n.service';
import type { DictKey } from '../../core/i18n/i18n.service';
import { ProjectStore } from '../../core/services/project-store.service';

/** Un pas d'historique : contenu + position du curseur (offsets texte). */
interface HistoryEntry {
  html: string;
  start: number;
  end: number;
}

/**
 * Menu Notes : page style traitement de texte d'un fichier Markdown
 * du projet ouvert — modifiable directement, sans jamais voir la
 * syntaxe brute (`**`, `#`… restent mis en forme pendant la frappe).
 * Chargement : Markdown → HTML (marked). Sauvegarde auto (debounce) :
 * HTML → Markdown (turndown + GFM) → `write_markdown_file`.
 * `lastHtml` est la source de vérité : la persistance ne dépend jamais
 * d'un élément DOM encore/en-dehors attaché (navigation, destruction).
 * Ouverture via double-clic sur une icône du canvas.
 */
@Component({
  selector: 'app-notes',
  imports: [
    RouterLink,
    LucideBold,
    LucideCode,
    LucideCodeXml,
    LucideHeading1,
    LucideHeading2,
    LucideHeading3,
    LucideHouse,
    LucideItalic,
    LucideLink,
    LucideLink2Off,
    LucideList,
    LucideListOrdered,
    LucideMinus,
    LucidePilcrow,
    LucideRedo2,
    LucideRemoveFormatting,
    LucideStrikethrough,
    LucideTable,
    LucideTextQuote,
    LucideUndo2,
  ],
  templateUrl: './notes.component.html',
  styleUrl: './notes.component.css',
})
export class NotesComponent implements OnDestroy {
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly dirty = signal(false);
  readonly saveState = signal<'idle' | 'saving' | 'saved'>('idle');
  /** États actifs (gras, liste…) selon la position du curseur. */
  readonly activeStates = signal<Record<string, boolean>>({});
  /** Bloc courant : p, h1, h2, h3, pre, blockquote… */
  readonly activeBlock = signal('');

  private editorEl?: ElementRef<HTMLElement>;

  @ViewChild('editor') set editorRef(el: ElementRef<HTMLElement> | undefined) {
    this.editorEl = el;
    this.applyToEditor();
  }

  private readonly turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
  });

  /** Dernier HTML connu (rendu ou frappé) du fichier affiché. */
  private lastHtml: string | null = null;
  /** Fichier auquel `lastHtml` se rapporte. */
  private shownPath: string | null = null;
  private shownFileId: string | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private savedFlash: ReturnType<typeof setTimeout> | null = null;
  private loadToken = 0;
  private readonly onSelectionChange = (): void => this.updateActiveStates();

  /** Historique propre (le natif est court et cassé par les commandes). */
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private lastCommit = 0;
  private static readonly HISTORY_LIMIT = 100;
  private static readonly COALESCE_MS = 1000;

  constructor(
    readonly store: ProjectStore,
    readonly i18n: I18nService,
    private api: ApiService,
    private sanitizer: DomSanitizer,
  ) {
    marked.setOptions({ breaks: true });
    this.turndown.use(gfm);
    document.addEventListener('selectionchange', this.onSelectionChange);
    effect(() => {
      const projectPath = this.store.projectPath();
      const fileId = this.store.activeNoteId();
      if (!projectPath || !fileId) {
        // Projet fermé ou aucune note : flushe un éventuel brouillon.
        void this.flushDraft();
        return;
      }
      if (projectPath === this.shownPath && fileId === this.shownFileId) return;
      void this.load(projectPath, fileId);
    });
  }

  ngOnDestroy(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    if (this.savedFlash) clearTimeout(this.savedFlash);
    document.removeEventListener('selectionchange', this.onSelectionChange);
    void this.flushDraft();
  }

  choose(id: string): void {
    this.store.openNote(id);
  }

  /** Recharge la note après une erreur. */
  retry(): void {
    const projectPath = this.store.projectPath();
    const fileId = this.store.activeNoteId();
    if (projectPath && fileId) void this.load(projectPath, fileId);
  }

  /** Frappe dans la page : mémorise + historique + sauvegarde auto. */
  onEdit(event: Event): void {
    if (!this.shownFileId) return;
    this.lastHtml = (event.target as HTMLElement).innerHTML;
    this.commitHistory();
    this.markDirtySoon();
  }

  /** Annule le dernier pas (100 pas max, curseur restauré). */
  undo(): void {
    if (!this.shownFileId || this.undoStack.length < 2) return;
    const current = this.undoStack.pop() as HistoryEntry;
    this.redoStack.push(current);
    this.restoreSnapshot(this.undoStack[this.undoStack.length - 1]);
  }

  /** Rétablit le pas annulé. */
  redo(): void {
    const next = this.redoStack.pop();
    if (!this.shownFileId || !next) return;
    this.undoStack.push(next);
    if (this.undoStack.length > NotesComponent.HISTORY_LIMIT) {
      this.undoStack.shift();
    }
    this.restoreSnapshot(next);
  }

  /**
   * Mémorise l'état courant. La frappe rapide (< 1 s) fusionne en un
   * seul pas ; les actions du ruban (`force`) créent toujours un pas.
   */
  private commitHistory(force = false): void {
    const editor = this.editorEl?.nativeElement;
    if (!editor || !this.shownFileId) return;
    const html = editor.innerHTML;
    this.lastHtml = html;
    const caret = this.caretToOffsets() ?? { start: 0, end: 0 };
    const top = this.undoStack[this.undoStack.length - 1];
    if (top && top.html === html) {
      top.start = caret.start;
      top.end = caret.end;
      return;
    }
    if (!force && top && Date.now() - this.lastCommit < NotesComponent.COALESCE_MS) {
      this.undoStack[this.undoStack.length - 1] = { html, ...caret };
      return;
    }
    this.undoStack.push({ html, ...caret });
    if (this.undoStack.length > NotesComponent.HISTORY_LIMIT) {
      this.undoStack.shift();
    }
    this.redoStack.length = 0;
    this.lastCommit = Date.now();
  }

  private restoreSnapshot(entry: HistoryEntry): void {
    this.lastHtml = entry.html;
    if (this.editorEl) {
      this.editorEl.nativeElement.innerHTML = entry.html;
      this.offsetsToCaret(entry.start, entry.end);
      this.editorEl.nativeElement.focus({ preventScroll: true });
    }
    this.updateActiveStates();
    this.markDirtySoon();
  }

  /** Curseur → offsets caractères depuis le début de la page. */
  private caretToOffsets(): { start: number; end: number } | null {
    const editor = this.editorEl?.nativeElement;
    const sel = window.getSelection();
    if (!editor || !sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return null;
    const toOffset = (node: Node, offset: number): number => {
      const probe = document.createRange();
      probe.selectNodeContents(editor);
      probe.setEnd(node, offset);
      return probe.toString().length;
    };
    return {
      start: toOffset(range.startContainer, range.startOffset),
      end: toOffset(range.endContainer, range.endOffset),
    };
  }

  /** Offsets → replace le curseur (borné, sans exception). */
  private offsetsToCaret(start: number, end: number): void {
    const editor = this.editorEl?.nativeElement;
    if (!editor) return;
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    const locate = (target: number): { node: Node; offset: number } => {
      walker.currentNode = editor;
      let seen = 0;
      let fallback: { node: Node; offset: number } = {
        node: editor,
        offset: editor.childNodes.length,
      };
      let text = walker.nextNode();
      while (text) {
        const len = text.textContent?.length ?? 0;
        if (seen + len >= target) return { node: text, offset: target - seen };
        seen += len;
        fallback = { node: text, offset: len };
        text = walker.nextNode();
      }
      return fallback;
    };
    try {
      const total = editor.textContent?.length ?? 0;
      const a = locate(Math.min(Math.max(start, 0), total));
      const b = locate(Math.min(Math.max(end, 0), total));
      const range = document.createRange();
      range.setStart(a.node, Math.min(a.offset, a.node.textContent?.length ?? 0));
      range.setEnd(b.node, Math.min(b.offset, b.node.textContent?.length ?? 0));
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    } catch {
      // Position introuvable : on laisse le curseur où il est.
    }
  }

  // --- Ruban de mise en forme (tout le Markdown éditable) ---

  /** La sélection est-elle dans la page d'édition ? */
  private selectionInEditor(): boolean {
    const editor = this.editorEl?.nativeElement;
    const sel = window.getSelection();
    if (!editor || !sel || sel.rangeCount === 0) return false;
    return editor.contains(sel.getRangeAt(0).commonAncestorContainer);
  }

  /** Commande simple (gras, liste…) sur la sélection courante. */
  exec(command: string, value?: string): void {
    if (!this.selectionInEditor()) return;
    try {
      // Balises sémantiques (<strong>, <em>) plutôt que styles inline.
      document.execCommand('styleWithCSS', false, 'false');
      document.execCommand(command, false, value ?? undefined);
    } catch {
      return;
    }
    this.afterRibbonEdit();
  }

  /** Bloc courant : paragraphe, titre, citation, code. */
  formatBlock(tag: 'p' | 'h1' | 'h2' | 'h3' | 'blockquote' | 'pre'): void {
    this.exec('formatBlock', `<${tag}>`);
  }

  /** Lien : URL demandée, sélection conservée (focus non volé). */
  insertLink(): void {
    if (!this.selectionInEditor()) return;
    const url = window.prompt(this.i18n.t('ribbon.linkUrl'));
    if (!url || !url.trim()) return;
    this.exec('createLink', url.trim());
  }

  /** Code en ligne : entoure la sélection d'un <code>. */
  wrapInlineCode(): void {
    const editor = this.editorEl?.nativeElement;
    const sel = window.getSelection();
    if (!editor || !sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return;
    const host =
      range.commonAncestorContainer instanceof Element
        ? range.commonAncestorContainer
        : range.commonAncestorContainer.parentElement;
    if (host?.closest('pre, code')) return; // déjà du code
    const code = document.createElement('code');
    try {
      range.surroundContents(code);
    } catch {
      code.appendChild(range.extractContents());
      range.insertNode(code);
    }
    sel.removeAllRanges();
    const keep = document.createRange();
    keep.selectNodeContents(code);
    sel.addRange(keep);
    this.afterRibbonEdit();
  }

  /** Insère un tableau 3×3 (avec en-tête) au curseur. */
  insertTable(): void {
    const editor = this.editorEl?.nativeElement;
    const sel = window.getSelection();
    if (!editor || !sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return;
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    for (let i = 0; i < 3; i++) headRow.appendChild(document.createElement('th'));
    thead.appendChild(headRow);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    for (let r = 0; r < 2; r++) {
      const row = document.createElement('tr');
      for (let i = 0; i < 3; i++) row.appendChild(document.createElement('td'));
      tbody.appendChild(row);
    }
    table.appendChild(tbody);
    range.deleteContents();
    range.insertNode(table);
    const first = table.querySelector('th');
    if (first) {
      const caret = document.createRange();
      caret.selectNodeContents(first);
      caret.collapse(true);
      sel.removeAllRanges();
      sel.addRange(caret);
    }
    this.afterRibbonEdit();
  }

  /** Après une action du ruban : synchro + pas d'historique + autosave. */
  private afterRibbonEdit(): void {
    const editor = this.editorEl?.nativeElement;
    if (!editor || !this.shownFileId) return;
    this.lastHtml = editor.innerHTML;
    this.commitHistory(true);
    this.markDirtySoon();
    this.updateActiveStates();
  }

  private updateActiveStates(): void {
    if (!this.selectionInEditor()) {
      this.activeStates.set({});
      this.activeBlock.set('');
      return;
    }
    try {
      this.activeStates.set({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        strikeThrough: document.queryCommandState('strikeThrough'),
        insertUnorderedList: document.queryCommandState('insertUnorderedList'),
        insertOrderedList: document.queryCommandState('insertOrderedList'),
      });
      this.activeBlock.set(document.queryCommandValue('formatBlock').toLowerCase());
    } catch {
      // API indisponible : boutons sans état actif.
    }
  }

  private markDirtySoon(): void {
    this.dirty.set(true);
    this.saveState.set('idle');
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      if (this.shownPath && this.shownFileId) {
        void this.persistTo(this.shownPath, this.shownFileId);
      }
    }, 800);
  }

  /** État actif d'un bouton du ruban (gras, liste…). */
  isActive(command: string): boolean {
    return this.activeStates()[command] ?? false;
  }

  /** Touche modificateur affichée dans les infobulles (Cmd sur Mac). */
  private readonly modKey = /mac/i.test(navigator.userAgent ?? '') ? 'Cmd' : 'Ctrl';

  /** Libellé + raccourci pour les infobulles du ruban. */
  tip(key: DictKey, shortcut: string): string {
    return `${this.i18n.t(key)} (${this.modKey}+${shortcut})`;
  }

  /**
   * Raccourcis standard d'édition (Docs/Word) :
   * - natifs (laissés au navigateur) : gras, italique, souligné,
   *   annuler, rétablir ;
   * - gérés ici : lien, enregistrement, barré, listes, titres.
   */
  onKeydown(event: KeyboardEvent): void {
    if ((!event.ctrlKey && !event.metaKey) || !this.shownFileId) return;
    const key = event.key.toLowerCase();
    // Annuler/rétablir maison (100 pas) : priorité sur le natif limité.
    if (key === 'z' && !event.altKey) {
      event.preventDefault();
      if (event.shiftKey) this.redo();
      else this.undo();
      return;
    }
    if (key === 'y' && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      this.redo();
      return;
    }
    if (event.shiftKey && !event.altKey) {
      if (event.code === 'Digit7') {
        event.preventDefault();
        this.exec('insertOrderedList');
        return;
      }
      if (event.code === 'Digit8') {
        event.preventDefault();
        this.exec('insertUnorderedList');
        return;
      }
      if (key === 's') {
        event.preventDefault();
        this.exec('strikeThrough');
        return;
      }
      return; // natifs (ex. rétablir via Maj) : on laisse faire
    }
    if (event.altKey && !event.shiftKey) {
      const blocks: Record<string, 'p' | 'h1' | 'h2' | 'h3'> = {
        Digit0: 'p',
        Digit1: 'h1',
        Digit2: 'h2',
        Digit3: 'h3',
      };
      const tag = blocks[event.code];
      if (tag) {
        event.preventDefault();
        this.formatBlock(tag);
      }
      return;
    }
    if (event.shiftKey || event.altKey) return;
    if (key === 'k') {
      event.preventDefault();
      this.insertLink();
      return;
    }
    if (key === 's') {
      // Évite la boîte « enregistrer la page » du navigateur.
      event.preventDefault();
      this.saveNow();
    }
    // b, i, u, z, y : natifs, on laisse faire.
  }

  /** Écrit le brouillon immédiatement (ex. Ctrl+S). */
  saveNow(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    if (this.dirty() && this.shownPath && this.shownFileId) {
      void this.persistTo(this.shownPath, this.shownFileId);
    }
  }

  /** Écrit le brouillon courant (chemin/ID mémorisés, pas ceux du store). */
  private async flushDraft(): Promise<void> {
    if (!this.dirty() || !this.shownPath || !this.shownFileId || this.lastHtml === null) {
      return;
    }
    await this.persistTo(this.shownPath, this.shownFileId);
  }

  private async load(projectPath: string, fileId: string): Promise<void> {
    // Flush du brouillon du fichier précédent avant de changer.
    await this.flushDraft();
    const token = ++this.loadToken;
    this.loading.set(true);
    this.error.set(null);
    try {
      const raw = await this.api.readMarkdownFile(projectPath, fileId);
      if (token !== this.loadToken) return; // fichier changé entre-temps
      const rendered = (await marked.parse(raw)) as string;
      this.lastHtml = this.sanitizer.sanitize(SecurityContext.HTML, rendered) ?? '';
      this.shownPath = projectPath;
      this.shownFileId = fileId;
      this.dirty.set(false);
      // Historique neuf : l'état chargé est le point de départ.
      this.undoStack = [{ html: this.lastHtml, start: 0, end: 0 }];
      this.redoStack = [];
      this.lastCommit = 0;
      this.applyToEditor();
    } catch (e) {
      if (token !== this.loadToken) return;
      this.error.set(e instanceof Error ? e.message : String(e));
      this.lastHtml = null;
      this.shownPath = null;
      this.shownFileId = null;
    } finally {
      if (token === this.loadToken) this.loading.set(false);
    }
  }

  private applyToEditor(): void {
    if (this.editorEl && this.lastHtml !== null) {
      this.editorEl.nativeElement.innerHTML = this.lastHtml;
    }
  }

  private async persistTo(projectPath: string, fileId: string): Promise<void> {
    if (this.lastHtml === null) return;
    this.saveState.set('saving');
    try {
      const markdown = this.turndown.turndown(this.lastHtml);
      await this.api.writeMarkdownFile(projectPath, fileId, markdown);
      if (this.shownPath === projectPath && this.shownFileId === fileId) {
        this.dirty.set(false);
      }
      this.saveState.set('saved');
      if (this.savedFlash) clearTimeout(this.savedFlash);
      this.savedFlash = setTimeout(() => {
        if (this.saveState() === 'saved') this.saveState.set('idle');
      }, 1500);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : String(e));
      this.saveState.set('idle');
    }
  }
}
