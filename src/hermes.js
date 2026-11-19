// -----------------------------------------------------------------------------
// The Hermes protocol of Rhasspy 2.5 (inherited from Snips), the part this
// integration uses:
//   hermes/intent/<intentName>        an intent recognized (NLU result);
//   hermes/nlu/intentNotRecognized    a sentence that matched no intent;
//   hermes/tts/say                    ask a site to speak a text;
//   hermes/tts/sayFinished            the site said it (same `id`).
// Payload shapes: rhasspy-hermes (MIT), messages of rhasspyhermes.nlu and
// rhasspyhermes.tts, checked against a real Rhasspy 2.5.11 (test/fixtures).
// -----------------------------------------------------------------------------

export const TOPIC = {
  INTENT: 'hermes/intent/#',
  NOT_RECOGNIZED: 'hermes/nlu/intentNotRecognized',
  SAY: 'hermes/tts/say',
  SAY_FINISHED: 'hermes/tts/sayFinished',
};

export const SUBSCRIPTIONS = [TOPIC.INTENT, TOPIC.NOT_RECOGNIZED, TOPIC.SAY_FINISHED];

const MAX_TEXT = 500;
const str = (value) => (typeof value === 'string' ? value.trim().slice(0, MAX_TEXT) : '');

/** A slot value as text: numbers, times and durations come as objects. */
function slotValue(slot) {
  const value = slot?.value;
  if (value && typeof value === 'object' && 'value' in value) {
    const inner = value.value;
    if (typeof inner === 'string' || typeof inner === 'number' || typeof inner === 'boolean') {
      return String(inner);
    }
  }
  return str(slot?.rawValue);
}

/**
 * The slots of an intent, sorted by name: the same intent always gives the
 * same order, whatever the order of the words in the sentence.
 * @returns {{ name: string, value: string }[]}
 */
function parseSlots(slots) {
  if (!Array.isArray(slots)) {
    return [];
  }
  return slots
    .map((slot) => ({ name: str(slot?.slotName) || str(slot?.entity), value: slotValue(slot) }))
    .filter((slot) => slot.name !== '')
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

const parseJson = (payload) => {
  try {
    const value = JSON.parse(payload.toString('utf8'));
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
};

/**
 * One MQTT message, as an event of the integration; null for anything else.
 * @param {string} topic
 * @param {Buffer} payload
 */
export function parseMessage(topic, payload) {
  if (topic.startsWith('hermes/intent/')) {
    const body = parseJson(payload);
    const name = str(body?.intent?.intentName) || str(topic.slice('hermes/intent/'.length));
    if (!body || name === '') {
      return null;
    }
    const confidence = Number(body.intent?.confidenceScore);
    return {
      kind: 'intent',
      intent: name,
      // `input` has the substitutions applied ("allume" -> "on"): `rawInput`
      // is what was said.
      text: str(body.rawInput) || str(body.input),
      slots: parseSlots(body.slots),
      confidence: Number.isFinite(confidence)
        ? Math.round(Math.min(Math.max(confidence, 0), 1) * 100)
        : null,
      siteId: str(body.siteId) || 'default',
    };
  }
  if (topic === TOPIC.NOT_RECOGNIZED) {
    const body = parseJson(payload);
    if (!body) {
      return null;
    }
    return { kind: 'not_recognized', text: str(body.input), siteId: str(body.siteId) || 'default' };
  }
  if (topic === TOPIC.SAY_FINISHED) {
    const body = parseJson(payload);
    return body && typeof body.id === 'string' ? { kind: 'say_finished', id: body.id } : null;
  }
  return null;
}

/** The payload of a `hermes/tts/say` request. */
export const sayPayload = ({ id, text, siteId }) =>
  JSON.stringify({ text, siteId, lang: null, id, sessionId: '' });

/** "name=salon, state=on", for the feature and the scene variable. */
export const slotsSummary = (slots) => slots.map((slot) => `${slot.name}=${slot.value}`).join(', ');
