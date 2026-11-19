// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with blanks, strings or `undefined`.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

export const DEFAULT_CONFIG = {
  broker_url: '',
  username: '',
  password: '',
  tls_insecure: false,
  api_url: '',
  default_site: 'default',
  sites: '',
  language: 'fr',
};

const text = (value) => (typeof value === 'string' ? value.trim() : '');
const bool = (value, fallback) =>
  value === true || value === 'true'
    ? true
    : value === false || value === 'false'
      ? false
      : fallback;

/** An address with its scheme, among the allowed ones; '' otherwise. */
function normalizeUrl(value, defaultScheme, schemes) {
  const raw = text(value);
  if (raw === '') {
    return '';
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `${defaultScheme}://${raw}`;
  try {
    const url = new URL(withScheme);
    return schemes.includes(url.protocol) && url.hostname ? withScheme : '';
  } catch {
    return '';
  }
}

/**
 * The broker address: users type `192.0.2.10`, `192.0.2.10:1883` or a full
 * `mqtt://` / `mqtts://` URL. Rhasspy's internal broker listens on 12183.
 */
export const normalizeBrokerUrl = (value) =>
  normalizeUrl(value, 'mqtt', ['mqtt:', 'mqtts:', 'ws:', 'wss:']);

/** The HTTP API of Rhasspy (`http://host:12101`), without a trailing slash. */
export const normalizeApiUrl = (value) =>
  normalizeUrl(value, 'http', ['http:', 'https:']).replace(/\/+$/, '');

/**
 * A Rhasspy site id, as typed in its settings ("Satellite siteIds"): no MQTT
 * wildcard nor separator, since it goes into topics.
 */
export const normalizeSiteId = (value) => {
  const raw = text(value);
  return raw === '' || /[#+/\s]/.test(raw) ? '' : raw;
};

/** A comma (or space) separated list of site ids, without duplicates. */
export function normalizeSites(value) {
  const list = text(value)
    .split(/[,;\s]+/)
    .map(normalizeSiteId)
    .filter((site) => site !== '');
  return [...new Set(list)];
}

/**
 * @param {object} [raw] the values received from Gladys
 */
export function normalizeConfig(raw = {}) {
  const source = raw ?? {};
  return {
    broker_url: normalizeBrokerUrl(source.broker_url),
    username: text(source.username),
    // A password may legitimately start or end with a space: kept as typed.
    password: typeof source.password === 'string' ? source.password : '',
    tls_insecure: bool(source.tls_insecure, false),
    api_url: normalizeApiUrl(source.api_url),
    default_site: normalizeSiteId(source.default_site) || DEFAULT_CONFIG.default_site,
    // Empty: every site is listened to.
    sites: normalizeSites(source.sites),
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}

export const isConfigured = (config) => Boolean(config?.broker_url);

/**
 * An address safe for the logs and the messages: no user name, no password,
 * no path or query string.
 */
export function safeUrl(value) {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`;
  } catch {
    return '(invalid address)';
  }
}
