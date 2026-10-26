# Crashout Circuit — choix graphique et collecte audio

Analyse du 25 octobre 2026, après allègement de l’interface et inversion des postes copilote. Les trois styles ci-dessous consignent les propositions de départ. Le style Néon électrique a depuis été retenu et intégré ; voir [le rendu réalisé et sa vérification](rendu-neon.md). Les aperçus initiaux comparent une scène schématique et ne sont pas des captures de la version actuelle.

## Disposition appliquée

| Bord de la table | Gauche | Droite |
|---|---|---|
| Haut | Pilote rose | Copilote cyan |
| Bas | Pilote cyan | Copilote rose |

Chaque poste reste tourné vers son joueur. La position partagée dans `server/layout.ts` alimente aussi POWER, les pads de réparation, le dépôt des tangibles, la carte Oz, l’attribution des gestes au copilote le plus proche et l’orientation des effets vers le partenaire le plus proche. Les raccourcis restent liés aux équipes (A pour POWER cyan, M pour rose), indépendamment du placement physique.

## Diagnostic graphique

Le problème principal est la faible différenciation entre les objets, les matériaux et les états. Ajouter du flou lumineux partout ne suffira pas. La course doit être lisible avant les détails décoratifs.

| Élément actuel | Conséquence | Cible de finition commune aux trois styles |
|---|---|---|
| Voiture : flèche de 24 × 14 unités, aplat et halo | Évoque un curseur. Avant/arrière et panne se lisent surtout par la couleur. | Silhouette de petite voiture vue du dessus : carrosserie, roues, pare-brise sombre, avant distinct, signature d’équipe par forme et couleur. Ajuster la taille à la table réelle et à l’emprise physique, sans agrandir visuellement le véhicule au-delà de ses collisions. |
| Piste sombre sur fond sombre quadrillé | La surface roulable et le vide se confondent ; la bordure est plus visible que la route. | Route continue avec une valeur nettement différente du vide ; tranche et ombre discrètes pour comprendre la plateforme. Conserver les croisements ouverts, les boucles et les déformations. |
| Bord extérieur rose et intérieur cyan | Les couleurs des équipes semblent attribuer les deux bords à des propriétaires différents. | Bordures neutres. Cyan/rose réservés aux joueurs, à leurs postes et à la propriété des objets. Énergie/avertissement : ambre ; réparation : vert. Toujours ajouter une différence de forme. |
| Ligne de départ/arrivée : trait blanc | Ressemble à un checkpoint supplémentaire. | Bande à damier sur toute la largeur, petits repères aux deux extrémités, grille de départ légère et animation locale du passage d’un tour. Aucun pont fictif aux croisements. |
| Vide : même quadrillage que sous la route | Une sortie ressemble à un arrêt sur le fond. | Profondeur sombre, ombre de la piste, animation brève de chute : perte d’adhérence, réduction de taille et disparition dans le vide. Puis repère de panne et réparation. Ne pas remplacer la règle par un respawn automatique. |
| Vitesse : trois traits jaunes aléatoires uniquement en boost | Peu de sensation entre conduite normale et turbo ; le jaune peut faire penser à un danger. | Ombre stable, très courte traînée de vitesse, traînées plus longues et impulsion de lumière uniquement au boost ; effets alignés sur la vitesse réelle, sans mouvement global de caméra. |
| Mur : segment rouge et points ; piliers : petits cercles | Ils paraissent être des annotations de debug, pas des objets physiques. | Mur épais à face hachurée ; piliers cylindriques à bornes visibles ; arc reliant exactement les piliers. Base cyan/rose pour la propriété, aspect ambre pour l’énergie. Seul Oz change l’état actif. |
| Bonus : petits glyphes qui tournent | Ils se confondent avec des marquages au sol. | Capsules ou jetons distincts des véhicules et tangibles, ombre légère, signe de bonus stable et lisible. Au ramassage, retour visuel vers le stock du copilote. Armement doré et temporaire, neutre et volable. |
| Effets : beaucoup de cercles qui grandissent | Ramassage, turbo, réparation et impacts partagent une forme similaire. | Une grammaire par action : aspiration vers le stock, étirement pour vitesse, arcs pour électricité, éclats pour collision, assemblage pour réparation. Durées courtes et fin nette. |
| Gros impacts BD avec mots, halo néon ailleurs | Deux univers graphiques se mélangent. | Choisir une direction : éclat électrique sobre en néon, rebond de jouet en miniature, éclat graphique sans mot nécessaire en Pop. Réserver un effet spectaculaire aux impacts importants. |
| Postes en cadres lumineux et texte monospace | Les commandes sont plus claires, mais ressemblent encore à des panneaux d’outil. | Matériau, épaisseurs et rayons cohérents avec le monde ; rôle et équipe identifiables d’un coup d’œil. Priorité au jeu, pas à une fausse instrumentation décorative. |
| Accueil / compte à rebours / résultats | Peu de mise en scène entre les états du jeu. | Identité de titre cohérente, trois feux de départ, départ net, victoire locale dans la couleur gagnante, reprise et nouvelle partie immédiatement accessibles. |
| Éléments actifs uniquement par couleur | Lisibilité fragile à distance ou sur une dalle moins contrastée. | Ajouter silhouette, remplissage, motif et comportement : contour interrompu = inactif ; contour solide + énergie = actif ; anneau = durée ; deux contacts = coopération. |
| Canvas étiré pour remplir toute fenêtre | Une fenêtre de proportions différentes déforme roues, cercles et voitures. | Préserver les proportions de l’espace logique ; ajuster les coordonnées tactiles au rectangle réellement affiché. Vérifier le ratio de la table, les contacts et Oz ensemble. |

