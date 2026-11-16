# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- Rhasspy 2.5 over MQTT (Hermes): the intents Rhasspy recognizes trigger Gladys scenes, filtered
  by intent, site and slot values, with the sentence, the confidence and the slots readable by the
  scene.
- A scene trigger for the sentences Rhasspy does not recognize.
- A scene action that makes Rhasspy say a text on a site, successful once Rhasspy confirms it.
- One device per Rhasspy site: last intent, last sentence, slots and confidence, kept across
  restarts.
- An optional server device from Rhasspy's web address: reachable, version, profile language.
- A dashboard widget with the recent intents and a button to make Rhasspy speak.
- A "Check the connection" action, and texts in English, French, German and Spanish.
