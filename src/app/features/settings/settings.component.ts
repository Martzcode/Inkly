import { Component } from '@angular/core';
import { LANGS, LANG_NAMES, Lang } from '../../core/i18n/lang';
import { I18nService } from '../../core/i18n/i18n.service';

/** Page Paramètres : langue de l'application (fr/en/es/de). */
@Component({
  selector: 'app-settings',
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.css',
})
export class SettingsComponent {
  readonly langs = LANGS;

  constructor(readonly i18n: I18nService) {}

  langName(lang: Lang): string {
    return LANG_NAMES[lang];
  }
}
