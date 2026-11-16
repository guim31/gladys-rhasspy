# Rhasspy

Utilisez [Rhasspy 2.5](https://rhasspy.readthedocs.io/), l'assistant vocal hors ligne, avec Gladys :
les intentions que Rhasspy reconnaît lancent vos scènes, et Gladys fait parler Rhasspy. Tout reste
sur votre réseau.

Testée contre un vrai Rhasspy 2.5.11 sous Docker, avec des phrases envoyées à son
`/api/text-to-intent` (sans micro) : vos retours avec de vrais satellites sont les bienvenus.

## Ce que vous obtenez

- Deux déclencheurs de scène : **intention reconnue** (filtre par intention, site et valeurs des
  slots) et **phrase non reconnue**.
- Une action de scène : **dire un texte**, prononcé par Rhasspy sur le site choisi.
- Un appareil par site Rhasspy (`default`, un satellite…) : dernière intention, dernière phrase,
  ses slots et sa confiance, avec leur historique.
- Un appareil serveur (facultatif) : Rhasspy joignable, version, langue du profil.
- Un widget de tableau de bord, **intentions** : les dernières phrases entendues et un bouton pour
  faire parler Rhasspy.

Pour Rhasspy 3 ou la voix de Home Assistant (protocole Wyoming, Piper), utilisez plutôt
l'intégration **gladys-wyoming** : elle fait parler Gladys avec Piper, elle ne lit pas les
intentions.

## Prérequis

- Rhasspy **2.5** avec MQTT. Dans Rhasspy, **Settings → MQTT** : choisissez **External** et
  indiquez votre broker (Mosquitto…), ou gardez **Internal** et exposez son broker, port **12183**.
- Gladys 5.2 ou plus récent.
- La reconnaissance d'intentions configurée dans Rhasspy (Fsticuffs, Fuzzywuzzy…), et la synthèse
  vocale (eSpeak, Larynx, MaryTTS…) pour l'action de parole. **Intent Handling** peut rester
  désactivé dans Rhasspy : l'intégration lit les intentions sur MQTT.

## Configuration

| Champ                               | Description                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------ |
| Broker MQTT                         | `mqtt://hôte:1883`, `mqtts://…`, ou le broker interne de Rhasspy `mqtt://hôte:12183` |
| Utilisateur, mot de passe MQTT      | Si le broker les demande                                                             |
| Accepter un certificat auto-signé   | Pour `mqtts://` avec votre propre certificat                                         |
| Adresse web de Rhasspy (facultatif) | `http://hôte:12101` : ajoute l'appareil serveur                                      |
| Site par défaut                     | Le site qui parle quand une scène n'en précise pas (`default` dans Rhasspy)          |
| Sites écoutés (facultatif)          | siteIds séparés par des virgules ; vide : tous les sites                             |
| Langue des noms                     | Noms des appareils et textes de l'intégration                                        |

L'intégration s'abonne à `hermes/intent/#`, `hermes/nlu/intentNotRecognized` et
`hermes/tts/sayFinished`, et publie `hermes/tts/say`. Avec une ACL sur le broker, autorisez ces
topics.

## Appareils

Dans **Intégrations → Rhasspy → Découverte**, ajoutez les appareils voulus :

- **Rhasspy &lt;site&gt;** : un par site entendu (et le site par défaut). Dernière intention (ou
  « (non reconnue) »), dernière phrase telle qu'elle a été dite, slots (`name=salon, state=on`) et
  confiance en %. Un site apparaît dès que Rhasspy y a entendu quelque chose.
- **Serveur Rhasspy** : seulement avec l'adresse web. Vérifié chaque minute.

Une phrase dite deux fois est enregistrée deux fois. Les dernières intentions sont gardées dans le
volume de données de l'intégration : elles survivent à un redémarrage.

## Scènes

**Intention reconnue** : chaque filtre est facultatif, un filtre vide accepte tout.

- _Intention_ : le nom exact, comme dans le `sentences.ini` de Rhasspy (`ChangeLightState`).
- _Site_ : le siteId (`default`, `cuisine`…).
- _Valeur du slot 1, 2, 3_ : les slots sont **triés par nom**. Avec
  `(allume){state:on} la lumière du (salon | cuisine){name}`, le slot 1 est `name`, le slot 2 est
  `state` : filtrez sur `salon` et `on` pour « allume la lumière du salon ».

Les actions de la scène lisent l'intention, le site, la phrase, la confiance, tous les slots, et le
nom et la valeur des slots 1 à 3 (`{{triggerEvent.data.slot_1_value}}`).

**Phrase non reconnue** : Rhasspy a entendu une phrase qui ne correspond à aucune intention ; la
scène lit la phrase et le site. Pratique pour répondre « Désolé, je n'ai pas compris » avec l'action
de parole.

**Dire un texte** : Rhasspy prononce le texte avec sa propre synthèse vocale, sur le site indiqué
(ou le site par défaut). L'action réussit quand Rhasspy confirme la lecture
(`hermes/tts/sayFinished`) ; elle échoue après 30 secondes sans confirmation, par exemple pour un
site inconnu.

## Tableau de bord

Le widget **intentions** liste les huit dernières phrases entendues, les plus récentes en tête :
intention, phrase, heure et site ; ouvrez une ligne pour voir ses slots et sa confiance. Le bouton
**Faire parler** ouvre un formulaire (texte, site). Réglages : un seul site, masquer les phrases
non reconnues, masquer le bouton.

## Actions

**Vérifier la connexion** indique si le broker MQTT accepte l'intégration, et si l'adresse web de
Rhasspy répond (version et langue du profil).

## Limites

- Rhasspy 2.5 seulement (Hermes sur MQTT). Rhasspy 3 et la voix de Home Assistant utilisent
  Wyoming : voir gladys-wyoming.
- Pas d'Intent Handling « Remote HTTP » : le conteneur de l'intégration n'est pas joignable depuis
  votre réseau ; MQTT est la seule entrée.
- L'intégration ne termine ni ne prolonge les sessions de dialogue de Rhasspy : Rhasspy termine une
  session de lui-même après l'intention.
- Les filtres de scène comparent des valeurs exactes : un seuil de confiance n'est pas un filtre.

## Dépannage

- **Rien ne se passe** : vérifiez que Rhasspy et l'intégration utilisent le même broker. Dans
  Rhasspy, la page **Log** montre les intentions publiées ; `mosquitto_sub -v -t 'hermes/intent/#'`
  les montre sur le broker.
- **« Le broker MQTT refuse la connexion »** : utilisateur ou mot de passe, ou une ACL.
- **L'action de parole échoue** : le siteId doit être servi par Rhasspy (Settings → siteId, ou
  « Satellite siteIds » sur le serveur), et la synthèse vocale activée.
- Journaux : **Intégrations → Rhasspy → Journaux** ; `LOG_LEVEL=debug` pour tous les messages.

## Support

Questions et retours sur le [forum Gladys](https://community.gladysassistant.com/), bugs sur
[GitHub](https://github.com/guim31/gladys-rhasspy/issues). Sans lien avec le projet Rhasspy.
