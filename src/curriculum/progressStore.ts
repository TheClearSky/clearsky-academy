import { useSyncExternalStore } from 'react';
import { loadProgress, parseStoredProgress, saveProgress, STORAGE_KEY } from './progress';

/**
 * The page's ONE copy of the learner's progress (`progress.ts`), shared by
 * every component through `useSyncExternalStore`: the topic modals' "Mark as
 * learnt" writes it, the landing's HUD and the chapter pages read it. Another tab's change arrives
 * through the `storage` event.
 */

let done: ReadonlySet<string> = new Set();
let loaded = false;
const listeners = new Set<() => void>();

function ensureLoaded(): void {
  if (loaded) return;
  loaded = true;
  done = loadProgress();
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    done = parseStoredProgress(event.newValue);
    for (const listener of listeners) listener();
  });
}

function subscribe(listener: () => void): () => void {
  ensureLoaded();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot(): ReadonlySet<string> {
  ensureLoaded();
  return done;
}

function setTopicDone(key: string, isDone: boolean): void {
  ensureLoaded();
  if (done.has(key) === isDone) return;
  const next = new Set(done);
  if (isDone) next.add(key);
  else next.delete(key);
  done = next;
  saveProgress(done);
  for (const listener of listeners) listener();
}

/** The set of done topic keys; re-renders when it changes. */
function useProgress(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export { setTopicDone, useProgress };
