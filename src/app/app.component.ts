import { Component } from "@angular/core";
import { RouterOutlet } from "@angular/router";
import { SidebarComponent } from "./shared/sidebar/sidebar.component";
import { TitlebarComponent } from "./shared/titlebar/titlebar.component";

/** Shell applicatif : barre de titre + barre latérale + page routée. */
@Component({
  selector: "app-root",
  imports: [RouterOutlet, SidebarComponent, TitlebarComponent],
  templateUrl: "./app.component.html",
  styleUrl: "./app.component.css",
})
export class AppComponent {}
