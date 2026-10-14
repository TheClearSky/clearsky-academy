import { useSyncExternalStore } from 'react';
import { STORAGE_NAMESPACE } from '../../storageNamespace';

/**
 * The chosen HUD design (rounds 1–3 compared many behind a toggle; one
 * remains since round 4, so this mostly resolves to it), kept in localStorage like the theme (`src/theme.ts`):
 * guarded reads and writes, validated against the known ids, synced across
 * tabs. `?hud=<id>` in the URL wins for this page load without being saved
 * (for sharing a design and for screenshots); `?hudSample=1` turns the
 * sample-progress preview on.
 *
 * The ids are passed in (`configureHudChoice`) so this store does not import
 * the registry and its lazy designs.
 */

const STORAGE_KEY = `${STORAGE_NAMESPACE}:hud`;
const listeners = new Set<() => void>();
let known: readonly string[] = [];
let fallback = '';
let choice = '';
let urlChoice: string | null = null;
let sample = false;

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function resolve(value: string | null): string {
  return value !== null && known.includes(value) ? value : fallback;
}

function notify() {
  for (const listener of listeners) listener();
}

/** Called once by the registry with its ids and the default. */
function configureHudChoice(ids: readonly string[], defaultId: string) {
  known = ids;
  fallback = defaultId;
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('hud');
    urlChoice = fromUrl !== null && ids.includes(fromUrl) ? fromUrl : null;
    sample = params.get('hudSample') === '1';
  }
  choice = urlChoice ?? resolve(readStored());
}

function setHudChoice(next: string) {
  if (!known.includes(next)) return;
  choice = next;
  urlChoice = null;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Storage blocked: the choice lasts for this page only.
  }
  notify();
}

function setHudSample(next: boolean) {
  sample = next;
  notify();
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if ((event.key !== STORAGE_KEY && event.key !== null) || urlChoice !== null) return;
    choice = resolve(readStored());
    notify();
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function useHudChoice(): string {
  return useSyncExternalStore(
    subscribe,
    () => choice,
    () => fallback,
  );
}

function useHudSample(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => sample,
    () => false,
  );
}

export { configureHudChoice, setHudChoice, setHudSample, useHudChoice, useHudSample };
