/**
 * Déclarations minimales pour `turndown-plugin-gfm` (sans types officiels).
 * `gfm` regroupe tableaux + barré + cases à cocher.
 */
declare module 'turndown-plugin-gfm' {
  import type TurndownService from 'turndown';

  export type TurndownPlugin = (service: TurndownService) => void;

  export const gfm: TurndownPlugin[];
  export const tables: TurndownPlugin;
  export const strikethrough: TurndownPlugin;
  export const taskListItems: TurndownPlugin;
}
