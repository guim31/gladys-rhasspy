// -----------------------------------------------------------------------------
// Scene action handlers (manifest `scene_actions`).
//
// `say` — Rhasspy says a text on a site (the default site of the
// configuration when the field is left empty). Resolves once Rhasspy
// confirmed it (`hermes/tts/sayFinished`), throws otherwise: Gladys shows the
// failure in red.
// -----------------------------------------------------------------------------

import { normalizeSiteId } from './config.js';
import { ActionFailure, SAY_TEXT, allLanguages } from './texts.js';

export const SCENE_ACTION = {
  SAY: 'say',
};

/**
 * @param {import('./hub.js').Hub} hub
 * @param {{ text?: string, site_id?: string }} fields
 */
export async function say(hub, fields = {}) {
  const typed = typeof fields.site_id === 'string' ? fields.site_id.trim() : '';
  const site = normalizeSiteId(typed);
  // A site id that cannot be one (space, MQTT wildcard): never fall back to
  // the default site, the text would be said in the wrong room.
  if (typed !== '' && site === '') {
    throw new ActionFailure(allLanguages(SAY_TEXT, 'badSite', typed));
  }
  return { site_id: await hub.say(fields.text, site) };
}