Les premières priorités sont voiture, surface roulable/vide, départ-arrivée, puis chute et vitesse. Elles améliorent directement la compréhension de la course. Les particules et les menus viennent ensuite.

## Trois directions réalisables sans images externes

Les voitures, pistes, murs, piliers, dégradés, ombres et particules peuvent être dessinés en Canvas. La caméra reste verticale et fixe pour les quatre joueurs. Une petite épaisseur simulée est possible ; une perspective isométrique changerait la perception des contacts et n’est pas proposée.

### Néon électrique — recommandation pour la continuité

Arène nocturne, piste graphite aux bords blanc glacé, petites voitures carénées et énergie lumineuse contenue. L’éclairage signale une action ou une source d’énergie ; la route entière n’éblouit pas. Cyan et rose sont les deux équipes, ambre les objets chargés, vert la réparation. Le fond peut suggérer une arène profonde avec une structure très discrète.

- **Voitures** : carrosserie angulaire, pare-brise noir, feux avant, aileron arrière, signature d’équipe.
- **Piste / vide** : ruban minéral sombre légèrement surélevé, tranche et ombre, profondeur quasi noire.
- **Arrivée** : damier blanc net et bornes lumineuses. Passage de tour = courte impulsion.
- **Vitesse / dégâts** : deux filaments de lumière pour le turbo ; étincelles directionnelles et extinction progressive pour une panne.
- **Tangibles** : blocs industriels et bornes électriques, pas de lignes abstraites.
- **Audio** : moteur électrique discret, charge d’énergie, clacs mécaniques, étincelles sèches.
- **Point de vigilance** : halos limités et route assez contrastée. Une bordure lumineuse ne doit pas suggérer une barrière physique si la voiture peut tomber au-delà.
- **Effort relatif** : modéré. La direction actuelle fournit une base, mais les voitures et la mise en scène doivent être redessinées.

### Circuit miniature — recommandation pour le caractère tangible

Course de petites voitures sur une plateforme de jeu. Plastique mat, pneus noirs, éléments arrondis, ombres douces, dénivelé simulé. L’univers raconte immédiatement « on manipule un circuit sur une table ». Le vide reste une fosse réelle entre les éléments ; ni herbe ni décor plat sur lequel on semblerait pouvoir rouler.

- **Voitures** : petites carrosseries arrondies, roues apparentes, pare-brise, léger reflet.
- **Piste / vide** : pièces grises, chants ivoire, creux bleu pétrole. Rainure centrale seulement décorative : elle ne doit pas laisser croire à un guidage automatique.
- **Arrivée** : damier peint et repères de grille.
- **Vitesse / dégâts** : traits courts, petites vibrations locales de carrosserie, pièces et étincelles très sobres ; chute évoquant un jouet qui quitte la plateforme.
- **Tangibles** : blocs et plots qui ressemblent à des accessoires physiques du même jeu.
- **Audio** : moteur de voiture radiocommandée, plastique, ressort, clics et impacts amortis.
- **Point de vigilance** : conserver une vue verticale ; les ombres ne doivent pas masquer les vrais bords. Le traitement des volumes est plus exigeant aux croisements et pendant une déformation.
- **Effort relatif** : plus élevé, à cause de la cohérence des volumes et matériaux.

### Grand Prix Pop — recommandation pour une identité très graphique

Une course inspirée d’affiches de sport automobile : route ivoire, fond cobalt profond, encre sombre, vibreurs corail, voitures cyan et rose. Aplats francs, silhouettes fortes, ombres découpées. Les motifs restent dans le fond pour que la route ne paraisse pas sale ou dangereuse.

