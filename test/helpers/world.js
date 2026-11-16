// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake MQTT broker the test
// publishes Hermes messages on, and the integration wired on top through
// registerHandlers — the same wiring as index.js.
// -----------------------------------------------------------------------------

import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { memoryStore } from '../../src/store.js';

// The integration logs its lifecycle; keep the test output readable
// (LOG_LEVEL is read on every log call). LOG_LEVEL=debug npm test shows them.
process.env.LOG_LEVEL ??= 'silent';

export const BROKER_URL = 'mqtt://broker.example:1883';
export const API_URL = 'http://rhasspy.example:12101';
export const CLIENT_ID = 'gladys-rhasspy-0a1b2c3d';

/**
 * Real messages of Rhasspy 2.5.11 (profile fr, `mosquitto_sub -v -t
 * 'hermes/#'`), recorded while sending sentences to /api/text-to-intent and
 * a `hermes/tts/say`: { topic, payload } in order.
 */
export const CAPTURE = readFileSync(
  new URL('../fixtures/hermes-capture.txt', import.meta.url),
  'utf8',
)
  .split('\n')
  .filter((line) => line.trim() !== '')
  .map((line) => {
    const space = line.indexOf(' ');
    return { topic: line.slice(0, space), payload: line.slice(space + 1) };
  });

export const captured = (topicStart) => CAPTURE.find(({ topic }) => topic.startsWith(topicStart));

/** An intent message in the shape Rhasspy sends, for a site and slots. */
export function intentMessage(intent, { siteId = 'default', input = 'allume', slots = {} } = {}) {
  return JSON.stringify({
    input,
    rawInput: input,
    intent: { intentName: intent, confidenceScore: 1 },
    siteId,
    id: 'id-1',
    sessionId: 'id-1',
    slots: Object.entries(slots).map(([slotName, value]) => ({
      entity: slotName,
      slotName,
      rawValue: String(value),
      value: { kind: typeof value === 'number' ? 'Number' : 'Unknown', value },
      confidence: 1,
    })),
  });
}

/** A fake broker: mqtt.connect() returning a client the test drives. */
export function createFakeBroker() {
  const broker = {
    clients: [],
    connections: [],
    published: [],
    // Answer every hermes/tts/say with a sayFinished, as Rhasspy does for a
    // site it serves.
    answerSay: true,
    failPublish: false,
    get client() {
      return broker.clients[broker.clients.length - 1];
    },
    connect(url, options) {
      const client = new EventEmitter();
      client.subscriptions = [];
      client.ended = false;
      client.subscribe = (topics, opts, callback) => {
        const list = [].concat(topics);
        client.subscriptions.push(...list);
        callback?.(
          null,
          list.map((topic) => ({ topic, qos: 0 })),
        );
      };
      client.publish = (topic, payload, opts, callback) => {
        if (broker.failPublish) {
          callback(new Error('client disconnecting'));
          return;
        }
        broker.published.push({ topic, payload: JSON.parse(payload) });
        callback(null);
        if (topic === 'hermes/tts/say' && broker.answerSay) {
          const { id, siteId } = JSON.parse(payload);
          setImmediate(() =>
            client.emit(
              'message',
              'hermes/tts/sayFinished',
              Buffer.from(JSON.stringify({ siteId, id, sessionId: '' })),
            ),
          );
        }
      };
      client.end = () => {
        client.ended = true;
      };
      broker.clients.push(client);
      broker.connections.push({ url, options });
      return client;
    },
    accept() {
      broker.client.emit('connect');
    },
    send(topic, payload) {
      broker.client.emit('message', topic, Buffer.from(String(payload)));
    },
    drop() {
      broker.client.emit('close');
      broker.client.emit('offline');
    },
  };
  return broker;
}

/** A fake Rhasspy HTTP API. */
export function createFakeApi({ version = '2.5.11', language = 'fr' } = {}) {
  const api = {
    up: true,
    calls: [],
    async fetch(url) {
      api.calls.push(url);
      if (!api.up) {
        throw new TypeError('fetch failed');
      }
      const path = new URL(url).pathname;
      const body = path === '/api/version' ? version : JSON.stringify({ language });
      return { ok: true, status: 200, text: async () => body };
    },
  };
  return api;
}

/**
 * @param {object} [options]
 * @param {object} [options.config] raw integration config
 * @param {Array<object>} [options.devices] devices already created in Gladys
 * @param {object} [options.store]
 * @param {object} [options.timings]
 * @param {() => number} [options.now]
 */
export async function createWorld({
  config = { broker_url: BROKER_URL },
  devices = [],
  store = memoryStore(),
  timings,
  now = () => Date.parse('2026-11-16T18:00:00Z'),
} = {}) {
  const broker = createFakeBroker();
  const api = createFakeApi();
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    connectMqtt: broker.connect,
    fetch: api.fetch,
    store,
    now,
    loadClientId: async () => ({ clientId: CLIENT_ID, persisted: true }),
    timings: { discoveryDelayMs: 0, sayTimeoutMs: 50, ...timings },
  });
  await gladys.connect();
  await flush();
  return { gladys, broker, api, app, hub: app.hub, store };
}

/** Let the pending promise callbacks and zero-delay timers run. */
export const flush = async () => {
  for (let i = 0; i < 5; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

/** Wait for the zero-delay discovery timer. */
export const settle = async () => {
  await new Promise((resolve) => setTimeout(resolve, 5));
  await flush();
};

/** Add the discovered device with that external id, as the user would. */
export async function addDiscovered(world, externalId) {
  const device = world.gladys.fake.discoveredDevices.find((d) => d.external_id === externalId);
  if (!device) {
    throw new Error(`${externalId} was not discovered`);
  }
  await world.gladys.fake.deviceCreated(device);
  await flush();
  return device;
}

/** The last published state of a feature. */
export function lastState(world, featureExternalId) {
  const states = world.gladys.fake.states.filter(
    (s) => s.device_feature_external_id === featureExternalId,
  );
  const last = states[states.length - 1];
  return last === undefined ? undefined : (last.text ?? last.state);
}
