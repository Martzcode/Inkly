import { Component } from '@angular/core';

/**
 * Page d'accueil : message de bienvenue + ouverture d'un dossier.
 * `openFolder()` est un stub : le dialogue natif (tauri-plugin-dialog)
 * sera branché plus tard.
 */
@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
})
export class HomeComponent {
  openFolder(): void {
    // TODO: ouvrir le sélecteur de dossier via `tauri-plugin-dialog`
    // puis charger son contenu. Intentionnellement sans effet pour le moment.
  }
}
