# Thèmes visuels de Crashout

La table propose cinq ambiances dans **Paramètres → Ambiance**. Les paramètres sont accessibles entre les deux pilotes, à gauche de la table. Ce menu reste accessible sur table tactile et sur ordinateur, dès l’accueil. Le choix s’applique immédiatement à toutes les phases et reste mémorisé dans le navigateur. Néon reste le choix par défaut pour un navigateur sans préférence enregistrée.

## Ferraille

Une infrastructure industrielle récupérée, froide et sombre : acier, plaques assemblées, grilles, renforts et énergie cyan. Les photos du mur LEGO du chat « Options de fabrication tangibles » ont guidé les panneaux dépareillés, la chaîne et les petits accents électriques. La base physique et les règles ne sont pas modifiées.

- **Vide vu de dessus** : passerelles sur trois plans, deux grandes roues dentées avec pignons en prise, deux turbines lentes et deux presses hydrauliques. Les engrenages avancent par crans avec un temps d’arrêt et un petit retour mécanique ; les presses ferment vite, tiennent sous charge puis reviennent plus lentement. Les conduites cuivrées sont parcourues de paquets cyan. Des nappes de brouillard irrégulières et des jets de vapeur se dilatent, dérivent et se dissipent sous la piste. Aucun horizon ou pluie de code. Le décor garde un contraste inférieur à la piste et ne représente aucune surface roulable.
- **Circuit** : tranche et ombre sous le tablier, chanfreins plus fins, plaques de longueurs variables, joints irréguliers, micrograin métallique, traces d’huile et marques de chauffe. Les contours uniformément clairs sont atténués pour réduire l’aspect dessiné. Vis, pièces rapportées, rayures et évents lumineux restent lisibles. Les impulsions cyan se déplacent dans la bordure. Le damier et ses deux balises restent immédiatement visibles.
- **Véhicules** : châssis blindé de récupération, quatre roues, plaques, verrière, phares et deux propulseurs. La bande de carrosserie, les réacteurs et la trajectoire reprennent la couleur de l’équipe.
- **Tangibles** : murs composés de plaques et d’une chaîne, bobines électriques concentriques à quatre bornes, sans direction privilégiée. Leur cœur et leurs arcs sont cyan, les tangibles restent neutres et affectent les deux voitures.
- **Postes** : métal sombre, vis et accents d’équipe. Les positions et dimensions des contrôles restent identiques.
- **Course chaotique** : les effets d’impact, étincelles, projectiles, boosts, réparation et chute restent présents. Les réacteurs suivent la vitesse ; de courtes volutes d’échappement complètent les traînées.

Néon conserve son décor matriciel, son circuit, ses véhicules et ses tangibles. Changer de thème n’envoie aucune commande au serveur, ne relance pas la course et ne change ni collisions, ni bonus, ni responsabilité du magicien d’Oz.

## Toy Circuit

Une piste de jouet sur un tapis bleu-vert, avec tranche épaisse, rails orange/jaune, joints de moulage et reflets mobiles. Les blocs à tenons et petites pièces restent sous la piste. Des engrenages tournent, trois mécanismes à ressort coulissent et quelques confettis dérivent lentement. Les voitures ont une carrosserie en plastique, de grosses roues, une verrière et un aileron ; les commandes reprennent les arrondis et les reliefs moulés. Les murs ont des tenons, les bobines une coque violette et les impacts éclatent en confettis. Les couleurs du décor restent moins lumineuses que les commandes et les véhicules.

## F1 Classic

Asphalte gris propre, vibreurs alternés rouge et blanc, damier clair et grilles de départ. Le fond vu de dessus montre pelouse tondue, tribunes et ventilateurs de paddock. Les drapeaux ondulent et des ombres de nuages dérivent doucement. Les monoplaces ont quatre roues découvertes, ailerons avant/arrière, nez fin, cockpit et halo. La vitesse produit une traînée de pneus et un léger sillage, sans réacteurs ; les impacts soulèvent de la poussière. Les commandes utilisent une finition sobre, des angles courts et un petit motif de damier. Les obstacles conservent leurs vrais volumes et leurs champs électriques.

## Mayhem

Piste en terre brune avec ornières, flaques et rebords usés ; un sol sombre couvert de pneus, tôles et pièces de récupération. Des roues mécaniques avancent par crans, les soudures lancent des étincelles intermittentes, la fumée se dilate dans le plan de la table et des rides parcourent les flaques. Les voitures sont des bangers renforcées, avec pare-chocs soudés, plaques rivetées et arceau. Elles projettent de la boue et une petite flamme sous boost. Les murs ont des entretoises rouillées, les piliers des bobines récupérées et les commandes une finition métallique chaude et rayée.

