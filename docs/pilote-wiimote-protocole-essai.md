# Pilote à la manette Wii : protocole d’essai

À suivre avec une vraie manette pour remplir les cases « à mesurer » de [pilote-wiimote-decision.md](pilote-wiimote-decision.md). Durée prévue : environ 1 h 30 pour une personne, 2 h avec un second pilote. Matériel : un PC Windows avec Bluetooth, Chrome ou Edge, une ou deux manettes (`RVL-CNT-01` ou `RVL-CNT-01-TR`), un téléphone de pilote déjà utilisable (#41), un second écran ou un téléphone pour filmer au ralenti.

## 1. Préparer

1. Appairer la manette sous Windows (voir « Appairage sous Windows » dans la décision). Noter chaque obstacle dans le tableau 6.
2. Construire et lancer le serveur normalement (aucune variable d'environnement : le solo se lance depuis la page Wii) :

```bash
npm run build
```

```bash
npm start
```

3. Sur la machine du serveur, dans Chrome ou Edge, ouvrir la table `http://localhost:3000/` et cliquer sur **MANETTE WII** (ouvre `http://localhost:3000/wiimote` dans une autre fenêtre), ou ouvrir directement `http://localhost:3000/wiimote`. Sans build, `npm run dev:clients` sert aussi la page sur `http://localhost:5173/client-wiimote/index.html`.
4. Cliquer sur **Connecter la manette**, puis sur **Lancer une partie solo** : la page vérifie que la manette est connectée, relève le code de séance sur le serveur, prend la place `A-pilot` et envoie `StartSolo`, comme après le scan du QR code avec le téléphone. Le bouton est grisé tant que la manette n'est pas connectée. Le serveur n'accepte le solo qu'**à l'accueil, sans autre joueur assis** ; sinon la page affiche « Le serveur a refusé le lancement ». Un retour à l'accueil depuis la table (bouton Accueil des paramètres, ou résultat → nouvelle partie) termine le solo. Sur une autre machine que celle du serveur, WebHID exige HTTPS : utiliser la configuration de #39.

Réglages d’essai par l’adresse : `grip=face` (par défaut, face tournée vers le joueur comme un volant) ou `grip=flat` (à plat, face vers le haut) ; `flip=1` pour inverser le sens ; `continuous=1` pour demander des rapports en continu. Le panneau **Réglages d’essai** de la page fait la même chose en direct.

## 2. Valider les axes et le signe avec le moniteur

Ouvrir `tools/wiimote-monitor/index.html` (en `http://localhost`, ou via un serveur statique : WebHID refuse `file://`), **Connect Wiimote**, mode `0x31`. Pour chaque geste, lire Accel X, Y, Z et recopier.

| Geste (boutons 1 et 2 à droite) | X | Y | Z | Attendu pour `grip=face` |
|---|---|---|---|---|
| Face vers le joueur, manette droite comme un volant | | | | une seule des valeurs X ou Y s’écarte nettement de 128 (la verticale) ; l’autre reste proche de 128 |
| Inclinée de 45° dans le sens des aiguilles d’une montre | | | | l’autre valeur s’écarte de 128 |
| Inclinée de 45° dans l’autre sens | | | | l’écart change de signe |
| À plat, face vers le haut | | | | Z s’écarte nettement (environ 128 plus 25) ; X et Y proches de 128 |
| Secouée | | | | les trois valeurs varient fortement |

Décisions à noter :

- **Échelle** : valeur de Z à plat face en haut moins 128 = unités par g (25 supposé). Noter l’écart pour chaque axe.
- **`grip`** : `face` si le geste « volant » donne un angle propre dans les axes X et Y ; sinon essayer `flat`.
- **`flip`** : si la direction part dans le sens contraire du geste, cocher **Inverser le sens**.

## 3. Comparer la valeur de direction avec le téléphone, sur le même geste

La page Wii affiche en direct la direction (−1 à 1), l’angle en degrés et les mesures brutes. Le téléphone n’affiche pas sa direction : relever ce qu’il envoie avec ce fragment, à coller dans la console du navigateur de la page de pilotage (Chrome pour Android via `chrome://inspect`, Safari via l’inspecteur Web d’un Mac ; sur la page Wii, la console de Chrome suffit) :

```js
window.__steer = [];
const send = WebSocket.prototype.send;
WebSocket.prototype.send = function (data) {
  try { const m = JSON.parse(data); if (m.type === 'PilotInput') window.__steer.push([Math.round(performance.now()), m.steer, m.throttle]); } catch {}
  return send.call(this, data);
};
// Plus tard : copy(window.__steer.map(r => r.join(',')).join('\n'))
```

Protocole : tenir la manette et le téléphone dans la même main (ou fixés ensemble avec un élastique, écran du téléphone en paysage), recalibrer les deux (Home pour la manette, **Calibrer** pour le téléphone) dans la même position droite, puis faire les gestes ci-dessous en gardant chaque position 3 secondes, avec un inclinomètre (application de smartphone) pour connaître l’angle réel.

| Geste | Angle réel | Direction téléphone | Direction manette | Écart | Remarque |
|---|---|---|---|---|---|
| Neutre | 0° | | | | |
| Dans la zone morte | 2° | | | | doit rester proche de 0 |
| Droite | 10° | | | | |
| Droite | 20° | | | | |
| Droite | 35° | | | | doit saturer vers 1 |
| Gauche | 20° | | | | signe opposé |
| Gauche | 35° | | | | doit saturer vers −1 |
| Retour au neutre | 0° | | | | temps de retour |

La manette a **sa propre courbe**, plus douce que celle du téléphone (zone morte 4°, pleine direction à 50° par défaut) : pour 10° d’écart, elle donne 0,04 contre 0,14 pour le téléphone ; l’écart est voulu. Comparer donc la direction de la manette à la **courbe attendue** (`((angle − 4) / (angle de pleine direction − 4)) ^ 1,5`), et le sens et la symétrie avec le téléphone. Le seuil de la décision (**0,15 proposé, non validé**) s’applique à cet écart.

**Régler la sensibilité.** Le curseur « Sensibilité » de la page Wii règle l’angle de pleine direction de 30° (très sensible) à 90° (peu sensible), mémorisé par le navigateur. Faire essayer 40°, 50°, 65° et 80° aux testeurs sur le même circuit et noter la valeur qui leur convient, avec les sorties de piste (§4).

## 4. Mesurer la latence ressentie en course, puis la latence appui → effet

**Latence de bout en bout, appui → effet visible.** Filmer au ralenti (caméra à au moins 120 images par seconde) la manette et l’écran qui affiche la page de la table dans le même cadre. Appuyer sur **1** (bascule AUTO / PÉDALE), puis compter les images entre l’appui et le changement de mode sur l’écran. Répéter dix fois et noter la médiane et le pire cas. Refaire pareil avec le bouton **AUTO / PÉDALE** du téléphone. Ces deux mesures sont comparables : même serveur, même rendu.

| Entrée | Fps de la caméra | Essais | Médiane | Pire cas |
|---|---|---|---|---|
| Manette (bouton 1) | | | | |
| Téléphone (bouton Avance auto) | | | | |

**Latence ressentie en course.** Sur le banc solo : lancer la partie solo, faire trois tours avec la manette, puis trois tours avec le téléphone. Noter pour chaque entrée :

| Entrée | Sorties de piste | Tours finis | Note de précision (1 à 5) | Note de réactivité (1 à 5) | Fatigue du poignet | Remarques |
|---|---|---|---|---|---|---|
| Manette | | | | | | |
| Téléphone | | | | | | |

Questions à poser à la personne : « La voiture suit-elle ta main ou arrive-t-elle en retard ? » ; « As-tu regardé la table ou la manette ? » ; « Les virages serrés demandent-ils trop d’inclinaison ? ».

## 5. Retours, perte de la manette et deux pilotes

| Test | Attendu | Résultat |
|---|---|---|
| Voiture en panne (sortie de piste) | La manette vibre tant que la voiture est en panne, pendant la course |  |
| Réparation (maintenir A) | La vibration s’arrête quand la voiture repart |  |
| Place prise | LED 1 pour l’équipe cyan, LED 2 pour la rose |  |
| Appui sur Home | Le neutre est remesuré (état « calibration » puis « prêt ») |  |
| Poser la manette à plat | Plus de direction, message « Tiens la manette à l’horizontale » |  |
| Secouer | Message « Secousse détectée », l’angle revient après la secousse |  |
| Retirer une pile en course | « Manette perdue, appuyer sur un bouton puis Reconnecter » ; la voiture n’obéit plus en moins d’un quart de seconde (`pilotInputTimeoutMs` = 250 ms) |  |
| Remettre la pile, appuyer sur un bouton | Reconnexion automatique, sinon bouton **Reconnecter** ; neutre à remesurer |  |
| Laisser la manette dormir, puis appuyer sur un bouton | Reconnexion comme ci-dessus |  |
| Recharger la page | La manette se rouvre sans nouvelle fenêtre de choix |  |
| Masquer l’onglet pendant la course | Direction neutre aussitôt (par prudence : le navigateur ralentit un onglet masqué) |  |
| Deux pilotes (hors banc solo, serveur à l'accueil, sans solo en cours) | Deux fenêtres côte à côte (pas deux onglets d’une même fenêtre), chacune sa manette et sa place ; pas de commandes croisées |  |

Pour deux pilotes : démarrer le serveur à l'accueil, sans solo en cours, ouvrir la table `http://localhost:3000/`, ouvrir `client-wiimote` dans deux fenêtres de navigateur (ou deux navigateurs), choisir **Pilote Cyan** dans l’une et **Pilote Rose** dans l’autre. Chaque pilote a besoin de son copilote pour réparer (A seul ne suffit pas).

## 6. Appairage et fiabilité (Windows)

| Essai | Fait | Durée / remarque |
|---|---|---|
| Appairage première manette, sans code | | |
| Appairage seconde manette | | |
| Reconnexion après veille | | |
| Reconnexion après redémarrage du PC | | |
| Windows oublie la manette ? | | |
| Pile faible : valeur de batterie affichée cohérente | | |
| Distance maximale utilisable | | |

## 7. Ce qu’il faut mesurer à la main, en résumé

1. Modèle des manettes disponibles (`productId` 0x0306 ou 0x0330) et nombre.
2. Axes, signe et échelle de l’accéléromètre (§2) : choisir `grip` et `flip`.
3. Écart de direction avec le téléphone (§3).
4. Latence appui → effet pour la manette et pour le téléphone (§4).
5. Ressenti en course (§4) et fatigue.
6. Vibration, LED, perte et reconnexion (§5).
7. Fiabilité de l’appairage Windows (§6).
8. Coût des manettes et d’un adaptateur Bluetooth si besoin, à reporter dans le tableau de la décision.

Reporter les résultats dans la décision (cases **à mesurer**), puis dire à l’équipe si les critères de la décision sont atteints.
