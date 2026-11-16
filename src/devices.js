// -----------------------------------------------------------------------------
// Rhasspy -> Gladys devices. Pushed from the container, never polled by the
// core (no poll_frequency).
//
// - The "server" device, offered only when the HTTP API address is filled in:
//     online    input/binary, the API answers (checked every minute);
//     version   text/text, e.g. "2.5.11";
//     language  text/text, the language of the profile ("fr").
// - One "site" device per Rhasspy site id (`default`, a satellite `salon`…),
//   offered once the site was heard or listed in the configuration:
//     intent      text/text, the last intent, or "(not recognized)";
//     text        text/text, the sentence heard;
//     slots       text/text, "name=salon, state=on";
//     confidence  unknown/unknown in %, of the last intent.
// Feature keys are forever: never renamed.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CAT,
  DEVICE_FEATURE_TYPES as TYPE,
  DEVICE_FEATURE_UNITS as UNIT,
} from '@gladysassistant/integration-sdk';
import { DEVICE_NAMES, FEATURE_NAMES, pick } from './texts.js';

export const SERVER_TYPE = 'server';
export const SERVER_ID = 'rhasspy';
export const SITE_TYPE = 'site';

const part = (text) => encodeURIComponent(text).replace(/\./g, '%2E');

export const serverIds = (gladys) => gladys.externalIds(SERVER_TYPE, SERVER_ID);
export const siteIds = (gladys, siteId) => gladys.externalIds(SITE_TYPE, part(siteId));

/** The site id of a site device external id; null for anything else. */
export function siteIdOf(gladys, externalId) {
  const prefix = gladys.externalIds(SITE_TYPE, '').device;
  if (typeof externalId !== 'string' || !externalId.startsWith(prefix)) {
    return null;
  }
  const rest = externalId.slice(prefix.length);
  if (rest === '' || rest.includes(':')) {
    return null;
  }
  try {
    return decodeURIComponent(rest);
  } catch {
    return null;
  }
}

/** The feature key of a feature external id (`...:site:salon:intent` -> `intent`). */
export const featureKeyOf = (externalId) => externalId.slice(externalId.lastIndexOf(':') + 1);

function featureMaker(ids, language) {
  const names = pick(FEATURE_NAMES, language);
  return (key, fields) => ({
    name: names[key],
    external_id: ids.feature(key),
    selector: ids.feature(key),
    read_only: true,
    has_feedback: false,
    ...fields,
  });
}

const textFeature = { category: CAT.TEXT, type: TYPE.TEXT.TEXT, min: 0, max: 0 };

export function buildServerDevice(gladys, language) {
  const ids = serverIds(gladys);
  const feature = featureMaker(ids, language);
  return {
    name: pick(DEVICE_NAMES, language).server,
    external_id: ids.device,
    selector: ids.device,
    should_poll: false,
    features: [
      feature('online', { category: CAT.INPUT, type: TYPE.SENSOR.BINARY, min: 0, max: 1 }),
      feature('version', textFeature),
      feature('language', textFeature),
    ],
  };
}

export function buildSiteDevice(gladys, siteId, language) {
  const ids = siteIds(gladys, siteId);
  const feature = featureMaker(ids, language);
  return {
    name: pick(DEVICE_NAMES, language).site(siteId),
    external_id: ids.device,
    selector: ids.device,
    should_poll: false,
    features: [
      feature('intent', textFeature),
      feature('text', textFeature),
      feature('slots', textFeature),
      feature('confidence', {
        category: CAT.UNKNOWN,
        type: TYPE.UNKNOWN.UNKNOWN,
        unit: UNIT.PERCENT,
        min: 0,
        max: 100,
      }),
    ],
  };
}
