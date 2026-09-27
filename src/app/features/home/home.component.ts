import { Component, inject, signal } from '@angular/core';
import { ApiService } from '../../core/services/api.service';

/** Page d'accueil : démo d'appel au backend Rust via `ApiService`. */
@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
})
export class HomeComponent {
  private readonly api = inject(ApiService);

  readonly greetingMessage = signal('');

  async greet(event: SubmitEvent, name: string): Promise<void> {
    event.preventDefault();
    // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
    this.greetingMessage.set(await this.api.greet(name));
  }
}
