/** Langues supportées par l'application (codes ISO 639-1). */
export const LANGS = ['fr', 'en', 'es', 'de'] as const;

export type Lang = (typeof LANGS)[number];

/** Nom de chaque langue, dans sa propre langue (pas de traduction requise). */
export const LANG_NAMES: Record<Lang, string> = {
  fr: 'Français',
  en: 'English',
  es: 'Español',
  de: 'Deutsch',
};

export const DEFAULT_LANG: Lang = 'fr';

const STORAGE_KEY = 'inkly.lang';

export function isLang(value: string): value is Lang {
  return (LANGS as readonly string[]).includes(value);
}

export function loadLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && isLang(stored)) return stored;
  } catch {
    // Stockage indisponible : langue par défaut.
  }
  return DEFAULT_LANG;
}

export function storeLang(lang: Lang): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Stockage indisponible : la langue reste en mémoire pour la session.
  }
}
