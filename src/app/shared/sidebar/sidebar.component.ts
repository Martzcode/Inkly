import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { ProjectStore } from '../../core/services/project-store.service';

type NavIcon = 'home' | 'notes' | 'search' | 'star' | 'settings' | 'board';

interface NavItem {
  label: string;
  route: string;
  icon: NavIcon;
}

/**
 * Barre latérale de navigation : icônes seules, le nom s'affiche
 * en infobulle au survol / focus. Style + paramètres épinglés en bas.
 */
@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.css',
})
export class SidebarComponent {
  readonly mainItems: NavItem[] = [
    { label: 'Accueil', route: '/home', icon: 'home' },
    { label: 'Notes', route: '/notes', icon: 'notes' },
    { label: 'Recherche', route: '/search', icon: 'search' },
    { label: 'Favoris', route: '/favorites', icon: 'star' },
  ];

  constructor(readonly store: ProjectStore) {}

  get boardVisible(): boolean {
    return this.store.projectPath() !== null;
  }

  readonly bottomItems: NavItem[] = [
    { label: 'Paramètres', route: '/settings', icon: 'settings' },
  ];
}
