// -----------------------------------------------------------------------------
// What the integration remembers across restarts, in /data/state.json (the one
// writable volume): the last intent of each site (for the heartbeat and the
// states republished when a device is added) and the recent events of the
// widget. A /data that cannot be read or written only loses that memory.
// -----------------------------------------------------------------------------

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const MAX_RECENT = 8;

const empty = () => ({ sites: {}, recent: [] });

/**
 * @param {string} [dir]
 */
export function createStore(dir = process.env.DATA_DIR || '/data') {
  const file = join(dir, 'state.json');
  let writing = Promise.resolve();
  return {
    async load() {
      try {
        const data = JSON.parse(await readFile(file, 'utf8'));
        return {
          sites: data?.sites && typeof data.sites === 'object' ? data.sites : {},
          recent: Array.isArray(data?.recent) ? data.recent.slice(0, MAX_RECENT) : [],
        };
      } catch {
        return empty();
      }
    },
    /** Writes are queued: the last one wins, never a half-written file. */
    save(data) {
      const body = JSON.stringify({ sites: data.sites, recent: data.recent });
      writing = writing
        .then(async () => {
          await mkdir(dir, { recursive: true });
          await writeFile(`${file}.tmp`, body, 'utf8');
          await rename(`${file}.tmp`, file);
        })
        .catch(() => {});
      return writing;
    },
  };
}

/** A store that keeps nothing, for the tests. */
export const memoryStore = (initial = empty()) => ({
  saved: null,
  async load() {
    return structuredClone(initial);
  },
  async save(data) {
    this.saved = structuredClone({ sites: data.sites, recent: data.recent });
  },
});
