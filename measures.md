# Mesures et validation — Crashout Circuit

Ce document sépare ce qui est **vérifié automatiquement** de ce qui **reste à mesurer sur la table réelle** (Task 18).

## 1. Vérifié automatiquement (`npm run test:acceptance`)

Le script `scripts/acceptance.ts` exécute les règles serveur avec une horloge simulée (aucun réseau, aucun navigateur).

| Critère | Couverture |
|---|---|
| T-01 | 100 paires de tracés aléatoires → circuit valide (pas d'auto-intersection, largeur ≥ 90 px, hors zone des panneaux HUD), < 3 s (≈ 20 ms mesurés) ; repli sur le circuit prédéfini si les tracés sont invalides |
| T-03 | mur neutre : −10 HP pour les deux équipes, puis 1 s d’invulnérabilité |
| T-04 | les deux pylônes neutres ≤ 500 px → un arc ; −10 HP et vitesse ×0,5 pendant 1,5 s pour les deux équipes |
| T-05 | objet armé non utilisé après 5 s → perdu |
| T-06 | lance-pierre : impact 0,8 s après le geste, −50 HP + étourdissement 1,5 s, toute voiture dans la zone ; une seconde pierre met la voiture hors d'usage |
| T-07 | portail plus long → boost plus fort (k = clamp(L/400, 0,3, 1)) |
| T-08 | fantôme 3 s sans effet des éléments adverses, puis recharge 20 s |
| T-09 | réparation seulement si les deux pads sont tenus ; relâcher l'un remet la jauge à 0 |
| T-10 | `TangibleMoved` pose un objet fixe après recharge confirmée par Oz ; corrections bornées à l’origine initiale ; la validation est partagée avec la console. Aucun pont TUIO n’est encore implémenté |
| T-11 | le journal serveur des poteaux, rejoué avec les délais d'origine, reproduit les mêmes murs/arcs |

Les vérifications navigateur historiques sont complétées par l’essai de la console actuelle : recharge dans l’une des deux stations, pose au glissement du mur, activation/désactivation, refus d’un déplacement éloigné et rendu des deux thèmes. Les boutons Fantôme des anciennes campagnes ne font plus partie de l’interface.

**Limite** : ces tests simulent un seul pointeur à la fois. Les gestes à 2 et 3 doigts, la palm rejection et le budget de 10 contacts n'ont **pas** été testés en multitouch réel.

## 2. À mesurer sur la table (non fait)

Ouvrir la table avec `http://<ip>:3000/?debug=1` (ou touche **F3**) : l'overlay affiche fps, durée de frame, RTT WebSocket, latence touch→frame et nombre de contacts.

| Mesure | Objectif | Méthode | Résultat |
|---|---|---|---|
| Doigt → rendu (REQ-9.2) | < 50 ms | `touch→frame` de l'overlay = `performance.now()` à la frame où le retour local est dessiné − `PointerEvent.timeStamp`. Ajouter le RTT affiché pour l'aller-retour serveur | _à remplir_ |
| Joystick → mouvement de la voiture | < 50 ms | Le joystick est sur la table : `touch→frame` + RTT de l'overlay. Contrôle indépendant : filmer la table à 120 i/s | _à remplir_ |
| 60 fps en 4K (REQ-9.3) | ≥ 55 fps | Overlay `?debug=1`, 2 voitures + tous les effets actifs (arc, pierre, boost, fantôme). Repli si insuffisant : forcer un DPR de 1 | _à remplir_ |
| Budget tactile (REQ-9.1) | 10 contacts sans erreur | Poser 10 doigts ; vérifier que la console navigateur ne signale rien et que le compteur `pts` plafonne à 10 | _à remplir_ |
| Palm rejection | bras posés pendant la réparation sans geste parasite | Les contacts de largeur > 140 px logiques sont ignorés hors pads (`PALM_MAX_PX` dans `GestureRecognizer.ts`) ; seuil à ajuster selon ce que `PointerEvent.width` rapporte sur la dalle PCAP | _à remplir_ |
| Latence de l'opérateur Oz (R-16) | à déclarer | Filmer la pose physique et la table, puis mesurer le délai pose → apparition ; le journal `/api/oz-log` horodate les commandes mais ne mesure pas le début de l’observation humaine. Faire ≥ 10 essais au pavé tactile, déclarer médiane et dispersion | _à remplir_ |
| T-02 | pilote sans installation, < 80 ms | Sans objet : le pilote joue sur la table (joystick tactile). Remplacé par la ligne précédente | — |

Les critères T-01 à T-11 doivent encore être rejoués avec au moins deux joueurs réels pour valider l'ergonomie (distance des panneaux, taille des zones tactiles, lisibilité depuis chaque bord).

## 3. Échelle des LEGO (à confirmer sur dalle)

Le serveur calcule les empreintes depuis `tableDiagonalInches` (55 par défaut) : mur 80 × 32 mm avec frange de 10 mm, piliers 32 × 32 mm avec champ de diamètre 84 mm. Le test doit se faire en plein écran sur toute l’image 16:9. Comparer aux bases physiques, puis mesurer la crédibilité à 5 et 10 mm de décalage. Les stations ont été agrandies pour accueillir le mur quelle que soit son orientation. Le protocole complet et les limites sont dans le [README](README.md#échelle-lego-et-tolérance-de-placement).

## 4. Session avec pilotes automatiques

Le mode **TEST TANGIBLES** permet de répéter les essais avec un opérateur Oz et un seul copilote, sans IA d’évitement. `npm run test:autopilot` vérifie la conduite continue au centre (six minutes simulées), les rebonds sur un mur diagonal, les effets électriques sur les deux voitures, le retour progressif après déviation, la réparation avec le seul contact humain du copilote, la pause et le retour aux modes normaux. Un circuit en huit et une déformation locale sont également couverts.

En navigateur, vérifier séparément : entrée par le nouveau bouton, départ par ▶, pleine fenêtre avec **Paramètres → Plein écran**, sortie par **Échap** sans pause, panne après choc et réparation de chaque voiture depuis son seul poste copilote. La validation des contacts multiples et des dimensions physiques reste à effectuer sur la dalle réelle.

## 5. Équilibrage du lance-pierre (issue #39)

`npm run sim:sling` (`scripts/sling-balance.ts`) fait courir deux pilotes automatiques avec la vraie physique et les vrais dégâts pendant 10 minutes simulées, tandis que deux copilotes scriptés ramassent le lance-pierre, l'arment avec POWER, visent la position future de l'adversaire et réparent une voiture en panne. Hypothèses humaines : 1,5 s entre la prise et le tir, 1,5 s pour poser le doigt sur le pad de réparation, une voiture blessée mais roulante n'est pas réparée.

Constats avec les valeurs d'origine (100 PV, étourdissement 1 s) :
- La cadence est limitée par les pickups, pas par le geste : environ **4 tirs par minute pour toute la table en Easy** (6 en Hard), car 4 pickups reviennent 15 s après la prise et la moitié donne un boost. Une limite de fréquence supplémentaire n'est pas nécessaire.
- Une touche coûte **6,5 s hors-jeu** (étourdissement, réparation à deux de 2 s, trois feux de 3 s, réaction) et renvoie la voiture au dernier checkpoint.
- Avec un tir parfait, chaque voiture passe **22 à 26 %** de la course hors-jeu ; avec un tir correct (±50 px), 12 à 18 %.

Valeurs retenues : **50 PV et 1,5 s d'étourdissement** (deux pierres mettent une voiture à pleine santé hors d'usage), portée, rayon, avertissement et délai de réapparition inchangés. Le premier coup gêne et blesse (la voiture perd la moitié de sa vie, ce qui compte face aux murs et aux arcs), le second immobilise.

| Easy, 10 min | Tirs/min | Touches/min | Pannes/min | Hors-jeu par touche | Temps hors-jeu |
|---|---|---|---|---|---|
| Avant, tir parfait | 4,0 | 4,8 | 4,8 | 6,5 s | 26 % |
| **Après, tir parfait** | 4,2 | 4,3 | 2,1 | 4,0 s | 15 % |
| Avant, tir ±50 px | 4,0 | 2,1 | 2,1 | 6,5 s | 12 % |
| **Après, tir ±50 px** | 4,6 | 2,5 | 1,2 | 3,9 s | 8 % |

**Limite** : ces chiffres classent des réglages, ils ne remplacent pas des parties réelles. Les temps de réaction, la visée et l'esquive des pilotes humains sont supposés ; la distance perdue par le retour au checkpoint n'est pas chiffrée. Les valeurs définitives sont à confirmer pendant les sessions de l'issue #40 : relancer `npm run sim:sling` après avoir adapté `PLAYERS` aux temps observés.
