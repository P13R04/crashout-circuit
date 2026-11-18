# Télécommandes Wii pour le pilote : décision

Issue [#54](https://github.com/QuentinELLEON/crashout-circuit/issues/54) (numéro du fork). **Statut : décision proposée, à relire par l’équipe.** Aucune mesure sur une manette réelle n’a encore été faite : toute case sans chiffre mesuré est marquée **à mesurer**, et les valeurs « calculées » viennent du code ou d’une hypothèse écrite à côté.

## Ce qui a été livré pour trancher

Un essai fonctionnel de la piste A (WebHID), à côté du front téléphone. Les règles de jeu et le protocole ne changent pas ; le serveur gagne seulement une route `/wiimote` et la possibilité de lancer le solo sans variable d’environnement (voir plus bas).

| Élément | Où |
|---|---|
| Page du pilote Wii | `client-wiimote/` (`index.html`, `main.ts`) |
| Lecture HID : rapports bruts → boutons, accélération, batterie (pur) | `client-wiimote/hid/` |
| Ouverture WebHID, mode, LED, vibration, reconnexion (API injectée, testable) | `client-wiimote/device/` |
| Angle de volant, filtre passe-bas, neutre, direction (pur) | `client-wiimote/steering/` |
| Source de commandes : boutons + direction | `client-wiimote/control/` |
| Fonction de courbe de direction et cadence d’envoi **partagées avec le téléphone**, qui garde ses valeurs (zone morte ±3°, maximum ±35°, exposant 1,3, lissage 0,25). La manette a sa propre courbe, voir « Réglage après les premiers essais » | `client-shared/pilot/steeringCurve.ts`, `inputCadence.ts` |
| Interface « source de commandes » et couche réseau du pilote | `client-shared/pilot/pilotCommandSource.ts`, `pilotLink.ts` |
| Séance (code, place `A-pilot`/`B-pilot`, jeton, reconnexion) | `client-shared/playerSession.ts` (déplacé depuis `client-phone/session.ts`, qui reste en façade) |
| Tests | `npm run test:wiimote` (4 scripts dans `scripts/wiimote/`, ajoutés à `check` et `verify`) |
| Protocole d’essai à suivre sur la manette | [pilote-wiimote-protocole-essai.md](pilote-wiimote-protocole-essai.md) |

**Le téléphone n’est pas modifié dans son comportement.** `gyro.ts` réexporte la courbe et la cadence qui vivaient chez lui ; `scripts/phone/gyro.ts` passe sans changement. Le front Wii n’importe ni `gyro.ts`, ni `wheelSensor.ts`, et ne demande aucune autorisation `DeviceOrientation`.

**Le protocole ne change pas.** Le front Wii envoie les mêmes messages que le téléphone : `Join` (place), `PilotInput` (`team`, `throttle`, `steer` normalisé entre −1 et 1, le serveur applique `steerGain` = 1,12), `PadHold` (réparation), `ToggleDriveMode` et `StartSolo`. Le serveur a reçu **trois petites modifications**, demandées après l'essai :

- **Route `/wiimote`** dans `server/index.ts`, comme `/play`, qui sert `client-wiimote` (construit par Vite). La page reste aussi disponible par `npm run dev:clients` (`http://localhost:5173/client-wiimote/index.html`).
- **Solo sans variable d'environnement.** `StartSolo`, envoyé par le pilote A, active le mode solo **seulement à l'accueil, si aucune autre place n'est prise** et sans tutoriel ; il est ignoré sinon. `resetToLobby` (retour à l'accueil depuis la table) revient au réglage du serveur : sans `CRASHOUT_SOLO_TEST=1`, le mode normal revient et le pilote garde sa place. Les téléphones ne sont pas touchés : ils n'envoient `StartSolo` qu'en mode solo.
- **Bouton « MANETTE WII » sur l'accueil de la table** (`client-table`), qui ouvre `/wiimote` dans une autre fenêtre à la levée du doigt, sans quitter la table.

### Correspondance des boutons (écart avec la proposition initiale)

