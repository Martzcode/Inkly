import { Component, computed } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import {
  LucideDynamicIcon,
  LucideFileText,
  LucideHouse,
  LucideNetwork,
  LucideSearch,
  LucideSettings,
  LucideStar,
  type LucideIcon,
} from '@lucide/angular';
import { I18nService } from '../../core/i18n/i18n.service';
import { ProjectStore } from '../../core/services/project-store.service';

interface NavItem {
  label: string;
  route: string;
  icon: LucideIcon;
}

/**
 * Barre latérale de navigation : icônes seules, le nom s'affiche
 * en infobulle au survol / focus. Style + paramètres épinglés en bas.
 */
@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive, LucideDynamicIcon],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.css',
})
export class SidebarComponent {
  /** Reconstruit à chaque changement de langue (via le signal). */
  readonly mainItems = computed<NavItem[]>(() => [
    { label: this.i18n.t('nav.home'), route: '/home', icon: LucideHouse },
    { label: this.i18n.t('nav.notes'), route: '/notes', icon: LucideFileText },
    { label: this.i18n.t('nav.search'), route: '/search', icon: LucideSearch },
    { label: this.i18n.t('nav.favorites'), route: '/favorites', icon: LucideStar },
  ]);

  readonly bottomItems = computed<NavItem[]>(() => [
    { label: this.i18n.t('nav.settings'), route: '/settings', icon: LucideSettings },
  ]);

  readonly boardLabel = computed(() => this.i18n.t('nav.board'));
  readonly boardIcon = LucideNetwork;

  constructor(
    readonly store: ProjectStore,
    private i18n: I18nService,
  ) {}

  get boardVisible(): boolean {
    return this.store.projectPath() !== null;
  }
}
