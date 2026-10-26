# Thèmes visuels : Néon et Ferraille

La table propose deux ambiances dans **Paramètres → Ambiance**, au bas de l’écran. Ce menu reste accessible sur table tactile et sur ordinateur, dès l’accueil. Le choix s’applique immédiatement à toutes les phases et reste mémorisé dans le navigateur. Néon reste le choix par défaut pour un navigateur sans préférence enregistrée.

## Ferraille

Une infrastructure industrielle récupérée, froide et sombre : acier, plaques assemblées, grilles, renforts et énergie cyan. Les photos du mur LEGO du chat « Options de fabrication tangibles » ont guidé les panneaux dépareillés, la chaîne et les petits accents électriques. La base physique et les règles ne sont pas modifiées.

- **Vide vu de dessus** : passerelles sur trois plans, deux grandes roues dentées avec pignons en prise, deux turbines lentes et deux presses hydrauliques. Les engrenages avancent par crans avec un temps d’arrêt et un petit retour mécanique ; les presses ferment vite, tiennent sous charge puis reviennent plus lentement. Les conduites cuivrées sont parcourues de paquets cyan. Des nappes de brouillard irrégulières et des jets de vapeur se dilatent, dérivent et se dissipent sous la piste. Aucun horizon ou pluie de code. Le décor garde un contraste inférieur à la piste et ne représente aucune surface roulable.
- **Circuit** : tranche et ombre sous le tablier, chanfreins plus fins, plaques de longueurs variables, joints irréguliers, micrograin métallique, traces d’huile et marques de chauffe. Les contours uniformément clairs sont atténués pour réduire l’aspect dessiné. Vis, pièces rapportées, rayures et évents lumineux restent lisibles. Les impulsions cyan se déplacent dans la bordure. Le damier et ses deux balises restent immédiatement visibles.
- **Véhicules** : châssis blindé de récupération, quatre roues, plaques, verrière, phares et deux propulseurs. La bande de carrosserie, les réacteurs et la trajectoire reprennent la couleur de l’équipe.
- **Tangibles** : murs composés de plaques et d’une chaîne, bobines électriques concentriques à quatre bornes, sans direction privilégiée. Leur cœur et leurs arcs sont cyan, leur propriété conserve une marque d’équipe.
- **Postes** : métal sombre, vis et accents d’équipe. Les positions et dimensions des contrôles restent identiques.
- **Course chaotique** : les effets d’impact, étincelles, projectiles, boosts, réparation et chute restent présents. Les réacteurs suivent la vitesse ; de courtes volutes d’échappement complètent les traînées.

Néon conserve son décor matriciel, son circuit, ses véhicules et ses tangibles. Changer de thème n’envoie aucune commande au serveur, ne relance pas la course et ne change ni collisions, ni bonus, ni responsabilité du magicien d’Oz.

## Organisation et coût

`themes.ts` contient le catalogue et la préférence locale (`crashout.visual-theme`). `Renderer.ts` choisit les couches de présentation. Ajouter une ambiance ne nécessite pas de modifier les messages de contrôle ou l’état autoritaire.

`ScrapBackdrop.ts` prépare trois images 1440 × 810 et trois chemins de conduites une seule fois. `IndustrialMachinery.ts` conserve six images de pièces réutilisables : roue, pignon, turbine, carter, châssis de presse et mâchoire. `IndustrialMotion.ts` calcule leur pose depuis le seul temps visuel, sans simulation accumulée. `IndustrialVapour.ts` prépare une texture de vapeur 256 × 256 et la réutilise pour trois nappes et seize volutes au maximum. Le temps réduit reste fixé à zéro ; la pause fige aussi ces éléments. Le test de cache vérifie qu’aucun nouveau canvas n’est alloué dans 120 images d’animation après la préparation. `ScrapTrack.ts` conserve le tablier et la surface en cache à la résolution du canvas ; seules une nouvelle géométrie ou une nouvelle résolution les reconstruisent. Les chemins de bordure utilisent la même règle de visibilité que Néon : les jonctions ouvertes n’ont pas de barrière lumineuse.

Les deux thèmes conservent chacun leur cache, préparé à la première utilisation. Une alternance sur une piste inchangée ne le reconstruit pas. Les traînées sont réinitialisées au changement pour éviter de relier des positions éloignées. L’état visuel de chute reste partagé : changer de thème ne fait pas réapparaître un véhicule tombé ; seule sa réparation le réaffiche. Il n’y a ni nouvelle bibliothèque, ni téléchargement d’assets, ni shader ou flou plein écran calculé à chaque image.

La pause et la préférence de mouvement réduit s’appliquent aux deux ambiances. Les éléments statiques restent détaillés lorsque le mouvement est réduit.

## Vérification

- Types et compilation valides ; 63 tests d’acceptation, 14 tests de gestes et 17 vérifications visuelles.
- Toutes les phases et les deux thèmes, circuit classique et huit, état serveur inchangé pendant le rendu, réutilisation des caches, déformation/restauration, redimensionnement et changement de thème.
- Préférence mémorisée, valeur inconnue ou stockage indisponible : retour utilisable à Néon.
- Contrôle du rendu réel en navigateur sur une scène de démonstration isolée : choix et rechargement, circuit en huit, déformation, mode réduit sans traces, deux captures en pause identiques. Contrôle supplémentaire des cycles des presses, des temps d’arrêt des engrenages, de leur continuité et des bornes des volutes sur une heure simulée. Aucune erreur de console observée.
- Après préparation des caches : environ 60 images/s et 0,5 à 0,8 ms de médiane d’envoi des commandes de rendu sur la scène de course, pour un tampon 2560 × 1440. Mesure locale indicative, pas une mesure GPU indépendante. La validation sur la dalle avec quatre joueurs reste à faire.

## Parcours d’essai

1. Ouvrir **Paramètres → Ferraille**. Revenir à Néon, puis à Ferraille pendant la même partie : aucune position, aucun stock et aucun état de tangible ne doivent changer.
2. Recharger la page : le choix est conservé. Le menu doit aussi fonctionner depuis l’accueil et la création du circuit, sur écran tactile.
3. Tracer une boucle puis un huit : observer l’épaisseur, le damier, les jonctions ouvertes et les détails de surface. Étirer une bordure puis attendre son retour : la piste reste visible et les détails suivent sa géométrie.
4. Conduire les deux équipes, accélérer et déclencher les objets : les couleurs d’équipe, la direction des véhicules et les dangers doivent rester lisibles. Depuis Oz, déplacer/activer/désactiver les tangibles et observer les effets correspondants.
5. Observer le fond pendant 10 secondes : roues par à-coups, turbines continues, cycle des presses, vapeur et pulses énergétiques. Mettre en pause : ambiance, LED et effets sont figés. Reprendre puis essayer `?motion=0` : le décor s’immobilise et les traces disparaissent, la conduite reste possible.
6. Sur la table, vérifier la lecture à distance et la fluidité avec quatre joueurs ; F3 affiche les mesures locales.
