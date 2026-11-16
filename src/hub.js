// -----------------------------------------------------------------------------
// The hub: the MQTT client, the HTTP API check and everything Gladys sees
// from them — discovered devices, states, scene events, speech requests,
// connection status.
//
// Intents are pushed by Rhasspy over MQTT: each one updates the site device,
// fires a scene event and joins the recent list of the widget. Every TICK_MS
// the HTTP API is checked (when configured) and the steady states re-sent
// once HEARTBEAT_MS old, so they never look stale in Gladys.
// -----------------------------------------------------------------------------

import { randomUUID } from 'node:crypto';
import { createLogger } from '@gladysassistant/integration-sdk';
import { getServerInfo } from './api.js';
import { isConfigured, safeUrl } from './config.js';
import { buildServerDevice, buildSiteDevice, serverIds, siteIdOf, siteIds } from './devices.js';
import { SUBSCRIPTIONS, TOPIC, parseMessage, sayPayload, slotsSummary } from './hermes.js';
import { createIssueLog } from './issues.js';
import { createClient } from './mqtt.js';
import { MAX_RECENT } from './store.js';
import {
  ActionFailure,
  CHECK_TEXT,
  MESSAGES,
  SAY_TEXT,
  STATE_TEXT,
  allLanguages,
  pick,
} from './texts.js';

const logger = createLogger({ name: 'rhasspy-hub' });

export const WIDGET_KEY = 'recent_intents';
export const TRIGGER = {
  INTENT_RECOGNIZED: 'intent_recognized',
  INTENT_NOT_RECOGNIZED: 'intent_not_recognized',
};
/** Slots exposed one by one to the scenes (sorted by name). */
export const MAX_SLOTS = 3;

export const DEFAULT_TIMINGS = {
  tickMs: 60_000,
  heartbeatMs: 6 * 60 * 60_000,
  // Rhasspy confirms once the audio played (or after its length): a long
  // sentence takes a while, an unknown site never answers.
  sayTimeoutMs: 30_000,
  discoveryDelayMs: 2_000,
};

const MAX_SITES = 50;

export class Hub {
  /**
   * @param {object} options
   * @param {object} options.gladys
   * @param {{ load: Function, save: Function }} options.store
   * @param {() => number} [options.now]
   * @param {Function} [options.connectMqtt] test seam: mqtt.connect
   * @param {typeof fetch} [options.fetch] test seam
   * @param {() => Promise<{ clientId: string }>} options.loadClientId
   * @param {object} [options.timings]
   */
  constructor({
    gladys,
    store,
    now = () => Date.now(),
    connectMqtt,
    fetch,
    loadClientId,
    timings,
  }) {
    this.gladys = gladys;
    this.store = store;
    this.now = now;
    this.connectMqtt = connectMqtt;
    this.fetch = fetch;
    this.loadClientId = loadClientId;
    this.timings = { ...DEFAULT_TIMINGS, ...timings };
    this.issues = createIssueLog(logger);
    this.config = null;
    this.client = null;
    this.memory = null;
    /** Site ids heard since the start. */
    this.heard = new Set();
    /** @type {{ version: string, language: string } | null} */
    this.server = null;
    this.serverOnline = null;
    /** @type {Map<string, Function>} say id -> resolve */
    this.pendingSays = new Map();
    this.discoveryKey = '';
    this.discoveryTimer = null;
    this.tickTimer = null;
    this.generation = 0;
  }

  // --- lifecycle --------------------------------------------------------------

  async configure(config) {
    const generation = ++this.generation;
    const previous = this.config;
    this.config = config;
    this.memory ??= await this.store.load();
    if (generation !== this.generation) {
      return;
    }
    const sameLink =
      previous &&
      previous.broker_url === config.broker_url &&
      previous.username === config.username &&
      previous.password === config.password &&
      previous.tls_insecure === config.tls_insecure;
    if (previous?.api_url !== config.api_url) {
      this.server = null;
      this.serverOnline = null;
    }
    if (sameLink && this.client) {
      // Only the API address, the sites or the language changed.
      this.discoveryKey = '';
      this.scheduleDiscovery();
      this.tick().catch(() => {});
      return;
    }
    this.#stopClient();
    if (!isConfigured(config)) {
      await this.#status(false, MESSAGES.notConfigured);
      return;
    }
    const { clientId } = await this.loadClientId();
    if (generation !== this.generation) {
      return;
    }
    logger.info(`Connecting to the MQTT broker ${safeUrl(config.broker_url)}`);
    this.client = createClient({
      url: config.broker_url,
      username: config.username,
      password: config.password,
      clientId,
      tlsInsecure: config.tls_insecure,
      topics: SUBSCRIPTIONS,
      onMessage: (topic, payload) => this.onMessage(topic, payload),
      onState: (state, detail) => this.onLinkState(state, detail),
      ...(this.connectMqtt ? { connect: this.connectMqtt } : {}),
    });
    this.scheduleDiscovery();
    this.#startTick();
  }

