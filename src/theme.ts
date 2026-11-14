import { STORAGE_NAMESPACE } from './storageNamespace';

/**
 * The site's colour theme: LIGHT, fixed (Deepak, 2026-10-17: "i think the
 * theme selector doesnt make sense, delete it. light theme is the current
 * for now"). It used to be a System / Light / Dark preference with a header
 * switch; the switch is gone and the theme no longer follows the OS.
 *
 * `<html data-theme='light'>` is what `index.css` keys its light palette on,
 * and the stage reads `useTheme()` to paint the cards. The old stored
 * preference is cleared so it can't linger.
 */

type Theme = 'light' | 'dark';

const THEME: Theme = 'light';

if (typeof document !== 'undefined') {
  document.documentElement.dataset.theme = THEME;
  try {
    localStorage.removeItem(`${STORAGE_NAMESPACE}:theme`);
  } catch {
    // Storage blocked: nothing to clear.
  }
}

/** The site's theme. */
function useTheme(): Theme {
  return THEME;
}

export { useTheme };
export type { Theme };
