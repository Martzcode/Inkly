import { Component, inject, signal } from "@angular/core";
import { RouterOutlet } from "@angular/router";
import { ApiService } from "./core/services/api.service";

@Component({
  selector: "app-root",
  imports: [RouterOutlet],
  templateUrl: "./app.component.html",
  styleUrl: "./app.component.css",
})
export class AppComponent {
  private readonly api = inject(ApiService);

  greetingMessage = signal("");

  async greet(event: SubmitEvent, name: string): Promise<void> {
    event.preventDefault();
    // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
    this.greetingMessage.set(await this.api.greet(name));
  }
}