  stop() {
    this.generation += 1;
    this.#stopClient();
    clearTimeout(this.discoveryTimer);
    this.discoveryTimer = null;
  }

  #stopClient() {
    this.client?.stop();
    this.client = null;
    clearInterval(this.tickTimer);
    this.tickTimer = null;
    for (const resolve of this.pendingSays.values()) {
      resolve(false);
    }
    this.pendingSays.clear();
  }

  #startTick() {
    clearInterval(this.tickTimer);
    this.tickTimer = setInterval(() => {
      this.tick().catch((err) => logger.error(`Update failed: ${err.message}`));
    }, this.timings.tickMs);
    this.tickTimer.unref?.();
    // The first check of the API, without waiting a whole period.
    this.tick().catch(() => {});
  }

  async #status(connected, message) {
    try {
      await this.gladys.setConnectionStatus(connected, message);
    } catch (err) {
      logger.debug(`Connection status not sent (${err.message})`);
    }
  }

  async onLinkState(state, detail) {
    const url = safeUrl(this.config.broker_url);
    if (state === 'connected') {
      logger.info(`Connected to the MQTT broker ${url}`);
      await this.#status(true);
      return;
    }
    logger.warn(`MQTT broker ${url}: ${state} (${detail ?? 'no detail'})`);
    await this.#status(false, state === 'refused' ? MESSAGES.refused : MESSAGES.unreachable);
  }

  // --- messages ---------------------------------------------------------------

  /** A site the configuration lets through (all of them when none is listed). */
  #listened(siteId) {
    return this.config.sites.length === 0 || this.config.sites.includes(siteId);
  }

  onMessage(topic, payload) {
    const message = parseMessage(topic, payload);
    if (!message) {
      logger.debug(`Ignored message on ${topic}`);
      return;
    }
    if (message.kind === 'say_finished') {
      this.pendingSays.get(message.id)?.(true);
      return;
    }
    if (!this.#listened(message.siteId)) {
      logger.debug(`Message of the site ${message.siteId} ignored (not listed)`);
      return;
    }
    this.onHeard(message).catch((err) => logger.error(`Intent handling failed: ${err.message}`));
  }

  async onHeard(message) {
    const { siteId } = message;
    const recognized = message.kind === 'intent';
    const event = {
      at: new Date(this.now()).toISOString(),
      site: siteId,
      recognized,
      intent: recognized ? message.intent : '',
      text: message.text,
      slots: recognized ? message.slots : [],
      confidence: recognized ? message.confidence : null,
    };
    logger.debug(
      recognized
        ? `Intent ${event.intent} on ${siteId} (${slotsSummary(event.slots) || 'no slot'})`
        : `Sentence not recognized on ${siteId}`,
    );
    this.memory.sites[siteId] = event;
    this.memory.recent = [event, ...this.memory.recent].slice(0, MAX_RECENT);
    if (Object.keys(this.memory.sites).length > MAX_SITES) {
      // The site heard the longest ago is forgotten.
      const [oldest] = Object.entries(this.memory.sites).sort((a, b) =>
        a[1].at < b[1].at ? -1 : 1,
      );
      delete this.memory.sites[oldest[0]];
    }
    this.store.save(this.memory);
    if (!this.heard.has(siteId)) {
      this.heard.add(siteId);
      this.scheduleDiscovery();
    }
    // Repeating the same sentence is a new event: published again.
    this.gladys.forgetPublishedStates?.(siteIds(this.gladys, siteId).device);
    await this.#publish(this.#siteStates(siteId));
    await this.#fire(event);
    this.requestWidgetRefresh();
  }

  async #fire(event) {
    const slot = (index, key) => event.slots[index]?.[key] ?? '';
    const payload = event.recognized
      ? {
          intent: event.intent,
          site_id: event.site,
          text: event.text,
          confidence: event.confidence ?? 0,
          slots: slotsSummary(event.slots),
          ...Object.fromEntries(
            Array.from({ length: MAX_SLOTS }, (_, i) => [
              [`slot_${i + 1}_name`, slot(i, 'name')],
              [`slot_${i + 1}_value`, slot(i, 'value')],
            ]).flat(),
          ),
        }
      : { site_id: event.site, text: event.text };
    const key = event.recognized ? TRIGGER.INTENT_RECOGNIZED : TRIGGER.INTENT_NOT_RECOGNIZED;
    try {
      await this.gladys.publishSceneEvent(key, payload);
      this.issues.ok('scene', 'Gladys accepts the scene events again');
    } catch (err) {
      this.issues.fail('scene', `Firing the scene event failed: ${err.message}`);
    }
  }

  // --- speech -------------------------------------------------------------------

  /**
   * Makes a site say a text; resolves once Rhasspy confirmed it.
   * @throws {ActionFailure}
   */
  async say(text, siteId) {
    const sentence = typeof text === 'string' ? text.trim() : '';
    const site = siteId || this.config?.default_site || 'default';
    if (sentence === '') {
      throw new ActionFailure(allLanguages(SAY_TEXT, 'noText'));
    }
    if (this.client?.state !== 'connected') {
      throw new ActionFailure(allLanguages(SAY_TEXT, 'notConnected'));
    }
    const id = randomUUID();
    let timer;
    const finished = new Promise((resolve) => {
      this.pendingSays.set(id, resolve);
      timer = setTimeout(() => resolve(false), this.timings.sayTimeoutMs);
    });
    try {
      await this.client.publish(TOPIC.SAY, sayPayload({ id, text: sentence, siteId: site }));
    } catch (err) {
      clearTimeout(timer);
      this.pendingSays.delete(id);
      logger.warn(`Speech request not published: ${err.message}`);
      throw new ActionFailure(allLanguages(SAY_TEXT, 'failed'));
    }
    const done = await finished;
    clearTimeout(timer);
    this.pendingSays.delete(id);
    if (!done) {
      logger.warn(`Rhasspy did not confirm the speech on the site ${site}`);
      throw new ActionFailure(allLanguages(SAY_TEXT, 'timeout', site));
    }
    return site;
  }

  // --- Gladys devices ---------------------------------------------------------

  /** Every site worth offering: listed, the default one, heard or remembered. */
  knownSites() {
    const sites = new Set([
      this.config.default_site,
      ...this.config.sites,
      ...Object.keys(this.memory?.sites ?? {}),
      ...this.heard,
    ]);
    return [...sites].filter((site) => this.#listened(site)).sort();
  }

  /** The site devices added in Gladys, with their site id. */
  addedSites() {
    const list = [];
    for (const device of this.gladys.devices ?? []) {
      const siteId = siteIdOf(this.gladys, device.external_id);
      if (siteId !== null) {
        list.push({ siteId, device });
      }
    }
    return list;
  }

  discoveredDevices() {
    const language = this.config.language;
    const devices = this.knownSites().map((site) => buildSiteDevice(this.gladys, site, language));
    if (this.config.api_url) {
      devices.unshift(buildServerDevice(this.gladys, language));
    }
    return devices;
  }

  scheduleDiscovery() {
    if (this.discoveryTimer) {
      return;
    }
    this.discoveryTimer = setTimeout(() => {
      this.discoveryTimer = null;
      this.publishDiscovery().catch(() => {});
    }, this.timings.discoveryDelayMs);
    this.discoveryTimer.unref?.();
  }

  /** The discovered devices; only sent again when the list changed (or forced). */
  async publishDiscovery({ force = false } = {}) {
    if (!this.config || !isConfigured(this.config)) {
      return;
    }
    const devices = this.discoveredDevices();
    const key = JSON.stringify(devices);
    if (!force && key === this.discoveryKey) {
      return;
    }
    try {
      await this.gladys.publishDiscoveredDevices(devices);
      this.discoveryKey = key;
      this.issues.ok('discovery', 'Gladys accepts the discovered devices again');
    } catch (err) {
      this.issues.fail('discovery', `Publishing the discovered devices failed: ${err.message}`);
    }
  }

  // --- states -----------------------------------------------------------------

  #siteStates(siteId) {
    const event = this.memory?.sites[siteId];
    if (!event) {
      return [];
    }
    const text = pick(STATE_TEXT, this.config.language);
    const ids = siteIds(this.gladys, siteId);
    return [
      {
        device_feature_external_id: ids.feature('intent'),
        text: event.recognized ? event.intent : text.notRecognized,
      },
      { device_feature_external_id: ids.feature('text'), text: event.text || text.silence },
      {
        device_feature_external_id: ids.feature('slots'),
        text: slotsSummary(event.slots) || text.noSlot,
      },
      { device_feature_external_id: ids.feature('confidence'), state: event.confidence ?? 0 },
    ];
  }

  #serverStates() {
    if (!this.config.api_url || this.serverOnline === null) {
      return [];
    }
    const ids = serverIds(this.gladys);
    return [
      { device_feature_external_id: ids.feature('online'), state: this.serverOnline ? 1 : 0 },
      ...(this.server?.version
        ? [{ device_feature_external_id: ids.feature('version'), text: this.server.version }]
        : []),
      ...(this.server?.language
        ? [{ device_feature_external_id: ids.feature('language'), text: this.server.language }]
        : []),
    ];
  }

  async #publish(states) {
    // Features not added in Gladys are filtered out: the core would only drop them.
    const known = new Set(
      (this.gladys.devices ?? []).flatMap((device) =>
        (device.features ?? []).map((feature) => feature.external_id),
      ),
    );
    const kept = states.filter((state) => known.has(state.device_feature_external_id));
    if (kept.length === 0) {
      return;
    }
    try {
      await this.gladys.publishChangedStates(kept, { heartbeat: this.timings.heartbeatMs });
      this.issues.ok('states', 'Gladys accepts the states again');
    } catch (err) {
      this.issues.fail('states', `Publishing the states failed: ${err.message}`);
    }
  }

  async checkServer() {
    if (!this.config?.api_url) {
      return;
    }
    const url = this.config.api_url;
    try {
      const info = await getServerInfo(url, this.fetch ? { fetch: this.fetch } : {});
      if (this.config?.api_url !== url) {
        return;
      }
      const wasDown = this.serverOnline === false;
      this.server = info;
      this.serverOnline = true;
      if (wasDown) {
        logger.info(`The Rhasspy API ${safeUrl(url)} answers again`);
      }
    } catch (err) {
      if (this.config?.api_url !== url) {
        return;
      }
      if (this.serverOnline !== false) {
        logger.warn(`The Rhasspy API ${safeUrl(url)} does not answer (${err.message})`);
      }
      this.serverOnline = false;
    }
  }

  /** Check the API, re-send what changed or became old. */
  async tick() {
    if (!this.config || !isConfigured(this.config)) {
      return;
    }
    await this.checkServer();
    await this.#publish([
      ...this.#serverStates(),
      ...this.addedSites().flatMap(({ siteId }) => this.#siteStates(siteId)),
    ]);
  }

  /** Everything again: a device was just added or updated in Gladys. */
  async republish() {
    this.gladys.forgetPublishedStates?.();
    await this.#publish([
      ...this.#serverStates(),
      ...this.addedSites().flatMap(({ siteId }) => this.#siteStates(siteId)),
    ]);
  }

  requestWidgetRefresh() {
    try {
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    } catch {
      // Fire-and-forget: a refresh lost while disconnected is caught up by the TTL.
    }
  }

  // --- the configuration action -------------------------------------------------

  /** @throws {ActionFailure} */
  async checkConnection() {
    const all = (key, ...args) => allLanguages(CHECK_TEXT, key, ...args);
    if (!isConfigured(this.config)) {
      throw new ActionFailure(all('notConfigured'));
    }
    const state = this.client?.state ?? null;
    if (state === 'refused') {
      throw new ActionFailure(all('refused'));
    }
    if (state === 'unreachable') {
      throw new ActionFailure(all('unreachable'));
    }
    if (state !== 'connected') {
      throw new ActionFailure(all('connecting'));
    }
    const url = safeUrl(this.config.broker_url);
    if (!this.config.api_url) {
      return all('ok', url);
    }
    await this.checkServer();
    const join = (parts) =>
      Object.fromEntries(Object.keys(parts[0]).map((l) => [l, parts.map((p) => p[l]).join(' ')]));
    if (!this.serverOnline) {
      throw new ActionFailure(join([all('ok', url), all('apiDown')]));
    }
    return join([all('ok', url), all('api', this.server.version, this.server.language || '?')]);
  }
}
