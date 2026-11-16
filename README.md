# Rhasspy for Gladys Assistant

An external integration for [Gladys Assistant](https://gladysassistant.com/) that connects
[Rhasspy 2.5](https://rhasspy.readthedocs.io/), the offline voice assistant, over MQTT (Hermes
protocol):

- the intents Rhasspy recognizes **trigger Gladys scenes**, filtered by intent, site and slot
  values, with the sentence and the slots readable by the scene;
- a sentence Rhasspy does not recognize triggers its own scene;
- a scene action makes **Rhasspy speak** a text on a site, and succeeds once Rhasspy confirms it;
- one device per Rhasspy site (last intent, sentence, slots, confidence) and an optional server
  device (reachable, version, profile language);
- a dashboard widget with the recent intents and a button to make Rhasspy speak.

Everything stays local: the integration talks to your MQTT broker and, optionally, to Rhasspy's
HTTP API.

**Rhasspy 2.5 only.** Rhasspy 3 and Home Assistant voice use the Wyoming protocol: for Piper text
to speech in Gladys, see [gladys-wyoming](https://github.com/guim31/gladys-wyoming). The two do
not overlap.

Tested against a real Rhasspy 2.5.11 in Docker (sentences sent to `/api/text-to-intent`, speech
requests over MQTT), without a microphone or a real satellite: feedback welcome.

## Requirements

- Gladys Assistant 5.2 or later.
- Rhasspy 2.5 with MQTT enabled (Settings → MQTT): an external broker, or Rhasspy's internal one
  exposed on port 12183.

## Installation

In Gladys, **Integrations → Install from GitHub**, then enter
`https://github.com/guim31/gladys-rhasspy`. Fill in the MQTT broker, then add the devices from the
**Discovery** tab. The full user documentation is in [`docs/en.md`](docs/en.md) (also in
[French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md)).

## How it works

| MQTT topic                       | Direction | Use                                       |
| -------------------------------- | --------- | ----------------------------------------- |
| `hermes/intent/#`                | subscribe | intent recognized → states, scene trigger |
| `hermes/nlu/intentNotRecognized` | subscribe | sentence not recognized → scene trigger   |
| `hermes/tts/say`                 | publish   | the "say a text" action                   |
| `hermes/tts/sayFinished`         | subscribe | confirmation of the speech                |

Rhasspy's "remote HTTP" intent handling is not used: the integration container is not reachable
from the network in the Gladys sandbox, so MQTT is the way in.

## Limits

- No dialogue session management (Rhasspy ends a session by itself after the intent).
- Scene filters compare exact values (Gladys core rule): no confidence threshold.
- Three slots are exposed one by one to the scenes (sorted by name), all of them as one text.

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests run against the SDK's fake Gladys and a fake MQTT broker, with real Hermes messages
recorded from Rhasspy 2.5.11 (`test/fixtures/hermes-capture.txt`). See [`CLAUDE.md`](CLAUDE.md)
for the architecture and the rules of the repository. Releases go through **Actions → Release**.

## Credits

- [Rhasspy](https://github.com/rhasspy/rhasspy) by Michael Hansen and contributors (MIT); the
  Hermes message formats come from [rhasspy-hermes](https://github.com/rhasspy/rhasspy-hermes)
  (MIT).
- The Rhasspy logo on the cover comes from the Rhasspy repository (MIT).
- [MQTT.js](https://github.com/mqttjs/MQTT.js) (MIT).

This project is not affiliated with the Rhasspy project.

## License

Apache-2.0
