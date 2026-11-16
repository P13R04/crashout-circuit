# Reprise du développement téléphone

## Socle vérifié

| Étape | Fonctionnement vérifié | Branche locale |
|---|---|---|
| [#38](https://github.com/QuentinELLEON/crashout-circuit/issues/38) | Quatre places, droits par rôle, jeton de reprise privé, expiration et commandes neutralisées à la déconnexion. Les clients table et Oz fonctionnent comme avant sur cette branche. | `38-session-distinguer-pilote-et-copilote` |
| [#39](https://github.com/QuentinELLEON/crashout-circuit/issues/39) | Serveur HTTP ou HTTPS sur le même port, WebSocket sécurisé, adresse publique optionnelle et adresses du réseau annoncées par `/api/session`. Certificat de test et erreurs de démarrage contrôlés automatiquement. | `39-reseau-servir-la-session-en-https` |
| [#40](https://github.com/QuentinELLEON/crashout-circuit/issues/40) | Le QR ouvre `/play?room=CODE`, puis l’interface joueur se connecte à `/ws/player`. Le choix du rôle, la concurrence pour une place et la reprise ont des tests réseau. La recette physique du lobby reste à faire. | `40-session-rejoindre-la-partie-par-qr-code` |
| Essai solo | Le pilote cyan rejoint seul, lance le circuit prédéfini depuis le téléphone, tourne avec les flèches et peut recommencer après une sortie. Chrome a décodé le QR de la table, ouvert l’adresse réseau, conduit et relancé après rechargement. | `test/40-pilote-solo` |

Les branches repartent de `quentin/main` et réutilisent le code des trois premières étapes de la première tentative. La [PR d’ensemble #36](https://github.com/QuentinELLEON/crashout-circuit/pull/36) reste une référence. La numérotation de ce document est celle du nouveau dépôt.

## Essayer en local

Sur la branche `test/40-pilote-solo`, depuis le dossier du projet, lancer les commandes suivantes.

```bash
npm ci
npm run build
CRASHOUT_SOLO_TEST=1 npm start
```

Ouvrir la table sur [localhost](http://localhost:3000/). Connecter le téléphone au même réseau, scanner le QR affiché, toucher **Rejoindre comme pilote**, puis **Lancer la course**. Regarder le circuit sur la table. La voiture avance quand le téléphone est au premier plan. Maintenir **Gauche** ou **Droite** pour tourner. **Recommencer** relance le même circuit. Garder le même onglet pour retrouver la place en cas de coupure.

Le lancement ci-dessus utilise HTTP et les commandes tactiles. Depuis la #41, configure un certificat approuvé ou un tunnel HTTPS pour activer le volant sur le téléphone. Sur Safari, touche **Activer le volant** et accepte l’accès au capteur. Garde ensuite le téléphone droit pendant la calibration. En course, **Avance auto** bascule vers le mode pédale. Dans ce mode, incline le téléphone vers l’avant ou maintiens **Accélérer**. [Configuration HTTPS](../README.md#https-pour-les-téléphones)

## Validation restante

- Sur le téléphone physique, vérifier que le Wi-Fi permet d’ouvrir l’adresse du QR, essayer les deux directions, faire une sortie de piste, recommencer et revenir à la page après verrouillage.
- La recette de la #39 et de la #41 se fait sur Safari iPhone et Chrome Android, via une adresse HTTPS de confiance. Vérifier gauche et droite en portrait et paysage, le recalibrage après rotation, le refus de permission, la pédale et la neutralisation lors du verrouillage de l’écran.
- Pour valider la #40, démarrer en mode standard et essayer le même QR à quatre, avec choix simultané d’une même place et reprise après une coupure. Le mode solo sert à tester la redirection et la conduite initiale.

## Prompts à reprendre après validation

### Valider l’entrée des joueurs en mode standard

> Travaille dans QuentinELLEON/crashout-circuit. Lis les issues #38, #39 et #40 et confirme les branches validées avant tout changement. Vérifie #40 sur sa propre branche en mode standard avec un QR commun, quatre places, deux demandes concurrentes et la reprise du même onglet après une coupure. Compare les résultats aux critères de l’issue et corrige uniquement les écarts de connexion. Présente les résultats et les essais physiques restants avant d’entamer #41.

### Ajouter le volant sur téléphone

> Après validation de #40, crée une branche dédiée à #41 dans QuentinELLEON/crashout-circuit. Lis les détails de #41. Teste la permission du capteur en HTTPS sur Safari iPhone et Chrome Android, la calibration, l’orientation de l’écran, la latence et le retour aux commandes tactiles. Vérifie la neutralisation à la mise en arrière-plan. Fais une démonstration avec la table et le mode solo, puis attends ma validation.

### Construire les vues du pilote, une issue à la fois

> Dans QuentinELLEON/crashout-circuit, commence par #42 sur une branche dédiée à partir du socle validé. Préserve l’intérêt de regarder la table en gardant la vue locale du pilote centrée sur les informations proches. Vérifie une course avec la vue 2D avant de passer à #43, puis #49, puis #44, sur une branche par issue avec validation entre chaque. #50 doit être validée avant #51 pour le thème Rétro. Lis les critères de l’issue en cours et consigne les mesures sur téléphone quand un appareil est disponible.

### Raccorder le copilote, puis l’accessibilité

> Après validation de #40, lis #45 dans QuentinELLEON/crashout-circuit et travaille sur sa branche. Vérifie d’abord l’armement, la réparation et la pose physique sur table. Après validation de #45 et de la carte #42, ouvre une branche distincte pour #46. Teste les mêmes règles de pose à distance et fais la recette avec VoiceOver et TalkBack. Présente les écarts avant d’élargir le périmètre.

### Recetter la partie complète

> Après validation des dépendances de #47, lis sa fiche dans QuentinELLEON/crashout-circuit. Joue une partie à quatre sur la vraie table et les téléphones. Documente les appareils, les résultats observés et les blocages. Vérifie les commandes `npm run check` et `npm run verify`, puis propose les PR dans l’ordre des dépendances.
