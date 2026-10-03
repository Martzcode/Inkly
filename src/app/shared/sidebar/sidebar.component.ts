import { Component } from '@angular/core';
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
  readonly mainItems: NavItem[] = [
    { label: 'Accueil', route: '/home', icon: LucideHouse },
    { label: 'Notes', route: '/notes', icon: LucideFileText },
    { label: 'Recherche', route: '/search', icon: LucideSearch },
    { label: 'Favoris', route: '/favorites', icon: LucideStar },
  ];

  readonly boardIcon = LucideNetwork;

  constructor(readonly store: ProjectStore) {}

  get boardVisible(): boolean {
    return this.store.projectPath() !== null;
  }

  readonly bottomItems: NavItem[] = [
    { label: 'Paramètres', route: '/settings', icon: LucideSettings },
  ];
}
