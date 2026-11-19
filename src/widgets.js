// -----------------------------------------------------------------------------
// The "Rhasspy: recent intents" dashboard widget: the last sentences heard,
// newest first, and a button opening a form to make Rhasspy speak.
//
// Content budget of the core: one `card-list` (8 rows at most) and one
// button. A row: the intent (or "Not recognized"), the sentence heard, the
// time, the site as a badge; its detail panel lists the slots and the
// confidence. Pre-localized from the viewer's `language` (the core caches the
// content per settings, language and units). Settings: one site only, hide
// the sentences not recognized, hide the button.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { isConfigured } from './config.js';
import { WIDGET_KEY } from './hub.js';
import { SAY_TEXT, allLanguages, pick } from './texts.js';

export const WIDGET = {
  RECENT_INTENTS: WIDGET_KEY,
};
export const WIDGET_ACTION = {
  SAY: 'say',
};

export const CONTENT_TTL_SECONDS = 60;

export const TEXT = {
  en: {
    notConfigured: 'Enter the address of the MQTT broker in the integration configuration.',
    nothing: 'Nothing heard yet.',
    notRecognized: 'Not recognized',
    silence: '(nothing heard)',
    confidence: (n) => `Confidence: ${n} %`,
    say: 'Make it speak',
    text: 'Text to say',
    site: 'Site',
  },
  fr: {
    notConfigured: "Saisissez l'adresse du broker MQTT dans la configuration de l'intégration.",
    nothing: "Rien entendu pour l'instant.",
    notRecognized: 'Non reconnue',
    silence: '(rien entendu)',
    confidence: (n) => `Confiance : ${n} %`,
    say: 'Faire parler',
    text: 'Texte à dire',
    site: 'Site',
  },
  de: {
    notConfigured: 'Gib die Adresse des MQTT-Brokers in der Konfiguration der Integration ein.',
    nothing: 'Noch nichts gehört.',
    notRecognized: 'Nicht erkannt',
    silence: '(nichts gehört)',
    confidence: (n) => `Konfidenz: ${n} %`,
    say: 'Sprechen lassen',
    text: 'Zu sagender Text',
    site: 'Site',
  },
  es: {
    notConfigured: 'Introduzca la dirección del broker MQTT en la configuración de la integración.',
    nothing: 'Nada oído por ahora.',
    notRecognized: 'No reconocida',
    silence: '(nada oído)',
    confidence: (n) => `Confianza: ${n} %`,
    say: 'Hacer hablar',
    text: 'Texto a decir',
    site: 'Site',
  },
};

/** A form label: the core wants a multi-language object with `en`. */
const labelOf = (key) =>
  Object.fromEntries(Object.entries(TEXT).map(([language, texts]) => [language, texts[key]]));

const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
const truthy = (value) => value === true || value === 'true';

/**
 * Pure builder of the widget content.
 * @param {object} input
 * @param {object[]} input.events the recent events, newest first
 * @param {string[]} input.sites the sites the form offers
 * @param {string} input.defaultSite
 * @param {{ showButton: boolean }} input.options
 * @param {string} input.language
 */
export function buildRecentContent({ events, sites, defaultSite, options, language }) {
  const text = pick(TEXT, language);
  const components = [];
  if (events.length === 0) {
    components.push({ type: 'text', variant: 'body', text: text.nothing });
  } else {
    components.push({
      type: 'card-list',
      display: 'list',
      items: events.slice(0, 8).map((event) => {
        const details = [
          ...event.slots.map((slot) => `${slot.name} = ${slot.value}`),
          ...(event.recognized && event.confidence !== null
            ? [text.confidence(event.confidence)]
            : []),
        ];
        return {
          title: clip(event.recognized ? event.intent : text.notRecognized, 60),
          subtitle: clip(event.text || text.silence, 120),
          date: event.at,
          badge: {
            text: clip(event.site, 16),
            color: event.recognized ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.WARNING,
          },
          ...(details.length > 0 ? { description: details.join('\n') } : {}),
        };
      }),
    });
  }
  if (options.showButton) {
    components.push({
      type: 'button',
      label: text.say,
      icon: 'volume-2',
      style: 'secondary',
      action: {
        key: WIDGET_ACTION.SAY,
        fields: [
          { key: 'text', type: 'string', required: true, label: labelOf('text') },
          {
            key: 'site_id',
            type: 'select',
            required: true,
            default: sites.includes(defaultSite) ? defaultSite : sites[0],
            label: labelOf('site'),
            options: sites.map((site) => ({ value: site, label: { en: site } })),
          },
        ],
      },
    });
  }
  return { ttl_seconds: CONTENT_TTL_SECONDS, components };
}

/**
 * The onWidgetGet handler.
 * @param {import('./hub.js').Hub} hub
 * @param {{ settings?: object, language?: string }} request
 */
export function getRecentWidget(hub, { settings = {}, language = 'en' } = {}) {
  const text = pick(TEXT, language);
  if (!isConfigured(hub.config)) {
    return {
      ttl_seconds: CONTENT_TTL_SECONDS,
      components: [{ type: 'text', variant: 'body', text: text.notConfigured }],
    };
  }
  // A site device chosen in the settings narrows the list (and the form) to it.
  const chosen = hub.addedSites().find(({ device }) => device.external_id === settings.site);
  const sites = chosen ? [chosen.siteId] : hub.knownSites();
  const events = (hub.memory?.recent ?? []).filter(
    (event) =>
      (!chosen || event.site === chosen.siteId) &&
      (event.recognized || !truthy(settings.hide_not_recognized)),
  );
  return buildRecentContent({
    events,
    sites,
    defaultSite: hub.config.default_site,
    options: { showButton: !truthy(settings.hide_say_button) && sites.length > 0 },
    language,
  });
}

/**
 * The onWidgetAction handler: the form of the button.
 * @param {import('./hub.js').Hub} hub
 */
export async function onRecentAction(hub, actionKey, params, { values } = {}) {
  if (actionKey !== WIDGET_ACTION.SAY) {
    throw new Error(`Unknown widget action ${actionKey}`);
  }
  const site = await hub.say(values?.text, values?.site_id);
  return allLanguages(SAY_TEXT, 'said', site);
}
