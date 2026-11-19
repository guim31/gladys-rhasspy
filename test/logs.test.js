// -----------------------------------------------------------------------------
// Quiet logs: nothing at info level for a normal cycle (intents heard, the API
// checked every minute), one line when a failure starts and one when it ends,
// never a password.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serverIds, siteIds } from '../src/devices.js';
import {
  API_URL,
  addDiscovered,
  captured,
  createWorld,
  flush,
  intentMessage,
} from './helpers/world.js';

/** Capture every log line at the given level and above. */
function captureLogs(t, level = 'debug') {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  const lines = [];
  const record = (...args) => lines.push(args.map(String).join(' '));
  t.mock.method(console, 'log', record);
  t.mock.method(console, 'error', record);
  t.mock.method(console, 'warn', record);
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  return lines;
}

async function tick(t, ms) {
  t.mock.timers.tick(ms);
  await flush();
}

async function addedWorld(t, brokerUrl = 'mqtt://broker.example:1883') {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const world = await createWorld({ config: { broker_url: brokerUrl, api_url: API_URL } });
  t.after(() => world.app.stop());
  world.broker.accept();
  await tick(t, 0);
  await addDiscovered(world, serverIds(world.gladys).device);
  await addDiscovered(world, siteIds(world.gladys, 'default').device);
  return world;
}

test('a normal cycle writes nothing at info level', async (t) => {
  const world = await addedWorld(t);
  const lines = captureLogs(t, 'info');
  for (let i = 0; i < 10; i += 1) {
    world.broker.send('hermes/intent/GetTime', intentMessage('GetTime'));
    const { topic, payload } = captured('hermes/nlu/intentNotRecognized');
    world.broker.send(topic, payload);
    world.broker.send('hermes/hotword/default/detected', '{}');
    await tick(t, 60_000);
  }
  assert.deepEqual(lines, []);
});

test('an outage is told once, its end once, without the password', async (t) => {
  const world = await addedWorld(t, 'mqtt://alice:hunter2@broker.example:1883');
  const lines = captureLogs(t, 'info');
  world.api.up = false;
  for (let i = 0; i < 5; i += 1) {
    world.broker.drop();
    world.broker.client.emit('error', new Error('connect ECONNREFUSED'));
    await tick(t, 60_000);
  }
  world.api.up = true;
  world.broker.accept();
  await tick(t, 60_000);
  assert.equal(lines.length, 4, lines.join('\n'));
  assert.match(lines.join('\n'), /does not answer/);
  assert.match(lines.join('\n'), /answers again/);
  assert.match(lines.join('\n'), /Connected to the MQTT broker mqtt:\/\/broker\.example:1883/);
  assert.doesNotMatch(lines.join('\n'), /hunter2|alice:/);
});
