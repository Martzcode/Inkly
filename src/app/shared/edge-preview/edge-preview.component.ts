import { Component, input } from '@angular/core';
import { EdgeStyle } from '../../core/services/api.service';

/**
 * Aperçu schématique d'un style de liaison (courbe simple, une ou
 * deux pointes), utilisé dans la liste déroulante et les bannières.
 * La courbe est raccourcie pour s'arrêter à la base des pointes :
 * chaque pointe coiffe exactement le bout de la courbe.
 */
@Component({
  selector: 'app-edge-preview',
  template: `
    <svg viewBox="0 0 44 24" width="44" height="24" aria-hidden="true">
      @if (style() === 2) {
        <path
          d="M10.4 14.6 Q22 5 32.8 10.7"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
        />
      } @else if (style() === 1) {
        <path
          d="M5 19 Q22 5 32.8 10.7"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
        />
      } @else {
        <path
          d="M5 19 Q22 5 39 14"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
        />
      }
      @if (style() === 1 || style() === 2) {
        <path d="M39 14 L31.5 13.2 L34.1 8.2 Z" fill="currentColor" stroke="none" />
      }
      @if (style() === 2) {
        <path d="M5 19 L8.6 12.4 L12.2 16.7 Z" fill="currentColor" stroke="none" />
      }
    </svg>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
      }
      svg {
        display: block;
      }
    `,
  ],
})
export class EdgePreviewComponent {
  readonly style = input.required<EdgeStyle>();
}
