// -----------------------------------------------------------------------------
// Scene action handlers (manifest `scene_actions`).
//
// `say` — Rhasspy says a text on a site (the default site of the
// configuration when the field is left empty). Resolves once Rhasspy
// confirmed it (`hermes/tts/sayFinished`), throws otherwise: Gladys shows the
// failure in red.
// -----------------------------------------------------------------------------

import { normalizeSiteId } from './config.js';

export const SCENE_ACTION = {
  SAY: 'say',
};

/**
 * @param {import('./hub.js').Hub} hub
 * @param {{ text?: string, site_id?: string }} fields
 */
export async function say(hub, fields = {}) {
  const site = await hub.say(fields.text, normalizeSiteId(fields.site_id));
  return { site_id: site };
}
