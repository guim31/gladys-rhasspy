# Rhasspy

Use [Rhasspy 2.5](https://rhasspy.readthedocs.io/), the offline voice assistant, with Gladys: the
intents Rhasspy recognizes start your scenes, and Gladys makes Rhasspy speak. Everything stays on
your network.

Tested against a real Rhasspy 2.5.11 in Docker, with sentences sent to its
`/api/text-to-intent` (no microphone): feedback from real satellites welcome.

## What you get

- Two scene triggers: **intent recognized** (filter by intent, site and slot values) and
  **sentence not recognized**.
- A scene action: **say a text**, spoken by Rhasspy on the site you choose.
- One device per Rhasspy site (`default`, a satellite…): last intent, last sentence, its slots and
  its confidence, with their history.
- A server device (optional): Rhasspy reachable, version, profile language.
- A dashboard widget, **recent intents**: the last sentences heard and a button to make Rhasspy
  speak.

For Rhasspy 3 or Home Assistant voice (Wyoming protocol, Piper), use the **gladys-wyoming**
integration instead: it makes Gladys speak with Piper, it does not read intents.

## Requirements

- Rhasspy **2.5** with MQTT. In Rhasspy, **Settings → MQTT**: choose **External** and enter your
  broker (Mosquitto…), or keep **Internal** and expose its broker, port **12183**.
- Gladys 5.2 or later.
- Intent recognition set up in Rhasspy (Fsticuffs, Fuzzywuzzy…), and text to speech (eSpeak,
  Larynx, MaryTTS…) for the say action. **Intent Handling** in Rhasspy can stay disabled: the
  integration reads the intents on MQTT.

## Configuration

| Field                            | Description                                                                       |
| -------------------------------- | --------------------------------------------------------------------------------- |
| MQTT broker                      | `mqtt://host:1883`, `mqtts://…`, or Rhasspy's internal broker `mqtt://host:12183` |
| MQTT user name, password         | If the broker asks for them                                                       |
| Accept a self-signed certificate | For `mqtts://` with your own certificate                                          |
| Rhasspy web address (optional)   | `http://host:12101`: adds the server device                                       |
| Default site                     | The site that speaks when a scene names none (`default` in Rhasspy)               |
| Listened sites (optional)        | Site ids separated by commas; empty: every site                                   |
| Language of the names            | Names of the devices and texts of the integration                                 |

The integration subscribes to `hermes/intent/#`, `hermes/nlu/intentNotRecognized` and
`hermes/tts/sayFinished`, and publishes `hermes/tts/say`. With an ACL on the broker, allow these
topics.

## Devices

In **Integrations → Rhasspy → Discovery**, add the devices you want:

- **Rhasspy &lt;site&gt;**: one per site heard (and the default site). Last intent (or "(not
  recognized)"), last sentence as it was said, slots (`name=salon, state=on`) and confidence in %.
  A site appears once Rhasspy heard something on it.
- **Rhasspy server**: only with the web address. Checked every minute.

A sentence said twice is recorded twice. The last intents are kept in the integration's data
volume, so they survive a restart.

## Scenes

**Intent recognized**: every filter is optional, an empty one matches anything.

- _Intent_: the exact name, as in Rhasspy's `sentences.ini` (`ChangeLightState`).
- _Site_: the site id (`default`, `kitchen`…).
- _Slot 1, 2, 3 value_: the slots are **sorted by name**. With
  `(turn on){state:on} the (kitchen | bedroom){name} light`, slot 1 is `name`, slot 2 is
  `state`: filter on `kitchen` and `on` for "turn on the kitchen light".

The actions of the scene read the intent, the site, the sentence, the confidence, all the slots and
the name and value of slots 1 to 3 (`{{triggerEvent.data.slot_1_value}}`).

**Sentence not recognized**: Rhasspy heard a sentence that matches no intent; the scene reads the
sentence and the site. Handy to answer "Sorry, I did not understand" with the say action.

**Say a text**: Rhasspy speaks the text with its own text to speech, on the site given (or the
default site). The action succeeds once Rhasspy confirms the speech (`hermes/tts/sayFinished`); it
fails after 30 seconds without confirmation, for example for an unknown site.

## Dashboard

The **recent intents** widget lists the last eight sentences heard, newest first: intent, sentence,
time and site; open a row to see its slots and confidence. The **Make it speak** button opens a form
(text, site). Settings: only one site, hide the sentences not recognized, hide the button.

## Actions

**Check the connection** tells whether the MQTT broker accepts the integration, and whether
Rhasspy's web address answers (version and profile language).

## Limits

- Rhasspy 2.5 only (Hermes over MQTT). Rhasspy 3 and Home Assistant voice use Wyoming: see
  gladys-wyoming.
- No "remote HTTP" intent handling: the integration's container is not reachable from your network;
  MQTT is the way in.
- The integration does not end or continue Rhasspy dialogue sessions: Rhasspy ends a session by
  itself after the intent.
- Scene filters compare exact values: a confidence threshold is not a filter.

## Troubleshooting

- **Nothing happens**: check that Rhasspy and the integration use the same broker. In Rhasspy, the
  page **Log** shows the intents it publishes; `mosquitto_sub -v -t 'hermes/intent/#'` shows them
  on the broker.
- **"The MQTT broker refuses the connection"**: user name or password, or an ACL.
- **The say action fails**: the site id must be one Rhasspy serves (Settings → siteId, or
  "Satellite siteIds" on the server), and text to speech must be enabled.
- Logs: **Integrations → Rhasspy → Logs**; set `LOG_LEVEL=debug` for every message.

## Support

Questions and feedback on the [Gladys forum](https://community.gladysassistant.com/), bugs on
[GitHub](https://github.com/guim31/gladys-rhasspy/issues). Not affiliated with the Rhasspy project.
