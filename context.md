# CRASHOUT — Fiche technique unique

Projet étudiant Polytech Nice Sophia, simulé en startup. Interface et disposition mises à jour au 26 octobre 2026. Les sections de conception historique sont signalées ci-dessous.
Soutenance finale: **à confirmer** (le contexte d'origine indique le 28 sept 2026, antérieur à la date du doc).

Fiabilité: **[OK]** vérifié source constructeur/littérature · **[EST]** estimation, valeur par défaut à régler en test · **[?]** non vérifié · **[DÉCISION]** choix arbitré entre sources contradictoires, à valider par l'équipe.

Cette fiche conserve les décisions de conception et leurs identifiants (R-xx, C-xx, E-xx, P-xx). Pour le prototype exécuté, le [README](README.md), les tests et les sources décrivent les commandes effectivement disponibles. Les variantes historiques (mobile, fantôme, destruction, secours Oz) ne sont pas des contrôles de l’interface actuelle.

---

## Évolution intégrée — console Oz (22 octobre 2026)

La console Oz gère uniquement le placement, la rotation et l’activation des tangibles. POWER appartient au copilote et arme les objets ramassés, dont le geste est neutre et volable. Le lancement, la pause et les outils de test PC restent sur la table. Le mode pédale, le lance-pierre à élastique et la création guidée du circuit intégrés dans `main` sont conservés. Le [README](README.md) décrit ces commandes actuelles ; les passages historiques ci-dessous sur UTILISER côté pilote ou les secours Oz sont dépassés.

## Évolution intégrée — interface et thèmes (26 octobre 2026)

- Pilote et copilote d’une même équipe occupent des coins opposés (§3). Les pads, docks et retours de gestes utilisent cette même disposition.
- **Paramètres → Ambiance** propose Néon et Ferraille ; choix local mémorisé, changement à chaud sans modifier les règles. Ferraille associe acier de récupération, vapeur, mécanismes vus de dessus et énergie cyan. Le code couleur cyan/rose des équipes reste stable.
- L’interface privilégie pictogrammes, halos et animations : stock relié à POWER, contacts requis pour le geste, réparation à deux, dock distinct. Les erreurs utiles et les consignes courtes de création de circuit sont conservées. Les outils PC sont rangés dans les paramètres.
- La console Oz reste consacrée aux tangibles. Les thèmes ne lui ajoutent aucun contrôle de bonus ou de partie.
- Voir [l’audit des textes](docs/lisibilite.md), [les thèmes](docs/themes.md) et [le rendu néon](docs/rendu-neon.md). La définition logique reste 1920 × 1080, affichée sans déformation ; les animations respectent pause et mouvement réduit.

## 1. Résumé en 10 lignes

- Jeu de course **2 équipes × 2 joueurs** sur une **table tactile 65"** posée à plat. Les deux équipes courent sur **le même circuit**.
- Chaque équipe: **1 Pilote** (station fixe, conduit sur la table) + **1 Copilote** (mobile autour de la table, agit sur la table).
- Le circuit est **généré** à partir de deux tracés partiels dessinés par deux joueurs, complétés automatiquement puis fusionnés.
- Le Copilote agit par gestes tactiles (lance-pierre et boost), par **objets tangibles** (poteaux électriques) et par **actions synchrones avec son Pilote** (réparation).
- Les objets ramassés en piste sont **armés par POWER au poste copilote de l’équipe propriétaire**, puis joués par un geste neutre qui peut être volé par l’autre équipe.
- Les tangibles sont **simulés par un Magicien d'Oz** (aucune reconnaissance d'objets sur cette table), mais émettent des événements au format TUIO → du vrai matériel pourra être branché sans toucher au gameplay.
- Moteur: **WebApp HTML/JS, pas Unity**. Serveur Node.js autoritaire.

### Décisions structurantes

| # | Décision | Choix |
|---|---|---|
| D1 | Moteur | WebApp. Navigateur plein écran sur la table. Canvas 2D (PixiJS si besoin de perf) |
| D2 | Serveur | Node.js + WebSocket, **autoritaire** sur la physique et les règles |
| D3 | Pilotage | **Table, station fixe** : un bouton central partagé bascule entre avance continue et pédale maintenue; bande de direction à deux zones franchissable + bouton d'action. Un tangible orienté pourra remplacer ces entrées sans changer la logique [DÉCISION] |
| D4 | Tangibles | Magicien d'Oz via une console web séparée. Format d'événements TUIO (`id`, `x`, `y`, `angle`) |
| D5 | Attribution des joueurs | On ne suit **jamais un doigt vers une personne**. L'équipe se déduit du contexte (zone, bouton d'équipe, objet armé par le Pilote) |
| D6 | Réparation | Action synchrone: **Pilote et Copilote posent chacun un doigt sur leur pad de station** (table). Remplace la « réparation localisée » [DÉCISION] |
| D7 | Table | iiyama ProLite TF6538UHSC-B2AG, PCAP 50 points, **aucune reconnaissance d'objets** |
| D8 | Industrialisation visée | Interactive Scape Scape Tangible / Scape X Module (TUIO natif) |