- **Voitures** : silhouettes compactes à roues apparentes, dessins très lisibles, signature par bandes ou losange.
- **Piste / vide** : plateforme claire détourée, tranche sombre, fosse cobalt ; vibreurs corail/ivoire visuels, sans obstacle fictif.
- **Arrivée** : grand damier et petits repères graphiques.
- **Vitesse / dégâts** : traits secs, éclats géométriques et rebonds brefs. Le style BD devient cohérent, sans besoin d’afficher « POW ».
- **Tangibles** : formes pleines, hachures et contours nets ; l’électricité demeure identifiable par son arc.
- **Audio** : petit moteur de kart, pneus, impacts courts et ponctuations de course arcade.
- **Point de vigilance** : surface claire sur une grande table, à valider dans l’éclairage de la salle ; ne pas multiplier les motifs et les aplats saturés dans les postes.
- **Effort relatif** : modéré. Moins de halos et de volumes, mais une discipline stricte sur les silhouettes et contrastes.

## Règles de finition indépendantes du choix

1. Faire correspondre le dessin à la surface roulable et aux obstacles physiques. Aucune décoration ne rétrécit visuellement la route ni n’introduit une fausse collision.
2. Tester les circuits en huit, les boucles, les forts angles et les déformations. Les croisements restent au même niveau.
3. Le mouvement de jeu ne bouge pas toute la table : pas de secousse globale, de zoom automatique ou de perspective.
4. Dessiner les formes fixes dans une couche mise en cache ; garder les effets limités et bornés en nombre. Vérifier fluidité et latence sur la table, pas seulement sur l’ordinateur de développement.
5. Hiérarchie : voiture et danger imminent, route et arrivée, commandes utiles, puis ambiance.
6. Une action doit expliquer visuellement son résultat : objet vers stock, énergie vers tangible, deux contacts vers réparation. Ne pas réintroduire des paragraphes d’aide.
7. Les sons et les effets s’arrêtent ou se figent correctement en pause ; nouvelle partie et reconnexion ne rejouent pas les événements historiques.
8. Ajouter des réglages courts pour volume général, musique et effets ; l’état du son doit être visible après déverrouillage audio du navigateur.

## État du son aujourd’hui

`client-table/Sound.ts` utilise des oscillateurs et du bruit Web Audio. Il couvre notamment validation/refus de tracé, ramassage, impacts, boost, avertissement de pierre, panne et fin de réparation. Le moteur, le compte à rebours, l’armement, l’expiration, la traction élastique, la chute, la progression de réparation, les tangibles et la victoire n’ont pas encore une couverture complète. La création d’un boost et son passage partagent le même son ; ils devraient avoir des rôles différents.

Il faut remplacer cette base par un petit ensemble cohérent de vrais sons, avec variations et volumes adaptés aux quatre joueurs. La musique restera secondaire : les joueurs doivent pouvoir parler et entendre une alerte. Prévoir des sons simultanés limités et éviter de rejouer un son à chaque mise à jour d’état.

## Sons à chercher

Les mots-clés anglais sont destinés à la recherche, pas à l’interface. Ils ne désignent pas des fichiers déjà sélectionnés. Les durées sont des cibles, pas des contraintes absolues. Rechercher d’abord les sons communs, puis moteur, impacts et musique dans le thème choisi.

