import { Injectable, effect, signal } from '@angular/core';
import { DictKey, dicts } from './dicts';
import { Lang, isLang, loadLang, storeLang } from './lang';

export type { DictKey, Lang };

/**
 * Internationalisation runtime (un seul bundle Tauri) : la langue
 * courante est un signal, donc `t()` dans les templates se met à jour
 * dès que la langue change. Persistance en `localStorage`.
 */
@Injectable({ providedIn: 'root' })
export class I18nService {
  readonly lang = signal<Lang>(loadLang());

  constructor() {
    effect(() => {
      const lang = this.lang();
      storeLang(lang);
      document.documentElement.lang = lang;
    });
  }

  setLang(value: string): void {
    if (isLang(value)) this.lang.set(value);
  }

  t(key: DictKey, params?: Record<string, string | number>): string {
    let text: string = dicts[this.lang()][key] ?? dicts.fr[key] ?? key;
    if (params) {
      for (const [name, value] of Object.entries(params)) {
        text = text.replaceAll(`{${name}}`, String(value));
      }
    }
    return text;
  }
}
