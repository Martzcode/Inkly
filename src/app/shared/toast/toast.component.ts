import { Component, OnDestroy, OnInit, input, output } from '@angular/core';
import { LucideX } from '@lucide/angular';

/**
 * Infobulle d'erreur ancrée en bas à droite (`role="alert"`).
 * Se referme au bout de 4 s ou via son bouton ; signale via `closed`.
 */
@Component({
  selector: 'app-toast',
  imports: [LucideX],
  templateUrl: './toast.component.html',
  styleUrl: './toast.component.css',
})
export class ToastComponent implements OnInit, OnDestroy {
  readonly message = input.required<string>();
  readonly closed = output<void>();

  private timer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.timer = setTimeout(() => this.closed.emit(), 4000);
  }

  ngOnDestroy(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  close(): void {
    this.closed.emit();
  }
}
