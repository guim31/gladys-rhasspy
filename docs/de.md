# Rhasspy

Nutze [Rhasspy 2.5](https://rhasspy.readthedocs.io/), den Offline-Sprachassistenten, mit Gladys:
Die Intents, die Rhasspy erkennt, starten deine Szenen, und Gladys lässt Rhasspy sprechen. Alles
bleibt in deinem Netzwerk.

Getestet mit einem echten Rhasspy 2.5.11 in Docker, mit Sätzen an seine `/api/text-to-intent`
(ohne Mikrofon): Rückmeldungen mit echten Satelliten sind willkommen.

## Was du bekommst

- Zwei Szenen-Auslöser: **Intent erkannt** (Filter nach Intent, Site und Slot-Werten) und **Satz
  nicht erkannt**.
- Eine Szenen-Aktion: **Text sagen**, von Rhasspy auf der gewählten Site gesprochen.
- Ein Gerät pro Rhasspy-Site (`default`, ein Satellit…): letzter Intent, letzter Satz, seine Slots
  und seine Konfidenz, mit Verlauf.
- Ein Server-Gerät (optional): Rhasspy erreichbar, Version, Sprache des Profils.
- Ein Dashboard-Widget, **Intents**: die zuletzt gehörten Sätze und ein Knopf, um Rhasspy sprechen
  zu lassen.

Für Rhasspy 3 oder die Sprachsteuerung von Home Assistant (Wyoming-Protokoll, Piper) nutze
stattdessen die Integration **gladys-wyoming**: Diese lässt Gladys mit Piper sprechen und liest
keine Intents.

## Voraussetzungen

- Rhasspy **2.5** mit MQTT. In Rhasspy, **Settings → MQTT**: Wähle **External** und gib deinen
  Broker ein (Mosquitto…), oder behalte **Internal** und mach seinen Broker erreichbar, Port
  **12183**.
- Gladys 5.2 oder neuer.
- Die Intent-Erkennung in Rhasspy eingerichtet (Fsticuffs, Fuzzywuzzy…), und die Sprachausgabe
  (eSpeak, Larynx, MaryTTS…) für die Sprechaktion. **Intent Handling** kann in Rhasspy deaktiviert
  bleiben: Die Integration liest die Intents über MQTT.

## Konfiguration

| Feld                              | Beschreibung                                                                             |
| --------------------------------- | ---------------------------------------------------------------------------------------- |
| MQTT-Broker                       | `mqtt://host:1883`, `mqtts://…`, oder der interne Broker von Rhasspy `mqtt://host:12183` |
| MQTT-Benutzername, Passwort       | Falls der Broker sie verlangt                                                            |
| Selbstsigniertes Zertifikat       | Für `mqtts://` mit deinem eigenen Zertifikat                                             |
| Webadresse von Rhasspy (optional) | `http://host:12101`: fügt das Server-Gerät hinzu                                         |
| Standard-Site                     | Die Site, die spricht, wenn eine Szene keine angibt (`default` in Rhasspy)               |
| Gehörte Sites (optional)          | Site-IDs, durch Kommas getrennt; leer: alle Sites                                        |
| Sprache der Namen                 | Namen der Geräte und Texte der Integration                                               |

Die Integration abonniert `hermes/intent/#`, `hermes/nlu/intentNotRecognized` und
`hermes/tts/sayFinished` und veröffentlicht `hermes/tts/say`. Mit einer ACL auf dem Broker erlaube
diese Topics.

## Geräte

Füge in **Integrationen → Rhasspy → Erkennung** die gewünschten Geräte hinzu:

- **Rhasspy &lt;site&gt;**: eines pro gehörter Site (und die Standard-Site). Letzter Intent (oder
  „(nicht erkannt)“), letzter Satz, wie er gesagt wurde, Slots (`name=salon, state=on`) und
  Konfidenz in %. Eine Site erscheint, sobald Rhasspy dort etwas gehört hat.
- **Rhasspy-Server**: nur mit der Webadresse. Jede Minute geprüft.

Ein zweimal gesagter Satz wird zweimal erfasst. Die letzten Intents bleiben im Datenvolume der
Integration und überstehen einen Neustart.

## Szenen

**Intent erkannt**: Jeder Filter ist optional, ein leerer passt auf alles.

- _Intent_: der genaue Name, wie in der `sentences.ini` von Rhasspy (`ChangeLightState`).
- _Site_: die Site-ID (`default`, `kueche`…).
- _Wert von Slot 1, 2, 3_: Die Slots sind **nach Name sortiert**. Mit
  `(schalte){state:on} das Licht in der (Küche | Stube){name} ein` ist Slot 1 `name`, Slot 2
  `state`: Filtere auf `Küche` und `on` für „schalte das Licht in der Küche ein“.

Die Aktionen der Szene lesen den Intent, die Site, den Satz, die Konfidenz, alle Slots sowie Name
und Wert der Slots 1 bis 3 (`{{triggerEvent.data.slot_1_value}}`).

**Satz nicht erkannt**: Rhasspy hat einen Satz gehört, der zu keinem Intent passt; die Szene liest
den Satz und die Site. Praktisch, um mit der Sprechaktion „Entschuldigung, das habe ich nicht
verstanden“ zu antworten.

**Text sagen**: Rhasspy spricht den Text mit seiner eigenen Sprachausgabe auf der angegebenen Site
(oder der Standard-Site). Die Aktion gelingt, sobald Rhasspy die Ausgabe bestätigt
(`hermes/tts/sayFinished`); sie scheitert nach 30 Sekunden ohne Bestätigung, zum Beispiel bei einer
unbekannten Site.

## Dashboard

Das Widget **Intents** zeigt die letzten acht gehörten Sätze, die neuesten zuerst: Intent, Satz,
Uhrzeit und Site; öffne eine Zeile für ihre Slots und ihre Konfidenz. Der Knopf **Sprechen lassen**
öffnet ein Formular (Text, Site). Einstellungen: nur eine Site, nicht erkannte Sätze ausblenden,
den Knopf ausblenden.

## Aktionen

**Verbindung prüfen** zeigt, ob der MQTT-Broker die Integration annimmt und ob die Webadresse von
Rhasspy antwortet (Version und Sprache des Profils).

## Grenzen

- Nur Rhasspy 2.5 (Hermes über MQTT). Rhasspy 3 und die Sprachsteuerung von Home Assistant nutzen
  Wyoming: siehe gladys-wyoming.
- Kein Intent Handling „Remote HTTP“: Der Container der Integration ist aus deinem Netzwerk nicht
  erreichbar; MQTT ist der einzige Weg hinein.
- Die Integration beendet oder verlängert keine Dialogsitzungen von Rhasspy: Rhasspy beendet eine
  Sitzung nach dem Intent selbst.
- Szenenfilter vergleichen genaue Werte: Eine Konfidenzschwelle ist kein Filter.

## Fehlerbehebung

- **Nichts passiert**: Prüfe, ob Rhasspy und die Integration denselben Broker nutzen. In Rhasspy
  zeigt die Seite **Log** die veröffentlichten Intents; `mosquitto_sub -v -t 'hermes/intent/#'`
  zeigt sie auf dem Broker.
- **„Der MQTT-Broker lehnt die Verbindung ab“**: Benutzername oder Passwort, oder eine ACL.
- **Die Sprechaktion scheitert**: Die Site-ID muss von Rhasspy bedient werden (Settings → siteId,
  oder „Satellite siteIds“ auf dem Server), und die Sprachausgabe muss aktiviert sein.
- Protokolle: **Integrationen → Rhasspy → Protokolle**; `LOG_LEVEL=debug` für alle Meldungen.

## Support

Fragen und Rückmeldungen im [Gladys-Forum](https://community.gladysassistant.com/), Fehler auf
[GitHub](https://github.com/guim31/gladys-rhasspy/issues). Nicht mit dem Rhasspy-Projekt verbunden.