| Priorité | Son à collecter | Mots-clés de recherche | Cible et usage |
|---|---|---|---|
| Essentiel | Validation / appui | `soft mechanical click`, `arcade UI confirm` | 0,05–0,2 s ; court, doux, pas sur chaque déplacement tactile. |
| Essentiel | Refus d’action | `soft error blip`, `UI denied short` | 0,1–0,3 s ; moins agressif qu’une alerte de danger. |
| Essentiel | Décompte 3–2–1 | `race countdown beep` | Un bip de 0,1–0,2 s réutilisable trois fois. |
| Essentiel | Départ | `race start go`, `arcade start signal` | 0,3–0,7 s ; clairement distinct du bip précédent. |
| Essentiel | Moteur faible / rapide | `electric race motor loop`, `RC car motor loop`, `kart engine steady loop` | Deux boucles propres de 2–5 s selon le thème. Réglage de vitesse et fondu, volume discret pour les deux voitures. |
| Essentiel | Ramassage | `pickup collect short`, `arcade pickup chime` | 0,15–0,4 s ; une récompense brève. |
| Essentiel | Armement POWER | `weapon arm click charge`, `power ready short` | 0,2–0,6 s ; état prêt, distinct du ramassage et du départ d’un projectile. |
| Essentiel | Expiration / perte du bonus | `power down short`, `timer expired soft` | 0,2–0,5 s ; extinction, pas un son de collision. |
| Essentiel | Lance-pierre : traction | `rubber band stretch`, `slingshot tension` | 0,5–2 s ; texture de tension, pouvant être modulée pendant la traction. |
| Essentiel | Lance-pierre : lâcher | `slingshot release snap`, `rubber twang` | 0,1–0,3 s ; attaque franche. |
| Essentiel | Projectile : vol / danger | `projectile whoosh short`, `incoming warning blip` | Deux sons séparés : envol bref et alerte discrète à l’approche de l’impact. |
| Essentiel | Impact pierre / grosse collision | `arcade heavy impact`, `metal plastic impact short` | 0,2–0,6 s ; 2 ou 3 variantes, sans longue explosion militaire. |
| Essentiel | Petits chocs | `bumper hit`, `light collision thunk` | 0,05–0,25 s ; 2 ou 3 variantes ; limitation des répétitions rapprochées. |
| Essentiel | Sortie de piste / chute | `falling whistle short`, `fall whoosh descending` | 0,3–0,7 s ; accompagner la disparition dans le vide. |
| Essentiel | Panne | `engine stall short`, `electric shutdown` | 0,3–0,8 s ; arrêt du véhicule, différent de l’impact initial. |
| Essentiel | Boost : création | `energy gate deploy`, `power gate open short` | 0,2–0,5 s ; le portail apparaît. |
| Essentiel | Boost : passage / accélération | `turbo boost whoosh`, `nitro burst short` | 0,3–0,8 s ; poussée de vitesse, plus ouverte que le déploiement. |
| Essentiel | Réparation : début / progression / fin | `mechanical repair loop`, `repair complete chime` | Début court, boucle douce de 1–2 s et confirmation de 0,3–0,7 s. Arrêter dès qu’un contact est relâché. |
| Essentiel | Tangible : dépôt / activation / retrait | `magnetic dock click`, `power switch engage`, `power off short` | Trois transitions distinctes et courtes. Un son au changement d’état confirmé, pas lors du simple survol dans Oz. |
| Essentiel | Électricité | `electric arc loop`, `electric zap short` | Boucle très faible de 1–2 s et zap de 0,1–0,3 s en cas de contact. Pas de bourdonnement permanent envahissant. |
| Essentiel | Tour validé | `lap complete ping`, `racing checkpoint chime` | 0,15–0,4 s ; privilégier le tour complet plutôt qu’un son fort à chacun des huit checkpoints. |
| Essentiel | Arrivée / victoire / égalité | `arcade race finish fanfare`, `short victory sting`, `draw result sting` | 1–2,5 s ; terminer proprement, sans voix indispensable. |
| Complément | Déformation de piste | `rubber stretch creak`, `elastic bend short` | Début de traction et retour élastique courts, pas un son par point déplacé. |
| Complément | Pause / reprise | `pause resume UI short` | Deux clics apparentés, 0,1–0,25 s. |
| Complément | Pneus / glissement | `cartoon tire skid short`, `kart tire scrub` | Seulement si un glissement réel est détecté ; éviter un crissement continu en tournant. |
| Complément | Ambiance / musique | `instrumental arcade racing loop`, `playful racing instrumental loop`, `minimal synth racing loop` | Facultatif : boucle instrumentale sobre de 30–60 s, sans voix ni effets d’interface déjà intégrés. Après choix du thème. |

### Formats et rangement pour la collecte

Conserver les originaux en WAV, de préférence 48 kHz et 16 ou 24 bits. Effets courts mono ; musique et ambiance éventuellement stéréo. Pour les boucles, rechercher une continuité propre et une version sans réverbération longue. Deux ou trois variantes d’impact suffisent pour éviter la répétition.

Transmettre les fichiers avec un nom simple (`pickup`, `power-arm`, `sling-pull`, `sling-release`, `boost-pass`, etc.) et leur lien source / licence / attribution. L’intégration pourra convertir les fichiers pour la diffusion navigateur. Ne pas acheter un pack de moteur avant le choix de l’univers ; ne pas ajouter des sons pour les anciens bonus fantôme / destruction qui ne sont plus accessibles dans le jeu.

## Suite après décision

Faire d’abord une scène de référence complète dans le style choisi : deux voitures, piste et vide, arrivée, mur, paire de piliers, bonus, boost, impact, chute et réparation. Valider cette scène sur la table puis décliner l’accueil, le tracé et les résultats. Séparer palette, formes et effets des règles de jeu, pour ne pas coupler le thème aux futurs contrôles mobiles.
