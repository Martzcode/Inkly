import { Routes } from "@angular/router";

export const routes: Routes = [
  { path: "", pathMatch: "full", redirectTo: "home" },
  {
    path: "home",
    loadComponent: () =>
      import("./features/home/home.component").then((m) => m.HomeComponent),
  },
  {
    path: "notes",
    loadComponent: () =>
      import("./features/notes/notes.component").then((m) => m.NotesComponent),
  },
  {
    path: "search",
    loadComponent: () =>
      import("./features/search/search.component").then(
        (m) => m.SearchComponent,
      ),
  },
  {
    path: "favorites",
    loadComponent: () =>
      import("./features/favorites/favorites.component").then(
        (m) => m.FavoritesComponent,
      ),
  },
  {
    path: "settings",
    loadComponent: () =>
      import("./features/settings/settings.component").then(
        (m) => m.SettingsComponent,
      ),
  },
  { path: "**", redirectTo: "home" },
];
