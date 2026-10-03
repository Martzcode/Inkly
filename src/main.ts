import { bootstrapApplication } from "@angular/platform-browser";
import { AppComponent } from "./app/app.component";
import { appConfig } from "./app/app.config";

/**
 * Pincement pour zoomer/dézoomer désactivé, tous OS confondus.
 * - `touch-action` (styles.css) coupe le pincement tactile, mais le
 *   pincement au trackpad arrive déguisé en `wheel` + `ctrlKey`
 *   (Windows/macOS/Linux) : on le neutralise ici.
 * - `gesture*` : reliquat WebKit (macOS) du pincement tactile.
 * Le zoom clavier (ex. Ctrl + +/-) reste fonctionnel : seul le
 * geste des doigts est bloqué.
 */
function disablePinchZoom(): void {
  window.addEventListener(
    "wheel",
    (event) => {
      if (event.ctrlKey) event.preventDefault();
    },
    { passive: false, capture: true },
  );
  for (const type of ["gesturestart", "gesturechange", "gestureend"]) {
    window.addEventListener(type, (event) => event.preventDefault(), {
      passive: false,
    });
  }
}

disablePinchZoom();

bootstrapApplication(AppComponent, appConfig).catch((err) =>
  console.error(err),
);