Argument de soutenance: le prototype valide les **interactions** sur du matériel à ~3 500 €. L'industrialisation branche une vraie reconnaissance d'objets sans réécrire le gameplay.

---

## 2. Contribution IHM revendiquée

Pas « intégrer des objets physiques dans un jeu de course » (Neon Racer, 2005).
Mais **étudier le couplage spatial simultané entre interactions tangibles concurrentes et gestes multitouch collaboratifs sur un même espace physique-numérique en temps réel**.

Principes de conception retenus:
- **Effet = fonction continue de la géométrie**, jamais un simple booléen (ex.: la force du boost dépend de la longueur réelle du segment tracé). Appui: Morris et al., CHI 2006.
- **Collaboration forcée**: au moins une action par course est impossible pour une seule paire de bras (la réparation synchrone). Appui: Piper et al., CSCW 2006 (SIDES).
- **Territorialité**: chaque équipe a sa station et son HUD. Appui: Scott, Carpendale, Inkpen, CSCW 2004.
- **Pas de « haut » sur une table**: chaque élément d'interface est orienté vers le bord le plus proche de son destinataire.

---

## 3. Joueurs, stations, disposition

| Rôle | Mobilité | Entrée principale | Station (table) |
|---|---|---|---|
| Pilote (×2) | **Fixe**, doit rester à sa station | Zones gauche/droite + bouton d'action sur la table | Pad de réparation + panneau HUD |
| Copilote (×2) | **Mobile** autour de la table | Doigts sur la table + tangibles | Pad de réparation + panneau HUD |

Disposition actuelle : chaque équipe est en diagonale, avec un joueur sur chaque grand côté de la table.

| Coin | Joueur | Couleur d'équipe |
|---|---|---|
| Bas-gauche | Pilote A | cyan |
| Bas-droite | Copilote B | rose |
| Haut-gauche | Pilote B | rose |
| Haut-droite | Copilote A | cyan |

Chaque coin porte un **panneau HUD** orienté vers son joueur (voir §11).

