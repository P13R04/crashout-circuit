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

Une collection de miniatures montée sur un tapis d’atelier : garage avec toit nervuré et verrières, deux baies de service, petites voitures, pompe, rangement de pneus et portique de chargement animé. L’avion a une silhouette lisible de dessus, un cockpit et une hélice mobile. Les autres espaces libres accueillent une boîte de voitures compartimentée, des crayons taillés, une clé et des billes en verre avec reflets.

La piste est un objet en plastique moulé : épaisseur et ombre, rails chauds bicolores, clips de fixation, raccords transversaux, guides creusés et microtexture satinée. Le décor conserve sa palette d’objet peint et ses ombres de contact ; les voitures actives restent plus lumineuses. Les engrenages et confettis flottants de remplissage ont été retirés.

## F1 Classic

Un circuit de course entretenu, avec une identité de paddock classique : pelouse tondue, dégagements en gravier, asphalte granuleux, réparations discrètes et traces de freinage dans les courbes. Les vibreurs sont rouge et blanc, avec une peinture moins uniforme et une grille de départ claire.

Les tribunes suivent les courbes **et les longues portions** du dessin, avec terrasses, rangées de sièges, public, escaliers, grillages et auvents partiels. Leur implantation évite les commandes et les autres branches d’un huit. Dans la plus grande zone libre se trouve un bâtiment de stands : baies ouvertes, monoplaces garées, chariots et pneus. Quelques bras et drapeaux bougent, les ombres des nuages glissent ; aucun rotor décoratif générique ne remplit le terrain.

## Mayhem

Un festival de démolition installé sur un terrain labouré : terrasses improvisées, double rangée de pneus, public, drapeaux à croix, guirlandes et projecteurs entourent l’arène. L’espace central accueille une scène avec enceintes, charpente, écran, barres lumineuses, faisceaux mobiles et deux canons à étincelles. Les autres zones libres reçoivent des carcasses reconnaissables, conteneurs nervurés, bidons, stands sous toiles rayées et établis de réparation.

Les soudures produisent des gerbes localisées, la poussière dérive dans le plan de la table et les volutes s’élargissent autour des ateliers. Les impacts projettent davantage d’éclats que dans les autres thèmes. La piste montre des ornières continues, empreintes de pneus, terre agglomérée, accotements labourés et flaques à reflets. Aucun éclair décoratif ne traverse la piste : les arcs des vrais piliers restent lisibles.

Les cinq thèmes gardent **cyan pour A et rose pour B**, avec les mêmes icônes et emplacements. Les accents d’ambiance ne changent ni les règles des bonus, ni la géométrie, ni les dimensions LEGO des tangibles.

## Organisation et coût

`themes.ts` contient le catalogue et la préférence locale (`crashout.visual-theme`). `Renderer.ts` choisit les couches de présentation. Ajouter une ambiance ne nécessite pas de modifier les messages de contrôle ou l’état autoritaire.

`ScrapBackdrop.ts` prépare trois images 1440 × 810 et trois chemins de conduites une seule fois. `IndustrialMachinery.ts` conserve six images de pièces réutilisables : roue, pignon, turbine, carter, châssis de presse et mâchoire. `IndustrialMotion.ts` calcule leur pose depuis le seul temps visuel, sans simulation accumulée. `IndustrialVapour.ts` prépare une texture de vapeur 256 × 256 et la réutilise pour trois nappes et seize volutes au maximum. Le temps réduit reste fixé à zéro ; la pause fige aussi ces éléments. Le test de cache vérifie qu’aucun nouveau canvas n’est alloué dans 120 images d’animation après la préparation. `ScrapTrack.ts` conserve le tablier et la surface en cache à la résolution du canvas ; seules une nouvelle géométrie ou une nouvelle résolution les reconstruisent. Les chemins de bordure utilisent la même règle de visibilité que Néon : les jonctions ouvertes n’ont pas de barrière lumineuse.

Les cinq thèmes conservent chacun leur cache, préparé à la première utilisation. Une alternance sur une piste inchangée ne le reconstruit pas. Les traînées sont réinitialisées au changement pour éviter de relier des positions éloignées. L’état visuel de chute reste partagé : changer de thème ne fait pas réapparaître un véhicule tombé ; seule sa réparation le réaffiche. Il n’y a ni nouvelle bibliothèque, ni téléchargement d’assets, ni shader ou flou plein écran calculé à chaque image.

La pause et la préférence de mouvement réduit s’appliquent aux cinq ambiances. Les éléments statiques restent détaillés lorsque le mouvement est réduit.

`CircuitMaterials.ts` prépare de petites textures de matière réutilisées dans les caches. `CircuitTrack.ts` applique les détails à l’union exacte de la route, avec un masque séparé ; ils ne débordent pas dans les croisements. La piste est reconstruite au changement de géométrie ou de résolution.

`SceneryLayout.ts` dispose tribunes et grands objets depuis la géométrie initiale du circuit : échantillonnage à distance régulière, marge autour de la route, exclusion des commandes, choix des espaces libres pour les objets volumineux. Le décor reste fixe pendant les déformations temporaires. `F1Venue.ts`, `ToyWorkshop.ts` et `MayhemFestival.ts` possèdent chacun leurs propres éléments et animations. `ThemeWorld.ts` conserve le sol en 1440 × 810 et la composition en 1920 × 1080, réutilisés entre les instantanés réseau. Les animations ne créent aucun pool de particules croissant.

## Vérification

La passe actuelle vérifie les types, la compilation, les gestes et les règles serveur. Les 31 contrôles de rendu automatisés parcourent les cinq thèmes, toutes les phases, une boucle et un huit, les effets, les caches, le redimensionnement, la pause, le mouvement réduit et le changement de thème. Les animations des nouveaux décors n’allouent aucun nouveau canvas après leur préparation.

Une planche comparative en navigateur a servi à vérifier la composition des trois ambiances et à prolonger les tribunes sur les lignes droites. Cette passe ne comprend pas de mesure de fréquence d’images sur la dalle ; la lisibilité à distance et la fluidité avec les joueurs restent à confirmer sur table.

## Parcours d’essai

1. Ouvrir **Paramètres → Ambiance**. Parcourir les cinq thèmes pendant la même partie : aucune position, aucun stock et aucun état de tangible ne doivent changer.
2. Recharger la page : le choix est conservé. Le menu doit aussi fonctionner depuis l’accueil et la création du circuit, sur écran tactile.
3. Tracer une boucle puis un huit : observer l’épaisseur, le damier, les jonctions ouvertes et les détails de surface. Étirer une bordure puis attendre son retour : la piste reste visible et les détails suivent sa géométrie.
4. Conduire les deux équipes, accélérer et déclencher les objets : les couleurs d’équipe, la direction des véhicules et les dangers doivent rester lisibles. Depuis Oz, déplacer/activer/désactiver les tangibles et observer les effets correspondants.
5. Observer chaque fond pendant 10 secondes : portique et hélices pour Toy Circuit, drapeaux/public/nuages pour F1 Classic, scène/gerbes/soudures/poussière pour Mayhem, machines et énergie pour Ferraille. Mettre en pause : ambiance, LED et effets sont figés. Reprendre puis essayer `?motion=0` : le décor s’immobilise et les traces disparaissent, la conduite reste possible.
6. Sur la table, vérifier la lecture à distance et la fluidité avec quatre joueurs ; F3 affiche les mesures locales.
