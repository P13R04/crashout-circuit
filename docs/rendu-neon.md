# Rendu néon : intégration et vérification

Le thème retenu est « Néon électrique ». Il est réalisé avec Canvas, sans images ou polices externes. Les règles de conduite, de réparation, de vol et d’activation des tangibles restent autoritaires sur le serveur.

## Ce qui est intégré

- Un vide numérique bleu pétrole / violet : brume, colonnes de code et fragments sur plusieurs plans qui dérivent à des vitesses différentes. La caméra, le circuit et les postes ne suivent pas ce mouvement.
- Une route opaque distincte du vide, une tranche sombre, un damier d’arrivée, des bordures neutres et des impulsions LED animées. Les couleurs des équipes identifient les joueurs et la propriété des objets.
- Des véhicules à deux réacteurs : coque, verrière, feux directionnels, panaches proportionnels à la vitesse et plus intenses en boost. Leur nez conserve la portée visuelle initiale de 14 unités ; les collisions ne sont pas agrandies.
- Une mémoire de trajectoire de deux secondes, qui suit les positions réellement reçues. Une réapparition coupe la trace. La trace s’efface à l’arrêt, en mode réduit et à la nouvelle partie.
- Des murs en blocs hachurés, des piliers avec volume et noyau lumineux, des arcs ramifiés qui évoluent de façon continue et une charge qui parcourt la liaison.
- Des bonus en capsules flottantes, un ramassage qui rejoint le stock du bon copilote, une impulsion d’armement et une extinction à l’expiration.
- Des éclats locaux pour les impacts, des filaments de vitesse pour le boost, une disparition dans le vide à la chute et un effet d’assemblage vert à la réparation.
- Des postes opaques, des accents lumineux contenus et trois feux de départ. Les commandes restent dans les mêmes zones.
- Un affichage qui conserve le format logique 16:9 ; les coordonnées tactiles continuent à être converties depuis le rectangle du canvas. Le tiroir PC suit ce rectangle dans une fenêtre d’un autre format.

## Coût et limites

`VoidBackdrop.ts` prépare la brume à demi-définition et deux nappes de code une seule fois. `neon.ts` prépare de petites textures de lumière réutilisables. Aucun flou plein écran n’est calculé à chaque image.

`NeonTrack.ts` garde le tablier raster et les chemins LED en cache. La géométrie est reconstruite uniquement si sa version ou la définition d’affichage change. Les recherches de bords recouverts aux croisements utilisent des cases spatiales et sont comparées à la règle exhaustive précédente dans les tests. Une déformation recalcule sa vraie géométrie ; elle ne crée pas de ligne de collision visuelle à la jonction.

`NeonVehicles.ts` prépare deux silhouettes à trois fois leur taille logique. L’historique comporte au plus 72 points par véhicule, échantillonnés au plus environ 33 fois par seconde, puis dessine six classes d’âge. Les éclairs comportent au plus 42 subdivisions et trois branches par liaison. La file de retours visuels comporte au plus 64 événements. Les objets graphiques ne modifient jamais l’état de jeu.

Le canvas utilise la définition physique utile de sa fenêtre, plafonnée à 3840 × 2160. Il évite de dessiner systématiquement un tampon 4K dans une petite fenêtre. Le temps visuel est figé pendant la pause ; les délais après retour d’un onglet masqué sont plafonnés à 50 ms pour éviter une avance brutale des effets.

Le réglage système « réduire les animations », ou `?motion=0` pour un essai, immobilise le décor, les LED et la forme des éclairs, retire les traînées et réduit les particules. La conduite et les projectiles conservent leurs informations de déplacement indispensables.

Une correction réseau accompagne le cache : le serveur transmet une nouvelle géométrie quand `trackVersion` change, y compris à la toute dernière image d’une relaxation. Les versions stables ne sont pas renvoyées en boucle. Cela évite aussi la disparition de la piste après une déformation, que le nouveau test réseau reproduit.

## Vérifications effectuées

- Types, build et suites d’acceptation, gestes, réseau et rendu.
- 63 tests d’acceptation, 14 tests de gestes, 10 vérifications visuelles et scénario réseau avec vraie connexion WebSocket.
- Rendu de toutes les phases, commandes de dessin finies, état autoritaire inchangé, cache réutilisé, changement de définition, traces bornées, réapparition, pause et préférence de mouvement réduit.
- Contrôle en navigateur : circuit normal et circuit en huit, véhicules en mouvement, traces, murs, boost et paire électrique. Deux captures consécutives en pause sont identiques.
- Premier relevé sur la machine de développement, après préparation du cache : environ 60 images/s, médiane de rendu de 0,8 à 1,1 ms et 95e percentile d’environ 1,2 à 1,4 ms pour un tampon 2560 × 1440. Ces mesures sont indicatives et dépendent du navigateur, de la machine et de la scène. Elles mesurent le temps JavaScript d’envoi des commandes de dessin ; elles ne sont pas une mesure GPU indépendante ni une validation de la table 4K.

## Essai sur la table

1. Recharger les clients après la compilation. Dessiner un circuit, puis une boucle qui se croise. Vérifier la surface roulable, le damier et l’absence de barrières LED dans la jonction.
2. Lancer et conduire : le panache doit suivre la vitesse ; la trace doit suivre les virages, sans relier deux points éloignés après une réapparition.
3. Ramasser, armer avec POWER, déclencher un boost ou un lance-pierre. Observer le transfert vers le stock, le compte à rebours, la poussée et l’impact. Aucun mot d’aide ne doit être nécessaire pour lire la nature des objets.
4. Depuis Oz, poser un mur et deux piliers activés d’une même équipe à portée. Déplacer, désactiver puis réactiver : les effets doivent suivre l’état confirmé. POWER n’active toujours aucun tangible.
5. Étirer un bord de piste et attendre son retour complet. Le tablier et les LED doivent suivre le déplacement, puis retrouver le circuit initial sans disparition.
6. Sortir de piste : le véhicule tombe, le poste signale la panne. Tenir les deux pads remet le véhicule sur la piste avec l’effet de réparation.
7. Mettre en pause pendant un boost ou un projectile : le décor et les retours visuels doivent rester figés. Reprendre sans saut de traînée ni expiration prématurée.
8. Faire le même essai avec `?motion=0`, puis revenir au réglage normal. Redimensionner une fenêtre : les cercles restent ronds et les contacts atteignent les contrôles affichés.
9. Sur la dalle et l’ordinateur de séance, activer F3, jouer à quatre avec tangibles et une déformation, puis contrôler fluidité et latence. Valider surtout la lisibilité des véhicules à distance et la luminosité de la dalle dans la salle.

Les sons collectés restent à intégrer séparément. Cette refonte conserve le retour audio existant et ne rajoute pas de nouveaux sons générés.
