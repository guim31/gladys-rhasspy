// -----------------------------------------------------------------------------
// The "recent intents" widget: content within the core's vocabulary and
// budget, settings honoured, the form of its button.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { siteIds } from '../src/devices.js';
import {
  BROKER_URL,
  addDiscovered,
  captured,
  createWorld,
  flush,
  settle,
} from './helpers/world.js';

async function heardWorld() {
  const world = await createWorld({ config: { broker_url: BROKER_URL } });
  world.broker.accept();
  for (const prefix of ['hermes/intent/ChangeLightState', 'hermes/nlu/intentNotRecognized']) {
    const { topic, payload } = captured(prefix);
    world.broker.send(topic, payload);
    await flush();
  }
  await settle();
  return world;
}

const valid = (content) => {
  const problems = validateWidgetContent(content);
  assert.deepEqual(problems, [], JSON.stringify(problems));
};

test('the recent sentences, newest first, with a speak button', async () => {
  const world = await heardWorld();
  try {
    const ack = await world.gladys.fake.widgetGet('recent_intents', { language: 'fr' });
    assert.equal(ack.success, true, JSON.stringify(ack));
    const content = ack.data.content;
    valid(content);
    const [list, button] = content.components;
    assert.equal(list.type, 'card-list');
    assert.deepEqual(
      list.items.map((item) => [item.title, item.subtitle, item.badge.text]),
      [
        ['Non reconnue', 'chante une chanson', 'default'],
        ['ChangeLightState', 'allume la lumière du salon', 'salon'],
      ],
    );
    assert.equal(list.items[1].description, 'name = salon\nstate = on\nConfiance : 100 %');
    assert.equal(list.items[1].date, '2026-11-16T18:00:00.000Z');
    assert.equal(button.action.key, 'say');
    assert.deepEqual(
      button.action.fields[1].options.map((o) => o.value),
      ['default', 'salon'],
    );
  } finally {
    world.app.stop();
  }
});

test('the settings: one site, without the sentences not recognized, without the button', async () => {
  const world = await heardWorld();
  try {
    const salon = siteIds(world.gladys, 'salon').device;
    await addDiscovered(world, salon);
    const content = (
      await world.gladys.fake.widgetGet('recent_intents', {
        language: 'en',
        settings: { site: salon, hide_say_button: true },
      })
    ).data.content;
    valid(content);
    assert.equal(content.components.length, 1);
    assert.deepEqual(
      content.components[0].items.map((item) => item.title),
      ['ChangeLightState'],
    );
    const recognizedOnly = (
      await world.gladys.fake.widgetGet('recent_intents', {
        settings: { hide_not_recognized: true },
      })
    ).data.content;
    assert.deepEqual(
      recognizedOnly.components[0].items.map((item) => item.title),
      ['ChangeLightState'],
    );
  } finally {
    world.app.stop();
  }
});

test('nothing heard yet, or no broker: a sentence instead of the list', async () => {
  const world = await createWorld({ config: {} });
  try {
    const content = (await world.gladys.fake.widgetGet('recent_intents', { language: 'de' })).data
      .content;
    valid(content);
    assert.match(content.components[0].text, /MQTT-Brokers/);
  } finally {
    world.app.stop();
  }
  const quiet = await createWorld();
  try {
    const content = (await quiet.gladys.fake.widgetGet('recent_intents', { language: 'es' })).data
      .content;
    valid(content);
    assert.equal(content.components[0].text, 'Nada oído por ahora.');
  } finally {
    quiet.app.stop();
  }
});

test('the speak button: green when Rhasspy confirms, red otherwise', async () => {
  const world = await heardWorld();
  try {
    const ok = await world.gladys.fake.widgetAction(
      'recent_intents',
      'say',
      {},
      {
        values: { text: 'Bonjour', site_id: 'salon' },
      },
    );
    assert.equal(ok.success, true, JSON.stringify(ok));
    assert.equal(world.broker.published.at(-1).payload.siteId, 'salon');
    world.broker.answerSay = false;
    const ko = await world.gladys.fake.widgetAction(
      'recent_intents',
      'say',
      {},
      {
        values: { text: 'Bonjour', site_id: 'salon' },
      },
    );
    assert.equal(ko.success, false);
    assert.match(ko.error.fr, /salon/);
  } finally {
    world.app.stop();
  }
});