| Entrée | Effet | Remarque |
|---|---|---|
| Inclinaison | Direction | Courbe propre à la manette : zone morte 4°, pleine direction à 50° (réglable de 30° à 90°), exposant 1,5 |
| B (gâchette) | Accélérateur | Compte en mode PÉDALE ; en AUTO, la voiture avance seule |
| A | **Réparer** (maintenu) | Pad de réparation du pilote, indispensable pour redémarrer |
| 1 | Bascule AUTO / PÉDALE | Une pression, une bascule |
| Home | Recalibrer le neutre | |
| 2, +, − | Rien | Évite les appuis involontaires |

**A ne peut pas être POWER.** Le serveur refuse `Power` venant d’une place pilote (`server/net/playerCommands.ts` : `if (!pilot)`), car POWER appartient au copilote. Le protocole n’a ni frein ni marche arrière (`PilotInput` ne porte que `throttle` et `steer`) : 1 et 2 n’ont donc pas de rôle de frein.

## Tableau comparatif

Légende : **mesuré** (rien pour l’instant), **calculé** (d’après le code ou une hypothèse écrite), **doc** (fiche publique, à confirmer), **à mesurer**.

| Critère | Téléphone (état actuel) | Wiimote seule | Wiimote + MotionPlus (Wii Remote Plus) |
|---|---|---|---|
| **Capteur** | Orientation fusionnée par le système (`DeviceOrientation`) | Accéléromètre 3 axes seul : inclinaison par la gravité, pas de lacet | Accéléromètre + gyroscope (MotionPlus intégré) |
| **Précision de l’angle** | à mesurer | Accéléromètre 8 bits, repos autour de 128, environ 25 unités par g (doc, **à confirmer**) : un pas vaut environ 2 à 3° (calculé). La zone morte de ±4° de la manette équivaut à environ deux pas. Un 10 bits existe en mode 0x31 (non implémenté, à vérifier) | Même accéléromètre. Le gyroscope n’apporte rien au roulis tant qu’on ne l’active pas (registres d’extension, **non implémenté**) ; sa précision est à mesurer |
| **Dérive et secousses** | Pas de dérive visible attendue (à confirmer) | Aucune dérive, mais une secousse fausse l’angle : rapports rejetés si la norme s’écarte de plus de 35 % du repos, angle lissé par un filtre adaptatif « 1 € » (très lissé au repos, presque pas en mouvement) ; la manette n’est pas mesurée quand moins de 0,5 g tombe dans son plan | Le gyroscope pourrait filtrer les secousses mais demande une fusion à écrire |
| **Latence mesurée** | **à mesurer** (filtre de direction α = 0,25 à environ 60 mesures/s, soit environ 58 ms de constante de temps, calculée) | **à mesurer** (Bluetooth HID + WebHID + filtre adaptatif + WebSocket local ; traitement logiciel simulé à environ 15 ms au milieu d’un geste rapide, voir « Réglage après les premiers essais ») | **à mesurer** |
| **Cadence de lecture** | à mesurer | Rapports 0x31 environ 100 par seconde (doc, à mesurer sous Windows). Mode par changement : une manette immobile ne rapporte rien ; `?continuous=1` demande l’envoi continu | idem |
| **Appairage** | Aucun : Wi-Fi, QR ou code de séance | Bluetooth, manuel sous Windows, sans code PIN (voir plus bas) ; **à tester avant une démonstration publique** | idem ; la reconnaissance se fait par `productId` 0x0330 (`RVL-CNT-01-TR`), 0x0306 pour la Wiimote seule |
| **Coût** | 0 € (téléphones des joueurs) | **à relever** (manette d’occasion, adaptateur Bluetooth si le PC n’en a pas) | **à relever** |
| **Navigateurs** | Chrome et Safari mobiles ; iOS exige HTTPS et une autorisation (#39) | WebHID : Chrome et Edge de bureau uniquement, absent de Firefox et Safari ; contexte sécurisé obligatoire (`http://localhost` ou HTTPS, pas une IP en HTTP) ; geste utilisateur pour la première autorisation | idem |
| **Accessibilité** | Écran tactile à regarder en permanence ; rotation paysage ; vues #42, #43, #49 possibles | Tenue à deux mains à l’horizontale, boutons 1 et 2 à droite ; on lève les yeux vers la table ; vibration et LED ; pas d’écran pour les vues ; geste inconfortable pour certains poignets (à observer) | idem |
| **Autres limites** | | Pas de lacet mesurable ; une manette en veille se reconnecte par un appui sur un bouton | idem |

## Réponses aux six questions de l’issue

1. **Périmètre.** Direction du pilote, plus les trois commandes qui lui appartiennent déjà : accélérateur (B, en mode PÉDALE), réparation (A) et bascule AUTO/PÉDALE (1). Le **boost et POWER restent hors périmètre** : POWER est refusé côté serveur pour un pilote, et le boost est un geste de la table reconnu par `GestureRecognizer`, pas une secousse. Les gestes du copilote n’ont pas de rapport avec cette manette : ils exigent des contacts sur la dalle.
2. **Remplacement ou ajout.** Une place est tenue par une seule connexion : une manette sur la page Wii **remplace** le téléphone sur cette place (`seat-taken` sinon). Le pilote perd alors les vues périphérique, 1re et 3e personne (#42, #43, #49) et regarde la table. Un téléphone « vue seule » à côté demanderait une autre fonction (spectateur, #53). Pour l’équipe, la question devient : **la manette est-elle une option par place** (recommandé, voir la décision) ou le nouveau défaut.
3. **Capteurs.** La Wiimote seule suffit pour la direction par roulis ; le lacet n’est pas mesurable. Le gyroscope (MotionPlus ou Wii Remote Plus) n’est pas utilisé : il serait utile pour fusionner avec l’accéléromètre en cas de secousses, et demande d’initialiser l’extension. **Matériel réellement disponible : à confirmer par l’équipe** ; le moniteur `tools/wiimote-monitor` affiche le `productId` (0x0306 ou 0x0330).
4. **Liaison.** Une passerelle est nécessaire : un navigateur Chrome ou Edge de bureau, avec Bluetooth, qui ouvre `client-wiimote` et parle à `/ws/player`. Elle peut tourner sur la machine de la table (une fenêtre par pilote) ou sur un portable par pilote. Aucune dépendance native ni serveur ajouté : le dépôt garde `ws` seul à l’exécution. Sur une autre machine que la table, WebHID exige HTTPS (#39 le fournit).
5. **Appairage.** Faisable sous Windows mais manuel, **sans garantie de fiabilité tant qu’il n’a pas été répété** (voir ci-dessous).
6. **Retours.** Vibration : implémentée, continue tant que la voiture du pilote est en panne pendant la course, arrêtée à la réparation. LED : numéro de joueur (LED 1 pour l’équipe cyan, LED 2 pour la rose), allumée une fois la place confirmée. Boutons : A répare, B accélère, 1 bascule le mode ; A/B ne peuvent pas porter boost et POWER (voir plus haut). L’effet réel de la vibration sur la perception de la réparation à deux est **à observer en essai**.

## Appairage sous Windows

Le code PIN demandé par Windows n’est pas saisissable pour une Wiimote : il faut passer par « Devices and Printers ».

1. Ouvrir `control printers` (Win + R), puis **Ajouter un appareil**.
2. Retirer le cache des piles et appuyer sur le **bouton rouge SYNC** sous les piles : les quatre LED clignotent.
3. Choisir la manette (nom `Nintendo RVL-CNT-01` ou `-TR`), puis **Pair without using a code**.
4. Ouvrir `tools/wiimote-monitor/index.html` (ou la page Wii) sur `http://localhost` dans Chrome ou Edge, cliquer sur **Connecter**, choisir la manette.
5. La manette se met en veille et se reconnecte par un appui sur n’importe quel bouton ; la page la rouvre sans nouvelle autorisation (événement `connect` de WebHID, ou bouton **Reconnecter**).

**À tester avant une démonstration publique :** appairer deux manettes en même temps, éteindre et rallumer, laisser dormir plusieurs minutes, redémarrer le PC, vérifier si Windows oublie l’appairage. Les résultats vont dans le tableau du protocole d’essai.

## Décision proposée (à relire par l’équipe)

**Ajouter la manette comme entrée pilote facultative, par place, et garder le téléphone comme entrée par défaut.** Ne pas remplacer le téléphone tant que les mesures ci-dessous ne sont pas faites.

Raisons :

- Elle répond aux deux notes de la séance : le pilote lève les yeux vers la table, et la manette peut vibrer quand la voiture est en panne.
- Le coût d’intégration est déjà faible : même protocole, même courbe de direction, aucun nouveau message, pas de dépendance d’exécution ; le serveur n’a reçu qu’une route et le démarrage du solo à la demande.
- Le téléphone reste nécessaire : seul à offrir les vues #42, #43, #49 et un appairage sans manipulation Windows.
- La manette a des limites réelles : pas de gyroscope utilisé, accéléromètre de 8 bits (pas d’environ 2 à 3°, calculé), secousses qui faussent l’angle, WebHID limité à Chrome et Edge de bureau, appairage manuel et fragile, une machine Bluetooth par pilote ou une fenêtre de plus sur la table.

Critères pour passer de « ajouter » à une recommandation ferme (seuils proposés **[EST]**, à valider avec l’équipe) :

| Critère | Seuil proposé |
|---|---|
| Écart de direction manette / téléphone sur le même geste | à définir après la première mesure ; à titre de départ, moins de 0,15 en valeur absolue aux angles 10°, 20° et 35°, **en tenant compte de la courbe propre à la manette** (elle est volontairement plus douce que celle du téléphone) |
| Latence appui → effet visible sur la table | pas pire que celle du téléphone mesurée de la même façon |
| Direction conduisible sans corriger en permanence | trois tours complets sans sortie de piste imputable à la manette |
| Appairage | trois essais d’appairage et de reconnexion de suite sans intervention technique |
| Deux pilotes en même temps | deux fenêtres, deux manettes, pas de croisement des commandes |

## Issue d’implémentation (brouillon, à ouvrir si la décision est « ajouter »)

**Titre :** Pilote : ajouter la manette Wii comme entrée facultative (WebHID)

**Contexte.** L’essai de #54 (`client-wiimote/`) lit une Wiimote en WebHID et pilote une place `A-pilot` ou `B-pilot` avec les messages existants. Cette issue le rend utilisable en séance. Voir `docs/pilote-wiimote-decision.md`.

**À faire**

- Valider sur la table le bouton « MANETTE WII » (placement, ouverture de la fenêtre, popup autorisée) et la bascule en solo à l'accueil.
- Documenter dans le README : navigateurs (Chrome, Edge de bureau), contexte sécurisé, appairage Windows, lancement de deux fenêtres pour deux pilotes.
- Ajouter le lien et le QR « manette » à l’accueil de la table, si l’équipe le souhaite.
- Reprendre les valeurs mesurées pendant l’essai : axes et signe par défaut (`grip`, `flip`), échelle de l’accéléromètre (calibration d’usine en mémoire 0xA20016 si 25 unités/g est inexact), mode de rapports (par changement ou continu).
- Décider si Home doit aussi servir au recalibrage en course, et si 2, + et − gardent « rien ».
- Option : lire le gyroscope de la Wii Remote Plus pour filtrer les secousses.
- Option : afficher à la table que la place est tenue par une manette (retour social).
- Option : décrire le rattachement du front téléphone à `PilotCommandSource`, pour que les deux entrées partagent `PilotLink`.
- Compléter `docs/guide-du-code.md` (nouveaux dossiers) et `context.md`.

**Hors périmètre.** Plus de deux manettes, les vues #42, #43, #49 sur un autre écran, boost et POWER à la manette, retrait du téléphone.

**Critères d’acceptation**

- Deux pilotes, chacun avec sa manette dans sa fenêtre, conduisent une course complète sur la table.
- La perte d’une manette neutralise sa voiture en moins de `pilotInputTimeoutMs` et affiche « manette perdue, appuyer sur un bouton puis Reconnecter » ; la reconnexion reprend la conduite.
- `npm run check` reste vert, dont `npm run test:wiimote` et `npm run check:sizes`.
- Le tableau du protocole d’essai est rempli et les critères de la décision sont atteints.

**Dépendances.** #38 (places pilote et copilote), #39 (HTTPS, nécessaire hors `localhost`), #41 (gyroscope actuel, dont la courbe de direction est partagée), epic #48. Voir aussi #54 (cette décision) et #53 si un téléphone « vue seule » est voulu.

*Numéros : ceux du fork. Pour l’amont, ajouter 14 aux numéros de téléphone (voir `docs/gantt-crashout-circuit.html`).*

## Réglage après les premiers essais (18 novembre 2026)

Les testeurs ont signalé deux défauts : **la manette est trop sensible** (un petit mouvement envoie la voiture loin d’un côté) et **un délai entre la manette et la voiture**. Les chiffres ci-dessous viennent d’une **simulation** sur le même geste (rampe en cosinus, quantification 8 bits, bruit ajouté), pas d’une mesure sur la manette. Elle reste à confirmer avec le protocole d’essai.

**Sensibilité.** La manette réutilisait la courbe du téléphone (pleine direction à 35°, zone morte de 3°). Un poignet tourne moins qu’un téléphone, et la direction règle la vitesse de rotation de la voiture : une direction même moyenne tenue une seconde la fait beaucoup tourner. Changements :

| | Avant | Après |
|---|---|---|
| Zone morte | 3° | 4° |
| Angle de pleine direction | 35° | 50°, **réglable de 30° à 90° par un curseur** sur la page (mémorisé par le navigateur, ou `?range=`) |
| Progressivité | exposant 1,3 | exposant 1,5 |
| Direction pour 10° d’écart | 0,14 | 0,04 |
| Direction pour 25° d’écart | 0,61 | 0,32 |

Deux autres causes possibles de sensibilité ont aussi été corrigées : (1) le neutre est maintenant mesuré **manette immobile** (la mesure repart de zéro tant que l’angle bouge de plus de 4°), au lieu de se figer pendant qu’on prend la manette en main ; (2) la manette n’est plus lue quand moins de 0,5 g tombe dans son plan (0,15 g auparavant) : un seul pas de l’accéléromètre y déplaçait l’angle de plus de 15°, ce qui faisait « sauter » la direction quand la manette n’était pas bien droite.

**Délai.** Le Bluetooth n’est qu’une partie du délai. Le logiciel en ajoutait une autre, qu’on peut réduire :

| Étape | Avant | Après |
|---|---|---|
| Lissage | passe-bas sur chaque axe (constante de temps ≈ 28 ms) puis lissage de la direction (≈ 35 ms à 100 rapports/s) | un seul filtre adaptatif « 1 € » sur l’angle : fort au repos, quasi nul en mouvement |
| Envoi vers le serveur | au plus 30 par seconde | au plus 60 par seconde (≈ 50 mesurés en balayage dans le navigateur) |
| Temps pour atteindre 50 % puis 90 % de la valeur finale (geste de 0 à 40° en 150 ms, simulé) | 130 ms puis 190 ms | 100 ms puis 140 ms (indicatif : chaque chaîne est comparée à sa propre valeur finale, 1,0 avant et 0,7 après à 40°, puisque la courbe a changé) |

Ce qui reste et **ne peut pas se corriger dans le code** : le trajet Bluetooth et le pilote Windows, la diffusion de l’état à 30 par seconde par le serveur et le rendu de la table, communs au téléphone. Pour réduire la part Bluetooth : adaptateur USB Bluetooth 4 ou plus, branché près de la manette sur un port USB 2 (éviter les ports USB 3 voisins, qui brouillent le 2,4 GHz), pas de gros fichier transféré par Wi-Fi 2,4 GHz pendant la partie, aucun autre périphérique Bluetooth actif, piles neuves, fenêtre de la page Wii au premier plan et visible (un onglet masqué est ralenti par le navigateur), et dans le gestionnaire de périphériques Windows décocher « Autoriser l’ordinateur à éteindre ce périphérique » sur l’adaptateur. Rien de tout cela n’est mesuré ici.

Mesure à faire : refaire le §4 du protocole (caméra au ralenti) avant et après ces réglages, et chercher la valeur du curseur qui convient aux testeurs.

## Ce qui n’est pas vérifié

- Aucune manette réelle n’a encore été branchée : axes, signe, échelle de l’accéléromètre, latence, appairage, vibration et LED ne sont validés que contre le code et des tests à octets fixes.
- Les tests simulent la manette (faux périphérique HID) ; un essai de bout en bout a été fait dans le navigateur intégré avec un faux périphérique, contre le serveur en mode solo : place prise, direction envoyée avec la courbe attendue, perte puis reconnexion.
- La route `/wiimote`, le solo sans variable d’environnement et le bouton de l’accueil ont été vérifiés dans le navigateur intégré (clic réel sur le bouton, page servie par le serveur de production, partie lancée), mais pas sur la dalle tactile ni avec une vraie manette.