Les cinq thèmes gardent **cyan pour A et rose pour B**, avec les mêmes icônes et emplacements. Les accents d’ambiance ne changent ni les règles des bonus, ni la géométrie, ni les dimensions LEGO des tangibles.

## Organisation et coût

`themes.ts` contient le catalogue et la préférence locale (`crashout.visual-theme`). `Renderer.ts` choisit les couches de présentation. Ajouter une ambiance ne nécessite pas de modifier les messages de contrôle ou l’état autoritaire.

`ScrapBackdrop.ts` prépare trois images 1440 × 810 et trois chemins de conduites une seule fois. `IndustrialMachinery.ts` conserve six images de pièces réutilisables : roue, pignon, turbine, carter, châssis de presse et mâchoire. `IndustrialMotion.ts` calcule leur pose depuis le seul temps visuel, sans simulation accumulée. `IndustrialVapour.ts` prépare une texture de vapeur 256 × 256 et la réutilise pour trois nappes et seize volutes au maximum. Le temps réduit reste fixé à zéro ; la pause fige aussi ces éléments. Le test de cache vérifie qu’aucun nouveau canvas n’est alloué dans 120 images d’animation après la préparation. `ScrapTrack.ts` conserve le tablier et la surface en cache à la résolution du canvas ; seules une nouvelle géométrie ou une nouvelle résolution les reconstruisent. Les chemins de bordure utilisent la même règle de visibilité que Néon : les jonctions ouvertes n’ont pas de barrière lumineuse.

Les cinq thèmes conservent chacun leur cache, préparé à la première utilisation. Une alternance sur une piste inchangée ne le reconstruit pas. Les traînées sont réinitialisées au changement pour éviter de relier des positions éloignées. L’état visuel de chute reste partagé : changer de thème ne fait pas réapparaître un véhicule tombé ; seule sa réparation le réaffiche. Il n’y a ni nouvelle bibliothèque, ni téléchargement d’assets, ni shader ou flou plein écran calculé à chaque image.

La pause et la préférence de mouvement réduit s’appliquent aux cinq ambiances. Les éléments statiques restent détaillés lorsque le mouvement est réduit.

`CircuitTrack.ts` décline les trois nouveaux matériaux sur la géométrie commune. La surface, les détails et les vibreurs sont calculés uniquement au changement de piste ou de résolution. Les bords masqués aux croisements restent ouverts. `ThemeWorld.ts` prépare un fond 960 × 540, une pièce tournante et une texture de brume par nouveau thème ; seuls un nombre fixe de pièces, drapeaux, volutes et étincelles sont animés. Aucun tableau de particules n’accumule d’éléments. Les carrosseries restent mises en cache. Les nouveaux décors sont préparés à la première sélection et réutilisés ensuite.

## Vérification

La passe actuelle vérifie les types, la compilation, les gestes et les règles serveur. Les 27 contrôles de rendu automatisés parcourent les cinq thèmes, toutes les phases, une boucle et un huit, les effets, les caches, le redimensionnement, la pause, le mouvement réduit et le changement de thème. Les animations des nouveaux décors n’allouent aucun nouveau canvas après leur préparation.

Cette passe ne comprend pas de nouvelle mesure de fréquence d’images ni de validation visuelle sur dalle. Le rendu et la lisibilité sont à confirmer lors du test sur table.

## Parcours d’essai

1. Ouvrir **Paramètres → Ambiance**. Parcourir les cinq thèmes pendant la même partie : aucune position, aucun stock et aucun état de tangible ne doivent changer.
2. Recharger la page : le choix est conservé. Le menu doit aussi fonctionner depuis l’accueil et la création du circuit, sur écran tactile.
3. Tracer une boucle puis un huit : observer l’épaisseur, le damier, les jonctions ouvertes et les détails de surface. Étirer une bordure puis attendre son retour : la piste reste visible et les détails suivent sa géométrie.
4. Conduire les deux équipes, accélérer et déclencher les objets : les couleurs d’équipe, la direction des véhicules et les dangers doivent rester lisibles. Depuis Oz, déplacer/activer/désactiver les tangibles et observer les effets correspondants.
5. Observer chaque fond pendant 10 secondes : mécanismes et confettis pour Toy Circuit, drapeaux/nuages/ventilateurs pour F1 Classic, soudures/roues/brouillard pour Mayhem, machines et énergie pour Ferraille. Mettre en pause : ambiance, LED et effets sont figés. Reprendre puis essayer `?motion=0` : le décor s’immobilise et les traces disparaissent, la conduite reste possible.
6. Sur la table, vérifier la lecture à distance et la fluidité avec quatre joueurs ; F3 affiche les mesures locales.
