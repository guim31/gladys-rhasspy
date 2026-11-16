// -----------------------------------------------------------------------------
// Every text the container produces, in the four languages of Gladys. German
// says "du", Spanish "usted". The language is the one of the configuration
// (a device integration and a scene action do not receive the user's), except
// for the widget, which gets the viewer's.
// -----------------------------------------------------------------------------

export const pick = (table, language) => table[language] ?? table.en;

/** Feature names, frozen when the user adds the device. */
export const FEATURE_NAMES = {
  en: {
    online: 'Rhasspy reachable',
    version: 'Version',
    language: 'Profile language',
    intent: 'Last intent',
    text: 'Last sentence',
    slots: 'Slots of the last intent',
    confidence: 'Confidence of the last intent',
  },
  fr: {
    online: 'Rhasspy joignable',
    version: 'Version',
    language: 'Langue du profil',
    intent: 'Dernière intention',
    text: 'Dernière phrase',
    slots: 'Slots de la dernière intention',
    confidence: 'Confiance de la dernière intention',
  },
  de: {
    online: 'Rhasspy erreichbar',
    version: 'Version',
    language: 'Sprache des Profils',
    intent: 'Letzter Intent',
    text: 'Letzter Satz',
    slots: 'Slots des letzten Intents',
    confidence: 'Konfidenz des letzten Intents',
  },
  es: {
    online: 'Rhasspy accesible',
    version: 'Versión',
    language: 'Idioma del perfil',
    intent: 'Última intención',
    text: 'Última frase',
    slots: 'Slots de la última intención',
    confidence: 'Confianza de la última intención',
  },
};

/** Device names, as discovered (the user may rename them in Gladys). */
export const DEVICE_NAMES = {
  en: { server: 'Rhasspy server', site: (siteId) => `Rhasspy ${siteId}` },
  fr: { server: 'Serveur Rhasspy', site: (siteId) => `Rhasspy ${siteId}` },
  de: { server: 'Rhasspy-Server', site: (siteId) => `Rhasspy ${siteId}` },
  es: { server: 'Servidor Rhasspy', site: (siteId) => `Rhasspy ${siteId}` },
};

/** Text states: a `text/text` state is never empty. */
export const STATE_TEXT = {
  en: { notRecognized: '(not recognized)', noSlot: '(none)', silence: '(nothing heard)' },
  fr: { notRecognized: '(non reconnue)', noSlot: '(aucun)', silence: '(rien entendu)' },
  de: { notRecognized: '(nicht erkannt)', noSlot: '(keine)', silence: '(nichts gehört)' },
  es: { notRecognized: '(no reconocida)', noSlot: '(ninguno)', silence: '(nada oído)' },
};

/** Connection status of the integration page (objects, never one language). */
export const MESSAGES = {
  notConfigured: {
    en: 'Enter the address of the MQTT broker Rhasspy uses.',
    fr: "Saisissez l'adresse du broker MQTT qu'utilise Rhasspy.",
    de: 'Gib die Adresse des MQTT-Brokers ein, den Rhasspy nutzt.',
    es: 'Introduzca la dirección del broker MQTT que usa Rhasspy.',
  },
  refused: {
    en: 'The MQTT broker refuses the connection: check the user name and the password.',
    fr: "Le broker MQTT refuse la connexion : vérifiez le nom d'utilisateur et le mot de passe.",
    de: 'Der MQTT-Broker lehnt die Verbindung ab: Prüfe Benutzername und Passwort.',
    es: 'El broker MQTT rechaza la conexión: compruebe el usuario y la contraseña.',
  },
  unreachable: {
    en: 'The MQTT broker does not answer: check its address and that it is running.',
    fr: "Le broker MQTT ne répond pas : vérifiez son adresse et qu'il fonctionne.",
    de: 'Der MQTT-Broker antwortet nicht: Prüfe seine Adresse und ob er läuft.',
    es: 'El broker MQTT no responde: compruebe su dirección y que esté en marcha.',
  },
  publishFailed: {
    en: 'The integration could not start: see its logs.',
    fr: "L'intégration n'a pas pu démarrer : consultez ses journaux.",
    de: 'Die Integration konnte nicht starten: Sieh in ihre Protokolle.',
    es: 'La integración no pudo iniciarse: consulte sus registros.',
  },
};

