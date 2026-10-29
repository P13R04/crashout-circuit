# Seuils tactiles du lance-pierre : protocole d'essai sur la table (issue #38)

Les seuils n'ont jamais été validés en multitouch réel : `scripts/gestures.ts` ne rejoue que des événements simulés. Ce document prépare la séance sur la dalle. Il décrit les réglages sans recompilation, le journal des décisions du recognizer et le protocole à suivre.

## Seuils et réglages

L'échelle en millimètres dépend de la dalle : `mm/px = diagonale(") × 25,4 × 16 / √(16² + 9²) / 1920`, soit environ **0,75 mm/px sur 65″** (1 px = 0,75 mm) et 0,63 mm/px sur 55″. Le tableau suppose 65″ ; la valeur `tableDiagonalInches` de `config.json` (55 par défaut) ne sert qu'à l'échelle des LEGO et doit être alignée avec la dalle réellement utilisée.

| Seuil | Défaut | Équivalent (65″) | Réglage |
|---|---|---|---|
| Attente avant jugement des doigts (`settleMs`) | 180 ms | — | URL `?settle=` |
| Trois doigts posés ensemble (`slingClusterPx`) | 190 px | ≈ 14 cm | URL `?cluster=` |
| Mouvement qui désigne la poche (`slingRoleMinPx`) | 14 px | ≈ 1 cm | URL `?role=` |
| Rapport de mouvement poche / autres doigts (`slingDominance`) | 1,5 | — | URL `?dominance=` |
| Écart maximal du portail de boost (`boostMaxPx`) | 400 px | ≈ 30 cm | URL `?boostmax=` |
| Rejet de paume (`palmMaxPx`) | 140 px | ≈ 10,5 cm | URL `?palm=` |
| Traction minimale du tir (`slingMinPullPx`) | 40 px | ≈ 3 cm | `config.json`, relancer le serveur |
| Traction maximale (`slingMaxPullPx`) | 260 px | ≈ 19,5 cm | `config.json` |
| Portée minimale / maximale (`slingMinRangePx`, `slingMaxRangePx`) | 220 / 900 px | ≈ 16,5 / 67 cm | `config.json` |

Exemple : `http://<ip-de-la-table>:3000/?debug=1&cluster=230&palm=200`. Les paramètres inconnus, non numériques ou hors plage sont ignorés (plages dans `client-table/gestureTuning.ts`). Chaque modification de seuil validée sur la table doit ensuite être reportée dans les défauts de ce fichier, dans `config.json`, dans `scripts/gestures.ts` et dans ce tableau.

Depuis les premières mesures de l'issue, le comportement a changé : seul le **relâchement du doigt qui tire** déclenche le tir (un doigt de la fourche levé ne tire plus), et un seul bonus peut être armé à la fois, donc un troisième doigt ne transforme plus un portail de boost en lance-pierre. Le protocole vérifie quand même ces deux points sur la dalle.

## Journal des décisions

Avec `?debug=1` (ou **F3**), l'overlay du haut affiche les huit dernières décisions du recognizer. **F4** télécharge tout le journal (400 entrées maximum) en CSV `gestes-<date>.csv`.

| Entrée | Contenu | Utilité |
|---|---|---|
| `contact` | identifiant, largeur et hauteur rapportées (px logiques), type de pointeur, `palm` | la dalle rapporte-t-elle une largeur utile ? Un doigt et une paume ont-ils des valeurs différentes ? |
| `clusterTooWide` | écart maximal des doigts au centre et limite | trois doigts refusés parce que trop écartés |
| `cluster` | écart et limite | les trois doigts ont formé un lance-pierre |
| `puller` | doigt choisi, son déplacement, celui du suivant, rapport | quelle poche, quand, pourquoi |
| `release` | `fired`, `shortPull`, `noPouch` ou `cancelled`, traction, minimum | pourquoi un tir est parti ou non |
| `boost` | écart entre les deux doigts | portail déclenché |

## Protocole

**Matériel.** Table plein écran (Paramètres → Plein écran), serveur à jour, mode **PC** avec le tiroir **Test PC** → **Objets libres** pour avoir un lance-pierre à chaque essai (le tactile reste le geste réel), ou le **TUTORIEL** pour une première passe. Un téléphone ou un chronomètre pour noter ; `?debug=1` ouvert.

**Participants.** Au moins 4 personnes, dont une main petite et une grande, droitier et gaucher. Chacune joue le copilote Cyan, puis le copilote Rose.

**Essais.** Pour chaque personne et chaque configuration, 10 tirs consécutifs vers une cible visée, puis F4 pour sauvegarder le journal.

| Configuration | Consigne |
|---|---|
| A. Une main | pouce et index forment la fourche, le majeur tire |
| B. Deux mains | deux doigts d'une main en fourche, un doigt de l'autre tire |
| C. Ordre libre | poser les trois doigts dans un ordre au choix, y compris un doigt en retard (jusqu'à 1 s) |
| D. Tir rapide | tirer et relâcher aussi vite que possible |
| E. Paume | poser la paume ou l'avant-bras sur la dalle pendant un tir |
| F. Parasite | poser un 4ᵉ doigt pendant le tir, puis lever un doigt de la fourche avant la poche |

**À noter pour chaque essai** : tir parti (oui/non), tir voulu mais non parti, tir parti sans l'avoir voulu, surprise éventuelle.

**Critère d'acceptation** : au moins 9 tirs voulus sur 10 partent sans surprise dans les configurations A à D ; E et F ne produisent aucun tir ni mouvement parasite.

**Lecture du journal.**
- Largeurs de `contact` toujours identiques (par exemple 1) : la dalle ne rapporte pas la taille réelle, le rejet de paume ne peut pas fonctionner par largeur ; chercher une autre règle (nombre de contacts, surface regroupée).
- Largeurs d'un doigt proches de `palmMaxPx` : doigts rejetés à tort, augmenter `?palm=`.
- Beaucoup de `clusterTooWide` : augmenter `?cluster=`. Beaucoup de tirs avec le mauvais doigt dans `puller` : augmenter `?role=` ou `?dominance=`.
- `shortPull` fréquent : baisser `slingMinPullPx` dans `config.json`.

## Résultats (à remplir sur la table)

| Date | Participant | Configuration | Essais voulus | Partis sans surprise | Réglages utilisés | Remarques |
|---|---|---|---|---|---|---|
| _à remplir_ | | | | | | |
