// -----------------------------------------------------------------------------
// The integration end to end against the SDK's fake Gladys and a fake broker:
// intents to states and scene events, the sites filter, the speech action,
// the API check, the memory across restarts.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serverIds, siteIds } from '../src/devices.js';
import { memoryStore } from '../src/store.js';
import {
  API_URL,
  BROKER_URL,
  addDiscovered,
  captured,
  createWorld,
  flush,
  intentMessage,
  lastState,
  settle,
} from './helpers/world.js';

async function connectedWorld(config = {}, options = {}) {
  const world = await createWorld({ config: { broker_url: BROKER_URL, ...config }, ...options });
  world.broker.accept();
  await settle();
  return world;
}

test('subscribes to the intents, the sentences not recognized and the speech confirmations', async () => {
  const world = await connectedWorld();
  try {
    assert.deepEqual(world.broker.client.subscriptions, [
      'hermes/intent/#',
      'hermes/nlu/intentNotRecognized',
      'hermes/tts/sayFinished',
    ]);
    assert.equal(world.broker.connections[0].options.clientId, 'gladys-rhasspy-0a1b2c3d');
    assert.equal(world.gladys.fake.connectionStatus.connected, true);
  } finally {
    world.app.stop();
  }
});

test('without a broker, the status asks for one in the four languages', async () => {
  const world = await createWorld({ config: {} });
  try {
    const status = world.gladys.fake.connectionStatus;
    assert.equal(status.connected, false);
    assert.deepEqual(Object.keys(status.message).sort(), ['de', 'en', 'es', 'fr']);
  } finally {
    world.app.stop();
  }
});

test('an intent updates its site device and fires the scene event with its slots', async () => {
  const world = await connectedWorld();
  try {
    const { topic, payload } = captured('hermes/intent/ChangeLightState');
    world.broker.send(topic, payload);
    await settle();
    // The site heard is offered, next to the default site.
    const ids = siteIds(world.gladys, 'salon');
    assert.deepEqual(
      world.gladys.fake.discoveredDevices.map((d) => d.external_id),
      [siteIds(world.gladys, 'default').device, ids.device],
    );
    assert.deepEqual(world.gladys.fake.sceneEvents, [
      {
        key: 'intent_recognized',
        data: {
          intent: 'ChangeLightState',
          site_id: 'salon',
          text: 'allume la lumière du salon',
          confidence: 100,
          slots: 'name=salon, state=on',
          slot_1_name: 'name',
          slot_1_value: 'salon',
          slot_2_name: 'state',
          slot_2_value: 'on',
          slot_3_name: '',
          slot_3_value: '',
        },
      },
    ]);
    // Added afterwards: the last intent is published at once.
    await addDiscovered(world, ids.device);
    assert.equal(lastState(world, ids.feature('intent')), 'ChangeLightState');
    assert.equal(lastState(world, ids.feature('text')), 'allume la lumière du salon');
    assert.equal(lastState(world, ids.feature('slots')), 'name=salon, state=on');
    assert.equal(lastState(world, ids.feature('confidence')), 100);
    assert.ok(world.gladys.fake.widgetRefreshes.includes('recent_intents'));
  } finally {
    world.app.stop();
  }
});

test('the same sentence twice is published twice, a sentence not recognized too', async () => {
  const world = await connectedWorld();
  try {
    const ids = siteIds(world.gladys, 'default');
    await addDiscovered(world, ids.device);
    const before = world.gladys.fake.states.length;
    world.broker.send('hermes/intent/GetTime', intentMessage('GetTime', { input: 'quelle heure' }));
    await flush();
    world.broker.send('hermes/intent/GetTime', intentMessage('GetTime', { input: 'quelle heure' }));
    await flush();
    const intents = world.gladys.fake.states
      .slice(before)
      .filter((s) => s.device_feature_external_id === ids.feature('intent'));
    assert.equal(intents.length, 2);
    assert.equal(lastState(world, ids.feature('slots')), '(aucun)');

    const { topic, payload } = captured('hermes/nlu/intentNotRecognized');
    world.broker.send(topic, payload);
    await flush();
    assert.equal(lastState(world, ids.feature('intent')), '(non reconnue)');
    assert.equal(lastState(world, ids.feature('text')), 'chante une chanson');
    assert.equal(lastState(world, ids.feature('confidence')), 0);
    assert.deepEqual(world.gladys.fake.sceneEvents.at(-1), {
      key: 'intent_not_recognized',
      data: { site_id: 'default', text: 'chante une chanson' },
    });
  } finally {
    world.app.stop();
  }
});

test('only the listed sites are heard', async () => {
  const world = await connectedWorld({ sites: 'cuisine, default' });
  try {
    world.broker.send('hermes/intent/GetTime', intentMessage('GetTime', { siteId: 'salon' }));
    world.broker.send('hermes/intent/GetTime', intentMessage('GetTime', { siteId: 'cuisine' }));
    await settle();
    assert.deepEqual(
      world.gladys.fake.sceneEvents.map((e) => e.data.site_id),
      ['cuisine'],
    );
    assert.deepEqual(
      world.gladys.fake.discoveredDevices.map((d) => d.name),
      ['Rhasspy cuisine', 'Rhasspy default'],
    );
  } finally {
    world.app.stop();
  }
});

