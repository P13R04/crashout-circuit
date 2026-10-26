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
| T-06 | lance-pierre : impact 0,8 s après le geste, −100 HP (hors d'usage) + étourdissement, adversaire uniquement |
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