/** Answers of the "Check the connection" action. */
export const CHECK_TEXT = {
  en: {
    notConfigured: 'Enter the address of the MQTT broker first.',
    connecting: 'Connecting to the MQTT broker, try again in a few seconds.',
    refused: 'The MQTT broker refuses the user name or the password.',
    unreachable: 'The MQTT broker does not answer.',
    ok: (url) => `Connected to the MQTT broker ${url}.`,
    api: (version, language) => `Rhasspy ${version} answers (profile ${language}).`,
    apiDown: 'The HTTP API of Rhasspy does not answer.',
  },
  fr: {
    notConfigured: "Saisissez d'abord l'adresse du broker MQTT.",
    connecting: 'Connexion au broker MQTT en cours, réessayez dans quelques secondes.',
    refused: "Le broker MQTT refuse le nom d'utilisateur ou le mot de passe.",
    unreachable: 'Le broker MQTT ne répond pas.',
    ok: (url) => `Connecté au broker MQTT ${url}.`,
    api: (version, language) => `Rhasspy ${version} répond (profil ${language}).`,
    apiDown: "L'API HTTP de Rhasspy ne répond pas.",
  },
  de: {
    notConfigured: 'Gib zuerst die Adresse des MQTT-Brokers ein.',
    connecting: 'Verbindung zum MQTT-Broker läuft, versuch es in ein paar Sekunden erneut.',
    refused: 'Der MQTT-Broker lehnt Benutzername oder Passwort ab.',
    unreachable: 'Der MQTT-Broker antwortet nicht.',
    ok: (url) => `Mit dem MQTT-Broker ${url} verbunden.`,
    api: (version, language) => `Rhasspy ${version} antwortet (Profil ${language}).`,
    apiDown: 'Die HTTP-API von Rhasspy antwortet nicht.',
  },
  es: {
    notConfigured: 'Introduzca primero la dirección del broker MQTT.',
    connecting: 'Conectando con el broker MQTT, inténtelo de nuevo en unos segundos.',
    refused: 'El broker MQTT rechaza el usuario o la contraseña.',
    unreachable: 'El broker MQTT no responde.',
    ok: (url) => `Conectado al broker MQTT ${url}.`,
    api: (version, language) => `Rhasspy ${version} responde (perfil ${language}).`,
    apiDown: 'La API HTTP de Rhasspy no responde.',
  },
};

/** Answers of the "say" scene action and of the widget form. */
export const SAY_TEXT = {
  en: {
    said: (site) => `Rhasspy said the text on ${site}.`,
    noText: 'Enter the text Rhasspy must say.',
    notConnected: 'The MQTT broker is not connected: Rhasspy cannot be reached.',
    timeout: (site) => `Rhasspy did not confirm the speech on ${site}: check the site id.`,
    failed: 'The MQTT broker did not take the request.',
  },
  fr: {
    said: (site) => `Rhasspy a dit le texte sur ${site}.`,
    noText: 'Saisissez le texte que Rhasspy doit dire.',
    notConnected: "Le broker MQTT n'est pas connecté : Rhasspy est injoignable.",
    timeout: (site) => `Rhasspy n'a pas confirmé la lecture sur ${site} : vérifiez le site.`,
    failed: "Le broker MQTT n'a pas pris la demande.",
  },
  de: {
    said: (site) => `Rhasspy hat den Text auf ${site} gesagt.`,
    noText: 'Gib den Text ein, den Rhasspy sagen soll.',
    notConnected: 'Der MQTT-Broker ist nicht verbunden: Rhasspy ist nicht erreichbar.',
    timeout: (site) => `Rhasspy hat die Ausgabe auf ${site} nicht bestätigt: Prüfe die Site-ID.`,
    failed: 'Der MQTT-Broker hat die Anfrage nicht angenommen.',
  },
  es: {
    said: (site) => `Rhasspy dijo el texto en ${site}.`,
    noText: 'Introduzca el texto que Rhasspy debe decir.',
    notConnected: 'El broker MQTT no está conectado: Rhasspy no es accesible.',
    timeout: (site) => `Rhasspy no confirmó la lectura en ${site}: compruebe el site id.`,
    failed: 'El broker MQTT no aceptó la solicitud.',
  },
};

/** The same table, as the multi-language object an ActionFailure carries. */
export const allLanguages = (table, key, ...args) =>
  Object.fromEntries(
    Object.entries(table).map(([language, texts]) => {
      const value = texts[key];
      return [language, typeof value === 'function' ? value(...args) : value];
    }),
  );

/**
 * A failure of an action: Gladys shows a thrown error in red, a returned value
 * in green. The message is the multi-language object.
 */
export class ActionFailure extends Error {
  constructor(text) {
    super(text.en);
    this.message = text;
  }
}