**R-01** Un Pilote ne quitte pas sa station.
**R-02** Un Copilote peut aller partout autour de la table, mais doit revenir à sa station pour toute action synchrone (réparation).
**R-03** Le système ne sait pas qui touche. L'équipe d'une interaction est déduite ainsi:
1. un **pad ou bouton de station** appartient à son équipe;
2. un **geste d'objet** (lance-pierre, boost) est attribué à l'équipe dont le Pilote a **armé** l'objet;
3. si les deux équipes sont armées en même temps, le geste va à l'équipe dont la station est **la plus proche du centre du geste** [EST];
4. un **tangible** est attribué par l'opérateur Magicien d'Oz (son identifiant fixe l'équipe, §8.2).

---

## 4. Déroulé d'une session (4–6 min, apprentissage ≈ 20 s sans notice)

| Temps | Phase | Contenu |
|---|---|---|
| 0:00 | `LOBBY` | Rôles attribués, joueurs aux quatre stations |
| 0:00–0:30 | `MAP` | Création de la carte (§5) |
| 0:30–4:30 | `RACE` | Course sur 3 tours [EST] ou limite de temps |
| pendant la course | — | Ramassage d'objets, actions, pannes, réparations |
| fin | `RESULT` | Classement, rotation des rôles, nouvelle partie |

**R-04** Victoire: première équipe qui termine **3 tours** [EST, réglable]. À 5:00 sans vainqueur, gagne l'équipe la plus avancée (tours puis checkpoints).
**R-05** Un tour valide exige de franchir tous les checkpoints dans l'ordre.

---

## 5. Création de la carte

### 5.1 Principe
Un joueur de l'équipe cyan place P1, puis un joueur de l'équipe rose place P2 : leur ligne partage la table en deux moitiés. Le premier point persiste après le retrait du doigt et n'expire pas. Le cyan trace P1→P2, puis le rose trace P2→P1 après validation du cyan. L'ordre et le sens sont imposés côté client et serveur ; un trait accepté est verrouillé. N'importe quel joueur de chaque équipe peut participer. La table ne reconnaît pas les personnes : elle attribue les contacts selon l'étape affichée. Les deux demi-tracés forment un circuit unique, généré uniquement sur confirmation manuelle.

Interprétation retenue de « ils se remplissent l'un l'autre »: chaque joueur remplit ses deux points, et le circuit final contient les deux contributions [?, à confirmer avec l'équipe].

### 5.2 Algorithme (déterministe, simple à coder)

| Étape | Règle |
|---|---|
| 1. Ligne de partage | Deux contacts successifs : P1 cyan puis P2 rose, espacés d'au moins 360 px, tous deux dans la zone de jeu (x 170–1750, y 300–780). P1 persiste sans expiration. Un P2 trop proche ou hors zone est refusé **avec un message**, sans effacer P1. Même règle sur table et PC (`checkDivider`). |
| 2. Tracé | Cyan P1→P2 dans le demi-plan gauche de la ligne, puis rose P2→P1 dans le demi-plan droit. Départ et dernier point dans les cercles visibles (rayon 95 px partagé entre rendu, gestes et serveur), longueur ≥ 150 px. Les tracés inversés sont refusés. La tolérance de côté existante reste de 40 % des points dans le demi-plan de l'équipe : le trait **peut** boucler sur lui-même ou franchir la ligne (circuit en 8). Un seul geste à la fois ; les tracés validés sont verrouillés. |
| 3. Fermeture | Les deux demi-tracés, accrochés exactement aux deux points communs, forment **directement la boucle fermée** : le circuit est le dessin. |
| 4. Amplitude | Le dessin est pris **tel quel**. Seulement si la boucle n'est pas roulable, les demi-tracés sont étirés latéralement **au minimum nécessaire** (90 → 150 px d'amplitude max, puis ×1,2 … ×2,2). Un petit écart de l'autre côté de la ligne (≤ 70 px) est replié (d' = \|d\|) ; un franchissement plus profond est conservé tel quel. |
| 5. Nettoyage | Rééchantillonnage (4 px), lissage gaussien **sans retard** (σ = 7 px) contre le tremblement de la main seulement, puis 256 points. Pas de filtre 1€ ni de relaxation : ils décalent et rétrécissent le tracé. Résultat mesuré : à plus de 140 px des deux ancres, le circuit passe à ≈ 1 px du dessin. |
| 6. Arrondi local | Seuls les virages trop serrés pour rouler (rayon < 50 px : les deux points d'ancrage, les épingles) sont arrondis par un raccord de Bézier tangent aux deux bras, choisi parmi plusieurs fenêtres/poignées pour **déplacer le dessin le moins possible** ; le reste du tracé n'est pas déplacé. Si le raccord ne suffit pas, lissage gaussien croissant par petits pas (σ 9 → 40 px). |
| 6 bis. Cas limites | **Auto-croisements** : un croisement net (≥ 40°, boucle ≥ 350 px de long) est valide : le circuit est alors une piste en 8 / à boucle, avec un carrefour ouvert (la piste est « une seule surface », les murs sont omis au croisement, départ et checkpoints sont écartés du carrefour). Une boucle trop petite pour être roulée est agrandie autour de son point de croisement jusqu'à l'être. Si la boucle n'est pas valide telle quelle, l'amplitude est augmentée (×1,2 … ×2,2), puis le dessin est **lissé de plus en plus fort, par petits pas** (σ 48 → 380 px, taille d'origine restituée) jusqu'à donner une boucle simple et roulable ; au pire l'ellipse la mieux ajustée. Le mélange miroir A/B (R-06), la boucle A seule puis le circuit prédéfini ne servent que si tout cela échoue (pratiquement jamais). Un circuit prédéfini est **annoncé** avant « Lancer la course » (`track.preset`). |
| 7. Largeur | Largeur de base 140 px, variable en fonction de la courbure (±30 px). Minimum 90 px (> 3× la largeur du véhicule) |
| 8. Géométrie | Bords par la normale (mur extérieur magenta, mur intérieur cyan), colliders |
| 9. Marquage | 8 checkpoints répartis, ligne de départ au premier point posé (P1), voitures côte à côte (±20 px de décalage latéral), 4 emplacements de pickups |

### 5.3 Validations
Rayon de courbure minimal · largeur > gabarit véhicule · pas de nœud ni de croisement rasant (une auto-intersection nette est permise) · pas de passage impossible hors carrefour · départ et checkpoints hors carrefour.
**R-06** Si une validation échoue: relancer le mélange avec poids 0,4 puis 0,6; si encore en échec, utiliser la boucle A seule. L'opérateur Oz peut aussi forcer un circuit de secours.

Pourquoi la table: le dessin seul marcherait sur tablette. Ce qui change ici, c'est que **deux personnes dessinent en même temps sur le même espace**.

---

## 6. Pilote

### 6.1 Contrôles (table, WebSocket)

| Contrôle | Entrée | Valeur envoyée |
|---|---|---|
| Direction gauche | Moitié gauche de la bande fixe pilote, maintenue et franchissable | `steer = -1` |
| Direction droite | Moitié droite de la bande fixe pilote, maintenue et franchissable | `steer = 1` |
| Pédale | Maintien sur la pédale du panneau pilote, seulement en mode PÉDALE | `throttle = 1`; relâchement = `throttle = 0` |
| Mode de conduite | Bouton central, partagé par la partie, disponible pendant la course | alterne `auto` / `pedal` |
| Bouton d'objet | Appui | `UseItem` (arme l'objet en stock) |

### 6.2 Véhicule (modèle simple)

| Paramètre | Valeur par défaut |
|---|---|
| Vitesse max avant | 260 px/s [EST] |
| Vitesse max en mode PÉDALE | 190 px/s [EST] |
| Frein / marche arrière | Aucun [DÉCISION] |
| Ralentissement sans pédale | 260 px/s² [EST] jusqu'à l'arrêt |
| Accélération | 320 px/s² [EST] |
| Vitesse de rotation max | 2,8 rad/s [EST] |
| Gabarit | 24 × 14 px |
| Sortie de piste | Chute : HP à 0, immobilisation puis réparation synchronisée au dernier checkpoint |

### 6.3 Points de vie (HP)

**R-07** HP max = 100.
**R-08** Le Pilote perd des HP **uniquement** à cause d'éléments posés ou lancés par l'équipe adverse:

| Source | Dégâts | Effet associé |
|---|---|---|
| Mur (poteau seul) | −10, puis 1 s d'invulnérabilité | Rebond |
| Arc électrique | −10 par franchissement | Vitesse ×0,5 pendant 1,5 s |
| Pierre du lance-pierre | −100 (une voiture à pleine santé est mise hors d'usage) | Étourdissement 1 s |

**R-09** Les éléments d'une équipe n'affectent jamais sa propre voiture (pas de tir ami). Ils sont affichés semi-transparents pour elle.
**R-10** À **HP = 0**, le véhicule est **hors d'usage**: il s'arrête et ne répond plus au Pilote, jusqu'à la réparation synchrone (§7.4).

---

## 7. Copilote: actions et objets

### 7.1 Vue d'ensemble

| ID | Action | Déclencheur | Entrée | Prio |
|---|---|---|---|---|
| C-01 | Lance-pierre | Objet **ramassé + armé** par le Pilote | 3 doigts : 2 appuis + 1 doigt tiré en arrière | P1 |
| C-02 | Boost (portail de vitesse) | Objet **ramassé + armé** par le Pilote | 2 doigts sur la piste | P1 |
| C-03 | Fantôme | **Indépendant** (recharge) | Bouton du panneau Copilote | P1 |
| C-04 | Destruction de mur | **Indépendant** (recharge) | Bouton + toucher un mur adverse | P1 |
| C-05 | Poteaux électriques | Objets **tangibles** (stock de 2 par équipe) | Pose sur la table (Magicien d'Oz) | P1 |
| C-06 | Réparation synchrone | Véhicule hors d'usage | Un doigt de chaque joueur sur son pad | **P0** |
| C-07 | Déformer localement la piste | Indépendant | Deux doigts proches tirent un même bord vers l'extérieur | P2 |

### 7.2 Objets ramassés en piste (pickups)

**R-11** 4 pickups apparaissent à des points fixes de la piste (marqués à la génération, §5.2 étape 9). Ils réapparaissent 15 s après ramassage [EST].
**R-12** Le Pilote qui roule dessus le **ramasse**. Un seul objet en stock; type tiré au hasard entre **lance-pierre** et **boost**.
**R-13** Pour utiliser l'objet: le Pilote appuie sur **UseItem** → l'objet est **armé** pendant 5 s [EST] (halo sur le panneau Copilote de son équipe). Le Copilote doit exécuter le geste correspondant dans cette fenêtre. Sinon l'objet est perdu.
**R-14** Il n'y a pas de pickup pour Fantôme, Destruction de mur et Poteaux.

### 7.3 Détail des actions

**C-01 Lance-pierre**
- Geste: **3 doigts** posés ensemble (cluster ≤ 150 px). **Deux appuis** forment la fourche ; le doigt qui s'en éloigne est la **poche** de l'élastique. Il est tiré vers l'arrière puis relâché (le premier doigt levé déclenche le tir). L'ordre de pose ne désigne aucun rôle : tant qu'aucun doigt ne s'est nettement éloigné (≥ 14 px et ≥ 1,5× chacun des deux autres), aucun rôle n'est affiché ; un doigt qui a simplement glissé à la pose perd le rôle de poche dès qu'un autre est tiré bien plus loin. Un contact annulé (`pointercancel`) ne tire pas. Un élastique est tracé entre les trois contacts, avec la ligne de vol et la zone d'atterrissage en aperçu.
- Direction: la pierre part de la poche, **à l'opposé de la traction**, et passe par le milieu de la fourche.
- Portée (fonction continue de la traction): de 220 px (traction 40 px, minimum) à 900 px (traction 260 px, maximum) au-delà de la fourche. Une traction plus courte que 40 px ne tire pas et laisse l'objet armé. Le point d'atterrissage reste dans la table.
- Effet: la pierre est **visible en vol** pendant **0,8 s**, puis frappe le point d'atterrissage. Un cercle rouge d'avertissement y est affiché pendant le vol, orienté vers le joueur adverse le plus proche (l'adversaire peut esquiver).
- Rayon d'impact 60 px [EST]. Touche uniquement la voiture adverse. Dégâts: voir R-08.

**C-02 Boost (zone d'accélération / portail de vitesse)**
- Geste: **2 doigts** posés sur la piste, écartés de 100 à 400 px. Le segment entre les deux doigts forme le seuil d'entrée d'une zone rectangulaire d'accélération (largeur 100–400 px, profondeur 60 px orientée dans le sens de la piste).
- Effet (fonction continue): intensité `k = clamp(longueur / 400, 0,3 ; 1,0)`. Une voiture alliée qui franchit le seuil ou pénètre dans la zone gagne **+80 % × k** de vitesse pendant 2 s [EST]. Détection volumétrique continue (franchissement du seuil ou présence dans le corridor orienté). Ne touche que la voiture alliée (l'adversaire l'ignore).
- Durée de vie de la zone: 8 s [EST].
- Animations IHM (lisibilité complète sans aucun texte):
  - *Apparition (0–450 ms)* : onde de choc radiale depuis le centre, déploiement progressif des rails de confinement latéraux et des bornes émettrices aux doigts.
  - *Flux directionnel actif* : chevrons néon animés en défilement continu (`>>>`) indiquant la direction de propulsion, rails lasers latéraux avec impulsions lumineuses, gradient d'énergie au sol teinté de la couleur de l'équipe et particules de vitesse.
  - *Expiration (dernières 2,5 s)* : clignotement à fréquence croissante, instabilité/crépitements électriques sur les bords et rétractation/dissipation finale.
  - *Traversée du véhicule* : déflagration sonique à l'impact (onde de choc radiale et cône d'expansion), puis traînée de propulsion supersonique (flammes de plasma double échappement à l'arrière, cône de Mach à l'avant et sillons de distorsion de vitesse) proportionnelle à l'intensité `k`.

**C-03 Fantôme**
- Activation: bouton du panneau Copilote. Aucun besoin du Pilote.
- Effet: la voiture alliée **traverse murs, poteaux et arcs adverses** pendant 3 s; recharge 20 s [EST].

**C-04 Destruction de mur**
- Activation: appui sur le bouton, puis toucher un **mur adverse** (poteau seul) dans les 3 s.
- Effet: ce mur est **désactivé 10 s**; recharge 15 s [EST].

**C-05 Poteaux électriques (tangibles)**
- Matériel: 2 objets par équipe, ids fixes (§8.2).
- 1 poteau posé = **mur** de 120 px de long, orienté selon `angle`.
- 2 poteaux de la même équipe posés, distance ≤ 500 px [EST] = **arc électrique** entre eux (remplace les deux murs).
- Les poteaux restent actifs tant qu'ils sont sur la table.
- Tout passe par le Magicien d'Oz (§9).

**C-06 Réparation synchrone**
- Condition: voiture hors d'usage (R-10).
- Geste: le Pilote pose un doigt sur **son pad de station** et le Copilote sur **le sien**, **simultanément**, maintenus 2 s [EST]. Les pads sont des disques de 160 px dans le panneau HUD de chaque coin.
- Si l'un lâche, la jauge retombe. À 100 %: HP restaurés à 60 [EST], la voiture repart du dernier checkpoint.
- Obligation de collaborer: le Copilote doit **revenir à sa station** (R-02).

**C-07 Déformation locale de piste (P2)**
- Geste: deux doigts posés près d'un même bord (≤ 130 px), tirés ensemble vers l'extérieur sur au moins 20 px. La ligne centrale se translate localement : les deux bords suivent et forment une double chicane, sans augmenter la largeur ni créer de zone cumulable.
- Une seule déformation est active à la fois. Un nouveau geste déclenche immédiatement la suivante pendant que la précédente se reforme progressivement; une marge de sécurité évite une chute injuste pendant ce retour.
- Recharge 20 s [EST]. À activer seulement si le temps le permet.

### 7.4 Budget de points tactiles
Copilote max 3 doigts (lance-pierre) + 2 pads (1 doigt par joueur) + 2 créateurs de carte (1 doigt chacun) + 2 pilotes (1 doigt de direction chacun) → **≤ 10 points simultanés**, y compris si le navigateur n'en expose que 10. Les zones pilotes restent dans leurs stations (D3).

---

## 8. Matériel et tangibles

### 8.1 Table iiyama ProLite TF6538UHSC-B2AG

| | |
|---|---|
| Diagonale / résolution | 65" (165 cm) · 3840×2160 4K UHD [OK] |
| Dalle | IPS LED, 500 cd/m² [OK] |
| Tactile | **PCAP 50 points** annoncés [OK] (nombre réel remontant au navigateur: [?], voir §12) |
| Format | **Open Frame**, trous de fixation, orientation « Face vers le haut » supportée [OK] |
| Verre | Bord à bord, anti-rayures, anti-reflet, certifié test de chute de bille [OK] |
| Carter / poids | Métal · 59,8 kg [OK] |
| VESA | 600×400 mm [OK] |
| Interfaces | 2×HDMI, DisplayPort, DVI, VGA, LAN, RS-232, USB, audio [OK] |
| Statut / prix | **EOL** [OK] · 4 777 € TTC catalogue, remisé 3 646 € TTC, hors stock [OK] |
| Successeur | ProLite TF6539UHSC-B1AG [OK] |

**Reconnaissance d'objets: AUCUNE** [OK]. C'est un écran tactile, pas une table tangible.

Pourquoi ce choix: 4K sur 65" pour environ un dixième du prix d'une table tangible · mode face-up supporté par le constructeur · open frame intégrable dans un meuble maison · verre et carter robustes en contexte public.
Risques: EOL (pas de réappro) · 59,8 kg, non transportable seul · **pas de PC intégré, à ajouter** · ventilation face-up à vérifier.

### 8.2 Tangibles

| ID | Équipe | Type |
|---|---|---|
| 1, 2 | A (cyan) | Poteau |
| 3, 4 | B (rose) | Poteau |

Forme d'événement TUIO conservée: `id`, `x`, `y`, `angle`.
Prototype: objets physiques simples (poteaux imprimés ou en acrylique) sans électronique; l'opérateur Oz reproduit leur position à distance.

---

## 9. Magicien d'Oz

Un opérateur humain hors du champ de vision des joueurs simule la reconnaissance des tangibles.

### 9.1 Console (page web séparée, sur une tablette)

| Élément | Fonction |
|---|---|
| Miniature de la piste cliquable | Poser ou déplacer un poteau à la position touchée |
| Sélecteur d'identifiant (1 à 4) | Choisit le poteau, donc l'équipe |
| Slider ou cadran d'angle | Émet `angle` |
| Bouton « retirer » par poteau actif | Émet `TangibleRemoved` |
| Boutons de secours | Déclencher un obstacle, un boost, une panne, élargir la piste, forcer un circuit de secours (§5.3) |
| Journal horodaté | Enregistre tous les événements émis, pour rejouer et analyser les sessions |

### 9.2 Protocole d'expérimentation
**R-15** L'opérateur est hors champ de vision des joueurs.
**R-16** La **latence de réaction** de l'opérateur est mesurée et **déclarée** dans les résultats. C'est une limite à assumer, pas à cacher.
**R-17** Un événement émis par l'opérateur et un événement d'une vraie table sont **identiques** pour le serveur.

---

## 10. Architecture et événements

```
[Table iiyama 65"]                    [Smartphones Pilotes]
 navigateur plein écran                web app (QR code)
 Pointer Events (doigts)               sliders pédale/joystick
        |  WebSocket                          |  WebSocket
        +----------------> Serveur Node.js <--+
                            |        ^
                            |        |  WebSocket
                            |   [Console Magicien d'Oz]
                            v
                   Couche d'événements de jeu
                   Logique + physique (serveur autoritaire)
                            |
                   Rendu Canvas 2D sur la table
```

**R-18** La couche d'événements est le **seul contrat** entre les entrées et le gameplay.
**R-19** Le serveur est autoritaire. Table et téléphones sont des clients.
**R-20** Repère de jeu logique: **1920×1080**, mis à l'échelle ×2 pour le 4K. Boucle physique 60 Hz, diffusion d'état 30 Hz [EST].

### 10.1 Messages (JSON, tous avec `type` et `t` = horodatage ms)

| Source → Cible | Message | Champs |
|---|---|---|
| Téléphone → serveur | `PilotInput` | `team`, `throttle`, `steer` |
| Téléphone → serveur | `UseItem` | `team` |
| Table → serveur | `StrokeDraw` | `creator`, `pts[]` |
| Table → serveur | `PadHold` | `team`, `role` (`pilot`/`copilot`), `on` |
| Table → serveur | `Slingshot` | `x`, `y`, `fingers`=3 |
| Table → serveur | `BoostGate` | `a{x,y}`, `b{x,y}` |
| Table → serveur | `Ability` | `team`, `kind` (`ghost`/`destroy`), `targetId?` |
| Table → serveur | `BorderPull` (P2) | `x`, `y`, `dx`, `dy` |
| Table → serveur | `StartTutorial` | `mode?` (`table`/`pc`, déduit du pointeur) |
| Table → serveur | `TutorialSkip` | `team` |
| Oz → serveur | `TangibleMoved` | `id`, `x`, `y`, `angle` |
| Oz → serveur | `TangibleRemoved` | `id` |
| Oz → serveur | `OzTrigger` | `kind`, `params` (secours) |
| Serveur → tous | `State` | `tick`, voitures, murs, arcs, portails, pierres, pickups, tours, phase |
| Serveur → tous | `Feedback` | `kind`, `x`, `y`, `team` (alertes, sons) |

Les gestes (3 doigts, 2 doigts, tracé) sont reconnus **côté navigateur de la table**, qui n'envoie que les messages sémantiques ci-dessus. L'équipe d'un message sans champ `team` est déduite selon R-03.

---

## 11. Interface actuelle

Vue de dessus partagée, repère logique 1920 × 1080, format 16:9 conservé. Le choix de thème est une préférence de présentation indépendante des entrées et des règles.

| Élément | Néon | Ferraille |
|---|---|---|
| Vide | Brume numérique, code sur plusieurs plans | Structures industrielles en profondeur, engrenages, presses, turbines et vapeur |
| Piste | Tablier opaque, LEDs neutres | Acier patiné, plaques irrégulières, chanfreins et épaisseur |
| Véhicules | Coques à deux réacteurs | Bolides blindés à quatre roues et deux propulseurs |
| Équipes | Cyan et rose | Cyan et rose |
| Tangibles | Murs métalliques et piliers lumineux | Barricades de récupération et bobines sans direction privilégiée |
| Bonus | Capsules à pictogrammes ; boost doré | Même vocabulaire de bonus |

**Panneaux de coin** orientés vers leur joueur, hors piste :

| Panneau | Contenu |
|---|---|
| Pilote | Direction continue, santé, tours, pédale optionnelle et pad de réparation |
| Copilote | POWER, stock, dock tangible, pad de réparation et contacts du geste armé |

Les états de réparation sont représentés par les deux contacts et un anneau de progression. POWER arme uniquement le stock ; l’activation d’un tangible reste sous la responsabilité d’Oz. Aucun bouton Fantôme ou Détruire n’est présenté.

**R-21** Les alertes sont locales : cible d’impact, icône de panne, halo du pad concerné. Les informations textuelles partagées indispensables sont orientées vers les deux grands bords ; les états des équipes sont dans leurs panneaux.
**R-22** La piste reste au centre, hors panneaux de commande. Les croisements restent des jonctions ouvertes ; les bordures lumineuses ne créent pas de faux obstacles.

---

## 12. Vérifications techniques (à mesurer)

| À mesurer | Seuil / question |
|---|---|
| **Points tactiles remontant au navigateur** | 50 annoncés, Windows + Chrome en expose souvent 10. Budget de §7.4 conçu pour tenir à 10. **Test prioritaire** |
| Latence doigt → rendu (aller-retour WebSocket inclus) | < 50 ms |
| Latence pilotage smartphone → rendu | < 80 ms (au-delà, injouable) |
| Latence de réaction du Magicien d'Oz | À mesurer et déclarer (R-16) |
| Palm rejection (bras posés, pad de station) | À caractériser |
| Tenue thermique en face-up prolongé | La ventilation d'un écran couché n'est pas celle d'un écran vertical |
| Canvas 4K, 60 fps, 2 véhicules + effets néon | À profiler; sinon rendre en 1080p upscalé |
| Attribution d'un geste quand les deux équipes sont armées (R-03.3) | À tester en conditions réelles |

---

## 13. Critères d'acceptation (base de tests)

| ID | Critère |
|---|---|
| T-01 | Deux joueurs placent P1 cyan puis P2 rose et tracent successivement cyan P1→P2 puis rose P2→P1 ; l'ordre et le sens sont bloquants ; après confirmation, un circuit valide est produit en < 3 s |
| T-02 | Un Pilote conduit via QR code sans installation; latence < 80 ms |
| T-03 | Un mur adverse retire 10 HP, avec 1 s d'invulnérabilité |
| T-04 | Deux poteaux alliés génèrent un arc électrique; la voiture adverse perd 10 HP et ralentit |
| T-05 | Un objet armé sans geste du Copilote dans les 5 s est perdu |
| T-06 | Le lance-pierre (2 appuis + 1 doigt tiré) lance une pierre visible ; l'avertissement est affiché 0,8 s avant l'impact et la portée croît avec la traction |
| T-07 | Le portail de boost est plus fort quand ses extrémités sont plus écartées |
| T-08 | Le Fantôme permet de traverser murs et arcs adverses 3 s, puis recharge de 20 s |
| T-09 | La réparation ne s'enclenche que si **les deux** doigts sont sur leur pad |
| T-10 | Un message `TangibleMoved` de l'opérateur et d'une vraie table donne le même résultat |
| T-11 | Le journal Oz permet de rejouer une session à l'identique |

---

## 14. Paramètres (tous modifiables en un seul fichier de config)

| Clé | Valeur par défaut |
|---|---|
| `lapsToWin` | 3 |
| `sessionMaxSeconds` | 300 |
| `hpMax` | 100 |
| `dmgWall` / `dmgArc` / `dmgStone` | 10 / 10 / 100 |
| `invulnAfterHitS` | 1 |
| `stunStoneS` | 1 |
| `arcSlowFactor` / `arcSlowS` | 0,5 / 1,5 |
| `repairHoldS` / `repairHpRestore` | 2 / 60 |
| `pickupRespawnS` / `armWindowS` | 15 / 5 |
| `stoneTelegraphS` / `stoneRadiusPx` | 0,8 / 60 |
| `boostLenMinPx` / `boostLenMaxPx` | 100 / 400 |
| `boostGateLifeS` / `boostDurationS` / `boostGain` | 8 / 2 / 0,8 |
| `ghostS` / `ghostCooldownS` | 3 / 20 |
| `destroyDisableS` / `destroyCooldownS` | 10 / 15 |
| `wallLengthPx` / `arcMaxDistPx` | 120 / 500 |
| `trackWidthBasePx` / `trackWidthMinPx` | 140 / 90 |
| `vMaxFwd` / `vMaxPedal` / `accel` / `turnRate` / gain direction / expiration d'entrée | 260 / 190 / 320 / 2,8 / 1,12 / 250 ms |

Tout est **[EST]**, à régler pendant les tests utilisateurs.

---

## 15. Ordre de développement

| Priorité | Contenu |
|---|---|
| **P0** | Serveur Node + WebSocket · rendu piste · générateur de carte (§5) · app Pilote smartphone · physique du véhicule · HP et hors d'usage · **réparation synchrone (C-06)** |
| **P1** | Pickups + armement (R-11 à R-13) · Lance-pierre (C-01) · Boost (C-02) · Fantôme (C-03) · Destruction de mur (C-04) · **Poteaux via console Oz (C-05)** · panneaux HUD des 4 coins |
| **P2** | Élargir la piste (C-07) · journal et rejeu Oz · effets néon, sons · circuit de secours |

---

## 16. Écarté du prototype (une seule vérité)

| Élément retiré | Raison |
|---|---|
| Gyroscope pour piloter | Remplacé par pédale + joystick sur smartphone (D3) |
| Tangibles « champ orienté » et « porte progressive » | Remplacés par les poteaux électriques (périmètre plus simple, un seul type de tangible) |
| Réparation localisée sur la zone endommagée | Remplacée par la réparation synchrone aux stations (D6) |
| Contraintes de tracé posées par les autres joueurs | Retirées pour simplifier la génération de carte (§5) |
| Ligne d'énergie en action séparée | Fusionnée avec le boost (portail jaune, C-02) |
| Sortie de piste = véhicule détruit | Les bords sont solides, sans dégâts (§6.2); seul le HP = 0 met hors d'usage |

### Pistes de recherche (hors prototype, à garder pour la soutenance)
1. **Occlusion par les bras comme mécanique**: aider loin de son poste prive le Pilote d'information. Limite: aucun écran PCAP ne détecte le survol; seul le déclenchement manuel par l'opérateur Oz serait possible.
2. **Tangible translucide en fenêtre de diagnostic**: anneau acrylique qui révèle une couche alternative sous la piste. [OK] Produit existant chez Interactive Scape: Scape X Magnify (anneau ø193/161 mm, 148 g).
3. **Surface de contact comme paramètre analogique**: [?] `PointerEvent.width/height` sont souvent constants sur PCAP Windows. À tester avant toute promesse; sinon remplacer par le nombre ou l'écartement des doigts.

---

## 17. Hypothèses à valider par l'équipe

1. **Confirmé le 19 octobre 2026** : n'importe quel joueur de chaque équipe peut créer la carte ; placement et tracés suivent l'ordre cyan puis rose (§5.1).
2. Interprétation du « remplissage mutuel » et du « mélange » des deux circuits (§5.1, §5.2 étape 5).
3. Les équipes sont installées sur les deux **grands côtés** de la table (§3).
4. Le Pilote a **un doigt sur la table** (pad) en plus de son smartphone pour la réparation (C-06).
5. Les poteaux ne blessent pas leur propre équipe (R-09).
6. Date de soutenance (28 sept 2026 antérieure à la date du doc).

---

## 18. Références

- Morris et al., CHI 2006: gestes coopératifs (symétrie, parallélisme, distance proxémique, additivité).
- Piper et al., CSCW 2006 (SIDES): la collaboration n'émerge que si les règles interdisent l'action solitaire.
- Scott, Carpendale, Inkpen, CSCW 2004: territorialité sur table.
- Vogel & Balakrishnan: occlusion sur surfaces tactiles.
- Interactive Scape: Scape Tangible, Scape X Module, Scape X Magnify.
