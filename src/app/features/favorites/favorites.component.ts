import { Component } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LucideStar } from '@lucide/angular';
import { ProjectStore } from '../../core/services/project-store.service';

/**
 * Page Favoris : notes épinglées via l'étoile du canvas.
 * Les favoris sont propres au projet ouvert
 * (persistés dans `<projet>/.inkly/canvas.json`).
 */
@Component({
  selector: 'app-favorites',
  imports: [RouterLink, LucideStar],
  templateUrl: './favorites.component.html',
  styleUrl: './favorites.component.css',
})
export class FavoritesComponent {
  constructor(
    readonly store: ProjectStore,
    private router: Router,
  ) {}

  open(id: string): void {
    this.store.openNote(id);
    void this.router.navigate(['/notes']);
  }

  async remove(id: string): Promise<void> {
    this.store.toggleFavorite(id);
    try {
      await this.store.save();
    } catch {
      // Le dirty reste positionné, la sauvegarde sera rejouée plus tard.
    }
  }
}