test('say: Rhasspy confirms, the scene action succeeds on the default site', async () => {
  const world = await connectedWorld({ default_site: 'salon' });
  try {
    const ack = await world.gladys.fake.sceneAction('say', { text: ' Bonjour ' });
    assert.equal(ack.success, true, JSON.stringify(ack));
    assert.deepEqual(ack.data, { outputs: { site_id: 'salon' } });
    const [request] = world.broker.published;
    assert.equal(request.topic, 'hermes/tts/say');
    assert.equal(request.payload.text, 'Bonjour');
    assert.equal(request.payload.siteId, 'salon');
    const other = await world.gladys.fake.sceneAction('say', { text: 'Salut', site_id: 'cuisine' });
    assert.deepEqual(other.data, { outputs: { site_id: 'cuisine' } });
  } finally {
    world.app.stop();
  }
});

test('say fails in red: no confirmation, no text, no broker', async () => {
  const world = await connectedWorld();
  try {
    world.broker.answerSay = false;
    // A configuration saved while a say waits: not a wrong site, a restart.
    const pending = world.gladys.fake.sceneAction('say', { text: 'Bonjour', site_id: 'salon' });
    await flush();
    await world.gladys.fake.configUpdated({ broker_url: 'mqtt://other.example:1883' });
    const restarted = await pending;
    assert.equal(restarted.success, false);
    assert.match(restarted.error.en, /not connected/);
    world.broker.accept();
    await flush();
    const silent = await world.gladys.fake.sceneAction('say', { text: 'Bonjour', site_id: 'x' });
    assert.equal(silent.success, false);
    assert.match(silent.error.fr, /n'a pas confirmé la lecture sur x/);
    assert.equal(world.hub.pendingSays.size, 0);

    const empty = await world.gladys.fake.sceneAction('say', { text: '  ' });
    assert.equal(empty.success, false);
    assert.match(empty.error.de, /Gib den Text ein/);

    const badSite = await world.gladys.fake.sceneAction('say', {
      text: 'Bonjour',
      site_id: 'le salon',
    });
    assert.equal(badSite.success, false);
    assert.match(badSite.error.fr, /« le salon » n'est pas un siteId valide/);

    world.broker.answerSay = true;
    world.broker.failPublish = true;
    const refused = await world.gladys.fake.sceneAction('say', { text: 'Bonjour' });
    assert.equal(refused.success, false);
    assert.match(refused.error.en, /did not take/);

    world.broker.drop();
    await flush();
    const offline = await world.gladys.fake.sceneAction('say', { text: 'Bonjour' });
    assert.equal(offline.success, false);
    assert.match(offline.error.es, /no está conectado/);
  } finally {
    world.app.stop();
  }
});

test('the server device: reachable, version and language, then down', async () => {
  const world = await connectedWorld({ api_url: `${API_URL}/` });
  try {
    const ids = serverIds(world.gladys);
    assert.equal(world.gladys.fake.discoveredDevices[0].external_id, ids.device);
    await addDiscovered(world, ids.device);
    assert.equal(lastState(world, ids.feature('online')), 1);
    assert.equal(lastState(world, ids.feature('version')), '2.5.11');
    assert.equal(lastState(world, ids.feature('language')), 'fr');
    assert.equal(world.api.calls[0], `${API_URL}/api/version`);

    world.api.up = false;
    await world.hub.tick();
    assert.equal(lastState(world, ids.feature('online')), 0);
  } finally {
    world.app.stop();
  }
});

test('check_connection: green when everything answers, red otherwise', async () => {
  const world = await connectedWorld({ api_url: API_URL });
  try {
    const ok = await world.gladys.fake.action('check_connection');
    assert.equal(ok.success, true, JSON.stringify(ok));
    assert.match(JSON.stringify(ok.data), /Rhasspy 2\.5\.11 répond \(profil fr\)/);

    world.api.up = false;
    const apiDown = await world.gladys.fake.action('check_connection');
    assert.equal(apiDown.success, false);
    assert.match(apiDown.error.fr, /API HTTP de Rhasspy ne répond pas/);

    world.broker.client.emit('error', Object.assign(new Error('Not authorized'), { code: 5 }));
    await flush();
    const refused = await world.gladys.fake.action('check_connection');
    assert.equal(refused.success, false);
    assert.match(refused.error.fr, /refuse/);
  } finally {
    world.app.stop();
  }
});

test('the last intents survive a restart: republished and kept for the heartbeat', async () => {
  const store = memoryStore();
  const first = await connectedWorld({}, { store });
  first.broker.send('hermes/intent/GetTime', intentMessage('GetTime', { input: 'quelle heure' }));
  await settle();
  first.app.stop();
  assert.equal(store.saved.recent.length, 1);

  const ids = siteIds(first.gladys, 'default');
  const device = first.gladys.fake.discoveredDevices.find((d) => d.external_id === ids.device);
  const second = await connectedWorld({}, { store: memoryStore(store.saved), devices: [device] });
  try {
    await second.hub.republish();
    assert.equal(lastState(second, ids.feature('intent')), 'GetTime');
    assert.equal(lastState(second, ids.feature('text')), 'quelle heure');
  } finally {
    second.app.stop();
  }
});

test('the container pushes the states itself, without onPoll', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  const world = await createWorld({ config: { broker_url: BROKER_URL, api_url: API_URL } });
  try {
    world.broker.accept();
    t.mock.timers.tick(0);
    await flush();
    const ids = serverIds(world.gladys);
    await addDiscovered(world, ids.device);
    world.api.up = false;
    const calls = world.api.calls.length;
    t.mock.timers.tick(60_000);
    await flush();
    assert.ok(world.api.calls.length > calls, 'the API is checked every minute');
    assert.equal(lastState(world, ids.feature('online')), 0);
  } finally {
    world.app.stop();
  }
});
