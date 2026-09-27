# Inkly

Application desktop **Tauri v2 + Angular + Rust**.

## Stack

| Couche   | Techno              | Dossier         |
|----------|---------------------|-----------------|
| Frontend | Angular 22 (TS strict) | `src/`       |
| Bridge   | `@tauri-apps/api` via `ApiService` | `src/app/core/services/` |
| Backend  | Rust (Tauri commands) | `src-tauri/src/` |
| Config Tauri | `tauri.conf.json`, capabilities | `src-tauri/` |

## Structure

```
Inkly/
├── src/                          # Frontend Angular
│   └── app/
│       ├── core/services/        # api.service.ts — seul point d'accès à invoke()
│       ├── features/             # écrans métier (à créer : ex. features/home/)
│       ├── shared/               # composants/pipes/directives réutilisables
│       ├── app.component.*       # shell racine
│       ├── app.config.ts
│       └── app.routes.ts
├── src-tauri/                    # Backend Rust (Tauri)
│   ├── src/
│   │   ├── lib.rs                # Builder Tauri : plugins + state + handlers
│   │   ├── main.rs               # binaire fin (appelle lib::run)
│   │   ├── commands/             # 1 fichier par domaine
│   │   │   ├── mod.rs
│   │   │   ├── greet.rs          # exemple + tests
│   │   │   └── app_info.rs
│   │   ├── state.rs              # AppState global (.manage)
│   │   └── error.rs              # AppError sérialisée vers le front
│   ├── capabilities/default.json # permissions Tauri
│   ├── tauri.conf.json           # devUrl :1420, frontendDist ../dist/inkly/browser
│   ├── Cargo.toml
│   └── icons/
├── .vscode/                      # extensions + settings + tasks
└── docs/                         # (à créer) ADRs, schémas
```

## Prérequis

- Node 22 + npm 10
- Rust stable (rustup) + `cargo`
- Dépendances système Tauri (Linux) : voir https://tauri.app/start/prerequisites/
  ```bash
  sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget \
    file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
  ```

## Démarrage

```bash
npm install

# Dev desktop (Angular :1420 + Tauri)
npm run dev

# Dev frontend seul (navigateur, sans API Tauri)
npm start
```

## Vérifications

```bash
npm run check:front   # tsc frontend
npm run check:back    # cargo check backend
npm run test:back     # cargo test backend
npm run build         # build Angular seul
npm run build:app     # bundle desktop complet
```

## Conventions

**Backend (Rust) :**
- Une commande = une fonction dans `commands/<domaine>.rs`, retour `Result<T, AppError>`.
- Enregistrer dans `commands/mod.rs` + `generate_handler!` dans `lib.rs`.
- État partagé via `AppState` (`tauri::State<AppState>`).
- `cargo fmt` + `cargo clippy` avant chaque commit.

**Frontend (Angular) :**
- Jamais d'`invoke()` direct dans un composant → passer par `ApiService`.
- Standalone components, signals, `inject()` (pas de NgModules).
- Routes dans `app.routes.ts`, lazy-load des `features/` dès que ça grandit :
  ```ts
  { path: 'home', loadComponent: () => import('./features/home/home.component').then(m => m.HomeComponent) }
  ```

## Prochaines étapes suggérées

1. Renommer `productName` / icônes dans `src-tauri/`.
2. Créer `features/home/` et router `/` dessus.
3. Ajouter `docs/ARCHITECTURE.md` quand le métier se stabilise.
