# Reprise du développement téléphone

## Socle vérifié

| Étape | Fonctionnement vérifié | Branche locale |
|---|---|---|
| [#38](https://github.com/QuentinELLEON/crashout-circuit/issues/38) | Quatre places, droits par rôle, jeton de reprise privé, expiration et commandes neutralisées à la déconnexion. Les clients table et Oz fonctionnent comme avant sur cette branche. | `38-session-distinguer-pilote-et-copilote` |
| [#39](https://github.com/QuentinELLEON/crashout-circuit/issues/39) | Serveur HTTP ou HTTPS sur le même port, WebSocket sécurisé, adresse publique optionnelle et adresses du réseau annoncées par `/api/session`. Certificat de test et erreurs de démarrage contrôlés automatiquement. | `39-reseau-servir-la-session-en-https` |
| [#40](https://github.com/QuentinELLEON/crashout-circuit/issues/40) | Le QR ouvre `/play?room=CODE`, puis l’interface joueur se connecte à `/ws/player`. Le choix du rôle, la concurrence pour une place et la reprise ont des tests réseau. La recette physique du lobby reste à faire. | `40-session-rejoindre-la-partie-par-qr-code` |
| Essai solo | Le pilote cyan rejoint seul, lance le circuit prédéfini depuis le téléphone, tourne par inclinaison en paysage et peut recommencer après une sortie. | `test/40-pilote-solo` |

Les branches repartent de `quentin/main` et réutilisent le code des trois premières étapes de la première tentative. La [PR d’ensemble #36](https://github.com/QuentinELLEON/crashout-circuit/pull/36) reste une référence. La numérotation de ce document est celle du nouveau dépôt.

## Essayer en local

Sur la branche `test/40-pilote-solo`, depuis le dossier du projet, lancer les commandes suivantes.

```bash
npm ci
npm run build
CRASHOUT_SOLO_TEST=1 CRASHOUT_TLS_KEY=/chemin/table-key.pem CRASHOUT_TLS_CERT=/chemin/table-cert.pem npm start
```

Ouvre la table sur l’adresse annoncée au démarrage. Connecte le téléphone au même réseau, scanne le QR, puis touche **Rejoindre comme pilote**. Passe en paysage et autorise le capteur si le navigateur le demande. Garde le téléphone droit le temps de la calibration, puis touche **Lancer la course**. Incline le téléphone pour tourner en regardant le circuit sur la table. **Recommencer** relance le même circuit.

Le volant exige HTTPS et un certificat approuvé par le téléphone. La conduite se suspend en portrait, en cours de calibration et si le capteur devient indisponible. En course, **Avance auto** bascule vers le mode pédale. Pour accélérer en mode pédale, incline le téléphone vers l’avant ou maintiens **Accélérer**. [Configuration HTTPS](../README.md#https-pour-les-téléphones)

## Validation restante

- Sur le téléphone physique, vérifier que le Wi-Fi permet d’ouvrir l’adresse du QR, essayer les deux sens d’inclinaison en paysage, faire une sortie de piste, recommencer et revenir à la page après verrouillage.
- La recette de la #39 et de la #41 se fait sur Safari iPhone et Chrome Android, via une adresse HTTPS de confiance. Vérifier le blocage en portrait, le recalibrage au retour en paysage, le refus de permission, la pédale et la neutralisation lors du verrouillage de l’écran.
- Pour valider la #40, démarrer en mode standard et essayer le même QR à quatre, avec choix simultané d’une même place et reprise après une coupure. Le mode solo sert à tester la redirection et la conduite initiale.

## Prompts à reprendre après validation

### Valider l’entrée des joueurs en mode standard

> Travaille dans QuentinELLEON/crashout-circuit. Lis les issues #38, #39 et #40 et confirme les branches validées avant tout changement. Vérifie #40 sur sa propre branche en mode standard avec un QR commun, quatre places, deux demandes concurrentes et la reprise du même onglet après une coupure. Compare les résultats aux critères de l’issue et corrige uniquement les écarts de connexion. Présente les résultats et les essais physiques restants avant d’entamer #41.

### Ajouter le volant sur téléphone

> Après validation de #40, crée une branche dédiée à #41 dans QuentinELLEON/crashout-circuit. Lis les détails de #41. Teste la permission du capteur en HTTPS sur Safari iPhone et Chrome Android, la calibration, l’orientation de l’écran, la latence et le blocage de la conduite si le capteur devient indisponible. Vérifie la neutralisation à la mise en arrière-plan. Fais une démonstration avec la table et le mode solo, puis attends ma validation.

### Construire les vues du pilote, une issue à la fois

> Dans QuentinELLEON/crashout-circuit, commence par #42 sur une branche dédiée à partir du socle validé. Préserve l’intérêt de regarder la table en gardant la vue locale du pilote centrée sur les informations proches. Vérifie une course avec la vue 2D avant de passer à #43, puis #49, puis #44, sur une branche par issue avec validation entre chaque. #50 doit être validée avant #51 pour le thème Rétro. Lis les critères de l’issue en cours et consigne les mesures sur téléphone quand un appareil est disponible.

### Raccorder le copilote, puis l’accessibilité

> Après validation de #40, lis #45 dans QuentinELLEON/crashout-circuit et travaille sur sa branche. Vérifie d’abord l’armement, la réparation et la pose physique sur table. Après validation de #45 et de la carte #42, ouvre une branche distincte pour #46. Teste les mêmes règles de pose à distance et fais la recette avec VoiceOver et TalkBack. Présente les écarts avant d’élargir le périmètre.

### Recetter la partie complète

> Après validation des dépendances de #47, lis sa fiche dans QuentinELLEON/crashout-circuit. Joue une partie à quatre sur la vraie table et les téléphones. Documente les appareils, les résultats observés et les blocages. Vérifie les commandes `npm run check` et `npm run verify`, puis propose les PR dans l’ordre des dépendances.

## Essai 3D Grand Prix

Reconstruire et lancer le serveur au premier plan dans un terminal interactif. Les chemins du certificat doivent correspondre au réseau utilisé pour le test sur téléphone.

```bash
npm ci
npm run build
CRASHOUT_SOLO_TEST=1 CRASHOUT_DEV_TOOLS=1 CRASHOUT_SPECTATORS=1 CRASHOUT_TLS_KEY=/chemin/table-key.pem CRASHOUT_TLS_CERT=/chemin/table-cert.pem npm start
```

- **Table**. Ouvrir le lien privé imprimé à côté de « Local » dans Terminal. Recharger la page si le serveur a été redémarré. Le QR de l’accueil donne accès à **Jouer** et à **Regarder la course**.
- **Pilote PC**. Ouvrir le lien « Pilote PC », prendre la place cyan et lancer la course. Les flèches gauche et droite braquent. La flèche haut accélère en mode pédale. Choisir **Vue · Cockpit** pour l’essai à la première personne. Un changement d’onglet relâche les commandes clavier.
- **Pilote téléphone**. Scanner le QR avec le téléphone sur le même réseau, tourner l’appareil en paysage, autoriser le capteur et attendre le calibrage. La vue cockpit limite la visibilité à l’approche du prochain virage. La table donne la position du reste des voitures et des interventions.
- **Spectateur**. Ouvrir le lien annoncé par le serveur dans un autre onglet ou sur un deuxième appareil. Choisir **Circuit entier**, **Survol** ou **Poursuite plongeante**. En partie à deux équipes, choisir la voiture cyan ou rose. Utiliser une fenêtre distincte pour garder le jeu clavier au premier plan pendant l’observation.

Grand Prix est le thème initial de l’essai solo. L’ambiance de la table se propage aux autres écrans pendant la course. Le navigateur charge le module 3D à la première utilisation. Si WebGL 2 est indisponible, la carte 2D reste accessible. Les cibles de fluidité sur Safari iPhone et Chrome Android se mesurent sur appareils physiques.

### Tableau de bord du pilote et ambiances

Le [menu des essais locaux](http://localhost:3000/test) réunit la table, le pilote mobile, le pilote clavier et le spectateur. Un seul appareil prend la place solo. **Quitter l’essai** ou fermer l’onglet libère immédiatement la place et ramène le salon à l’accueil. Les places de la session standard gardent leur délai de reconnexion.

En mode **Avance auto**, le gyroscope dirige la voiture en paysage. **Mode pédale** donne accès à deux boutons de braquage et à une commande d’accélération. Le gyroscope reste utilisable dans ce mode. Le volant central suit la commande de direction et le cockpit occupe tout le cadre du navigateur. **Réglages** donne accès au plein écran natif quand le navigateur le propose, au recalibrage et, en essai solo, au choix de l’ambiance.

Pour comparer les thèmes, change d’ambiance dans **Réglages** pendant une course, puis passe en poursuite pour regarder le décor. Les objets animés restent dans des emplacements extérieurs à la chaussée, les nuances de bordure suivent la géométrie du serveur et les effets d’ambiance s’atténuent avec la préférence de mouvement réduit ou la baisse de qualité.
