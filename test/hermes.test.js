// -----------------------------------------------------------------------------
// The Hermes messages, parsed from a real Rhasspy 2.5.11 capture.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMessage, sayPayload, slotsSummary } from '../src/hermes.js';
import { captured } from './helpers/world.js';

const parse = ({ topic, payload }) => parseMessage(topic, Buffer.from(payload));

test('an intent with slots: the sentence said, the slots sorted by name', () => {
  const message = parse(captured('hermes/intent/ChangeLightState'));
  assert.deepEqual(message, {
    kind: 'intent',
    intent: 'ChangeLightState',
    // rawInput, not the input with the substitutions ("on la lumière").
    text: 'allume la lumière du salon',
    slots: [
      { name: 'name', value: 'salon' },
      { name: 'state', value: 'on' },
    ],
    confidence: 100,
    siteId: 'salon',
  });
  assert.equal(slotsSummary(message.slots), 'name=salon, state=on');
});

test('a number slot gives its value, not the words', () => {
  const message = parse(captured('hermes/intent/SetTimer'));
  assert.deepEqual(message.slots, [{ name: 'minutes', value: '5' }]);
  assert.equal(message.siteId, 'default');
});

test('a sentence not recognized', () => {
  assert.deepEqual(parse(captured('hermes/nlu/intentNotRecognized')), {
    kind: 'not_recognized',
    text: 'chante une chanson',
    siteId: 'default',
  });
});

test('the speech confirmation, and what is not ours', () => {
  assert.deepEqual(parse(captured('hermes/tts/sayFinished')), { kind: 'say_finished', id: 't1' });
  assert.equal(parseMessage('hermes/intent/X', Buffer.from('not json')), null);
  assert.equal(parseMessage('hermes/intent/', Buffer.from('{}')), null);
  assert.equal(parseMessage('hermes/hotword/default/detected', Buffer.from('{}')), null);
});

test('the say payload is the one Rhasspy expects', () => {
  assert.deepEqual(JSON.parse(sayPayload({ id: 'a', text: 'Bonjour', siteId: 'salon' })), {
    text: 'Bonjour',
    siteId: 'salon',
    lang: null,
    id: 'a',
    sessionId: '',
  });
});
