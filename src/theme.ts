import { useSyncExternalStore } from 'react';
import { STORAGE_NAMESPACE } from './storageNamespace';

/**
 * The site's colour theme (the owner: "make a dark mode of cards too, along
 * with the website and give a button to toggle it, by default take system").
 *
 * The PREFERENCE is `system` (the default: follows the OS live), `light` or
 * `dark`, kept in localStorage. The RESOLVED theme (light or dark) is
 * written to `<html data-theme>`, which `index.css` keys its light palette
 * on, and is read by the stage to paint the cards light or dark. Reads and
 * writes of storage are guarded: a private window or blocked storage just
 * means the default.
 */

const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;
type ThemePreference = (typeof THEME_PREFERENCES)[number];
type Theme = 'light' | 'dark';

const STORAGE_KEY = `${STORAGE_NAMESPACE}:theme`;
const listeners = new Set<() => void>();
const darkQuery = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (THEME_PREFERENCES as readonly string[]).includes(value);
}

function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isThemePreference(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

let preference: ThemePreference = typeof window === 'undefined' ? 'system' : readPreference();

/** The theme a preference resolves to now. */
function resolveTheme(value: ThemePreference, systemDark: boolean): Theme {
  if (value === 'system') return systemDark ? 'dark' : 'light';
  return value;
}

function currentTheme(): Theme {
  return resolveTheme(preference, darkQuery?.matches ?? true);
}

function apply() {
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = currentTheme();
  for (const listener of listeners) listener();
}

function setThemePreference(next: ThemePreference) {
  preference = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Storage blocked: the choice lasts for this page only.
  }
  apply();
}

/** System → light → dark → system. */
function nextPreference(value: ThemePreference): ThemePreference {
  return THEME_PREFERENCES[(THEME_PREFERENCES.indexOf(value) + 1) % THEME_PREFERENCES.length];
}

darkQuery?.addEventListener('change', () => {
  if (preference === 'system') apply();
});
// Other tabs.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    preference = readPreference();
    apply();
  });
  apply();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The resolved theme, re-rendering when it changes. */
function useTheme(): Theme {
  return useSyncExternalStore(subscribe, currentTheme, () => 'dark');
}

/** The stored preference, re-rendering when it changes. */
function useThemePreference(): ThemePreference {
  return useSyncExternalStore(
    subscribe,
    () => preference,
    () => 'system',
  );
}

export { nextPreference, resolveTheme, setThemePreference, THEME_PREFERENCES, useTheme, useThemePreference };
export type { Theme, ThemePreference };
