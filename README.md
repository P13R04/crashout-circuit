# Crashout Circuit

Prototype de course asymétrique pour une grande table multitouch et un ordinateur « magicien d’Oz » sur le même Wi-Fi. Deux équipes ont chacune un pilote et un copilote. Le serveur partage et valide l’état de jeu ; Oz remplace pour l’instant les capteurs des objets tangibles.

## Lancer et connecter les deux écrans

Node.js ≥ 20 et Chrome / Edge sont recommandés.

```bash
npm install
npm run build
npm start
```

- **Table** : `http://localhost:3000/` sur l’ordinateur relié à la table, en plein écran.
- **Magicien d’Oz** : `http://<ip-de-la-table>:3000/oz` sur un autre ordinateur du même Wi-Fi. L’adresse exacte est affichée au démarrage. `localhost` désigne toujours l’ordinateur sur lequel le navigateur est ouvert.
- Pour changer le port : `PORT=3100 npm start`.

Le serveur doit rester ouvert pendant la séance. Les deux appareils doivent pouvoir communiquer sur le réseau local (un Wi-Fi invité qui isole les appareils ne convient pas). Ce prototype est prévu pour le réseau local de la séance ; il n’implémente pas de compte utilisateur.

### Développement

```bash
npm run build:server
npm run dev
```

Ouvrir `http://localhost:5173/client-table/` et `http://localhost:5173/client-oz/`. Vite relaie les échanges et les API vers le serveur du port 3000. Après une modification du serveur, relancer `npm run build:server`.

## Déroulement

Les partenaires d’une équipe sont en diagonale : pilote cyan en bas à gauche et copilote cyan en haut à droite ; pilote rose en haut à gauche et copilote rose en bas à droite. Chaque poste fait face à son bord de table. Les dépôts tangibles et l’attribution des gestes suivent la position du copilote.

1. Choisir **TABLE** (main) ou **PC** (souris).
2. Cyan place P1, Rose place P2 ; Cyan relie les deux points, puis Rose les relie dans sa moitié ; chacun peut commencer par P1 ou P2. Les deux modes utilisent cette création guidée et séquentielle. Le circuit suit les tracés, y compris les boucles et croisements ; les refus sont expliqués à l’écran.
3. Toucher le bouton à icône de circuit, puis **▶** sur la table. Le lancement, la pause et la remise à zéro appartiennent aux joueurs.
4. Le pilote conduit avec la bande gauche / droite. **Paramètres → Conduite**, séparément pour chaque équipe, bascule entre l’avance automatique et une pédale maintenue pour accélérer, à vitesse maximale réduite. Le pilote n’a plus de bouton pour utiliser les objets.
5. Le copilote utilise **POWER** pour son objet ramassé, réalise les gestes et répare avec le pilote. Oz gère seul l’activation des tangibles.
6. Une sortie de piste immobilise la voiture. Maintenir les deux pads de réparation pour la remettre en jeu. La pause fige la course et les durées des effets.

## Tester les tangibles avec deux personnes

**TEST TANGIBLES** est un mode distinct de TABLE, PC et TUTORIEL. Il prépare le circuit prédéfini ; **▶** démarre les deux voitures avec deux secondes de décalage. La session n’a ni limite de temps ni victoire : pause avec **⏸ / Espace**, retour à l’accueil avec la maison.

Les pilotes suivent le centre de la piste en envoyant des commandes de direction et d’accélération à la physique normale. Ils ne voient pas les obstacles et ne les évitent pas. Les murs provoquent de vrais rebonds, les piliers et arcs infligent leurs dégâts et leur ralentissement. Après une déviation, la voiture cherche progressivement le centre sans repositionnement artificiel. Un choc peut provoquer une sortie de piste et une panne.

Le copilote garde **POWER, les gestes, les bonus ramassés, les déformations et la réparation**. Oz conserve uniquement la pose, le retrait et l’activation des tangibles neutres. Les aides PC d’invincibilité et d’objets libres sont désactivées dans cette session.

Lorsqu’une réparation est nécessaire (voiture détruite ou moins de 60 HP), le pilote maintient automatiquement son pad. **Le copilote doit toujours maintenir le sien pendant 2 secondes** ; relâcher interrompt la réparation. La voiture repart ensuite toute seule. Une personne peut ainsi réparer les deux voitures à tour de rôle depuis leurs postes copilote respectifs.

### Parcours conseillé sur la table

1. Relancer la version à jour avec `npm run build` puis `npm start`. Ouvrir la table et la console Oz sur le même réseau.
2. Sur la table : **Paramètres → Plein écran**, puis **TEST TANGIBLES → ▶**. Une icône de circuit remplace la conduite manuelle.
3. Faire quelques tours sans obstacle, puis poser un mur diagonal depuis Oz. Observer le rebond, les HP et le retour vers le centre. Si une voiture tombe, désactiver le mur pour isoler la réparation, puis maintenir seulement son pad copilote.
4. Poser un pilier, puis le second à portée : vérifier les champs électriques, la liaison, les dégâts et le ralentissement sur chaque voiture. Les objets sont réutilisables immédiatement, sans recharge.
5. Tester aussi POWER et les gestes du copilote. Le mode ne donne pas de bonus gratuits : les voitures les ramassent normalement.
6. La maison permet de retrouver TABLE, PC et TUTORIEL avec leurs règles habituelles.

### Plein écran

**Paramètres → Plein écran** utilise le plein écran du navigateur pour toute la table. **Échap** en sort sans mettre la course en pause ; **Espace / ⏸** gère la pause. La commande est disponible dans tous les modes. Les contacts en cours sont relâchés lors du changement de taille, et le canvas conserve ses proportions 16:9. Pour l’échelle physique des LEGO, utiliser toute la dalle en plein écran.

## Tutoriel guidé

Le bouton **TUTORIEL** du lobby lance une course sur le circuit prédéfini, sans tours ni victoire et sans dégâts (les chutes remettent la voiture sur la piste). Chaque équipe suit **sa propre progression**, avec un bandeau orienté vers elle, un contour qui pulse sur la commande à utiliser et un bouton **PASSER**. Chaque étape est validée par l'événement réel du jeu, jamais par un minuteur :

1. direction à gauche puis à droite ; mode de conduite (pédale, puis retour en auto, indépendamment pour chaque pilote) ;
2. ramasser un objet (le serveur impose le lance-pierre), POWER, tir ; ramasser un boost, POWER, portail, le traverser ;
3. déformer un bord de piste (deux doigts ; absente en mode PC, une souris n'a qu'un contact) ;
4. réparation à deux : le serveur met la voiture en panne à cette étape ;
5. un mur puis un arc adverses posés sur la route par le serveur ;
6. un arc de deux piliers activés par l'opérateur Oz (facultative : à passer si Oz est absent).

Un objet armé ne périme pas. Si un portail déjà créé n’est pas traversé, l’équipe peut recommencer la leçon avec un nouveau boost. Le mode (table ou PC) est déduit du pointeur qui touche le bouton ; les interrupteurs de test PC sont désactivés. À la fin des deux équipes, un écran renvoie à l'accueil. La logique est dans `server/Tutorial.ts`, l'affichage dans `client-table/TutorialOverlay.ts`.

## Priorité des gestes et reprise après réparation

L’annonce d’un tangible réserve tous les nouveaux contacts sur la carte jusqu’à sa pose ou son annulation (**A / Échap** dans Oz). Le bonus déjà armé reste en stock mais son geste est suspendu. Sans tangible attendu, un seul bonus peut être armé : la table affiche son symbole et reconnaît ce type de geste. Un troisième doigt parasite ne transforme pas un boost en lance-pierre. L’autre copilote peut utiliser ce bonus tout en gardant le sien, puis armer son propre stock après consommation du premier.

Les deux contacts du boost ou de la fourche du lance-pierre peuvent arriver avec jusqu’à 1,6 s d’écart. Les contacts peuvent être simultanés, maintenus ou brièvement tapés. La fourche reste mémorisée si un appui se lève ; seul le relâchement du doigt qui tire déclenche le projectile. Une correction de position sur un seul doigt ne bloque plus un boost attendu. La déformation reste disponible sur le bord : une traction cohérente à deux doigts prend le pas sur des appuis immobiles, même avec un bonus armé. La prise utilise les bords effectivement dessinés, notamment dans l’intérieur des coudes.

Une voiture réparée attend **3 secondes** au point de reprise : trois feux rouges au-dessus du modèle, puis vert et départ. Les dégâts et mouvements ne reprennent pas pendant cette attente ; la pause fige aussi ces feux.

## Réglages de course

Dans l’engrenage **à gauche entre les pilotes** : **Easy** (50 %, par défaut), **Medium** (75 %) ou **Hard** (vitesse de référence), nombre de tours (1–99) et chronomètre facultatif (désactivé par défaut). Le réglage de vitesse s’applique aussi aux pédales et aux pilotes automatiques de test. Les valeurs sont partagées avec les clients et conservées au retour à l’accueil. Activer ou changer un chrono pendant la course démarre la nouvelle durée à cet instant ; la pause le fige. Accueil se trouve uniquement dans les paramètres.

La prise de piste accepte une marge intérieure/extérieure de **50 px logiques** autour de son bord et utilise la tangente locale dans les virages. Deux contacts immobiles peuvent créer un boost armé ; une traction engage la déformation.

## POWER et objets ramassés

Les boutons nommés **FANTÔME** et **DÉTRUIRE** ont été retirés de la zone copilote. Le copilote possède un seul bouton d’action, **POWER**, et le pad de réparation.

1. La voiture ramasse un objet lorsque son stock est vide. Son icône apparaît comme information dans le poste copilote.
2. **Seul POWER du copilote de l’équipe propriétaire peut armer ce stock.** POWER adverse ne l’arme pas. L’objet reste armé jusqu’au geste valide.
3. Sans limite de temps après l’armement, le geste correspondant est disponible sur la surface partagée : **3 doigts rapprochés, tirer l’un d’eux puis relâcher** pour le lance-pierre à élastique, **2 contacts simultanés ou décalés, espacés de 0 à 400 px** pour le portail de boost (largeur minimale de piste active : 110 px).
4. L’armement est **neutre et volable** : le premier geste valide consomme l’objet armé du propriétaire, et l’effet appartient à l’équipe qui a exécuté le geste. Le lance-pierre touche toute voiture dans sa zone d’impact, tireur compris ; un portail volé aide l’équipe qui l’a créé.
5. L’objet n’est jamais perdu par attente : il reste dans le stock avant armement, puis armé tant que personne ne réalise le geste. Un seul stock peut être armé sur toute la table : le premier POWER réserve son geste, sans consommer le stock de l’autre copilote. Après son utilisation, un nouveau stock peut être armé immédiatement. Un stock ne peut être consommé qu’une fois.

La table tactile ne reconnaît pas l’identité d’une personne : l’équipe qui fait le geste est celle du poste copilote le plus proche. Les gestes et le vol fonctionnent sans connexion Oz. Le magicien n’attribue plus les gestes et ne peut pas donner, armer ou déclencher de bonus.

### Tester les gestes à la souris

Le tiroir **Test PC**, fermé par défaut, apparaît en course avec une souris, ou avec `?sim=1`. Ramasser d’abord un objet avec la voiture, puis toucher le symbole **POWER** au poste copilote :

- **Lance-pierre** : maintenir le clic pour poser la fourche, tirer en arrière, puis relâcher. La trajectoire est prévisualisée et la pierre vole depuis la poche. En mode PC, ce geste est disponible directement dès qu’un lance-pierre est armé.
- **Boost** puis deux clics définissent le portail. Son centre vient des contacts, sa largeur vaut au moins 110 px et son orientation suit la piste. Aux croisements, l’axe entre les contacts indique la branche à traverser.

Les simulations passent par les mêmes règles d’armement, de vol et de consommation que les gestes tactiles. Le lance-pierre conserve les paramètres de `main` : traction minimale de 40 px, portée croissante et dégâts de 100 HP.

En course **PC uniquement**, ce tiroir contient aussi **Invincibles** et **Objets libres**. Ces outils de développement restent ignorés en mode table et ne sont pas accessibles à Oz.

## Interface de la table : essai visuel

Après `npm run build` puis `npm start`, ouvrir `http://localhost:3000/`.

1. Choisir **TABLE** ou **PC**. Placer P1 puis P2 : les pastilles cyan et rose indiquent l’ordre. Essayer un P2 trop proche : un message bref apparaît et P1 reste en place.
2. Relier les deux points dans la moitié éclairée, dans le sens de son choix ; dès le premier contact, l’autre point devient l’arrivée. L’arrivée devient verte au contact. Après le cyan, le rose prend la main. Les coches remplacent les messages de validation. Toucher le circuit, puis ▶ pour démarrer.
3. Piloter avec la zone à volant. Basculer **AUTO / PÉDALE** dans Paramètres → Conduite ; sa pédale apparaît dans un poste légèrement élargi, sans changer le mode de l’autre équipe. Les tours se lisent près du drapeau de chaque pilote, le temps près du circuit.
4. Ramasser un bonus : son icône se relie à POWER. Armer : le contour devient doré, l’anneau reste plein et les contacts indiquent le geste à deux ou trois doigts. Tester aussi le geste adverse, une longue attente et le lance-pierre (jauge de traction et cible).
5. Déposer un tangible depuis Oz : la zone à empreintes devient occupée (contour continu et pastilles), puis verte avec un éclair après activation par Oz. POWER n’intervient pas dans ce changement.
6. En panne, chercher la clé près de la voiture et dans les postes. Maintenir les deux clés : les deux témoins s’allument et l’anneau se remplit. Relâcher un poste interrompt la progression.
7. Toucher ⏸ puis le grand ▶ central pour reprendre. À la fin, le trophée et le cadre indiquent le gagnant ; les cartes montrent tours et points de passage. ↶ relance une partie ; la maison retourne à l’accueil.
8. Sur PC, ouvrir et refermer **Test PC** : les simulations et les deux options restent accessibles sans barre permanente sur le jeu. Une connexion perdue affiche un statut jusqu’au retour du serveur.

Vérifier les deux orientations de lecture sur la table réelle. Les pictogrammes des commandes sont partagés ; seuls les intitulés courts, le temps et les résultats utiles à chaque côté sont orientés pour leur lecteur. Le réglage système « réduire les animations » stabilise les halos, les chevrons et les clignotements décoratifs.

## Console Oz : tangibles neutres et dépôt

La console `/oz` gère **un mur** et **deux piliers** neutres. Ils sont disponibles immédiatement, sans recharge, cooldown ou limite de déplacement. Leurs effets concernent les deux voitures. Oz ne lance pas la partie et ne gère pas les bonus.

Dans **Pose tactile**, cliquer **Mur / 1 (&)**, **Pilier 1 / 2 (é)** ou **Pilier 2 / 3 (")**, puis déposer l’objet avec deux contacts neufs. Les chiffres du pavé numérique fonctionnent aussi ; les raccourcis sont ignorés dans les champs et sélecteurs. Le milieu fixe le centre ; le grand axe du mur est perpendiculaire à l’axe des doigts. Les dimensions LEGO restent fixes. Deux contacts valides sont confirmés après 90 ms ; ils peuvent être décalés de 1,6 s, même si le premier doigt est levé. Lever les doigts ne retire pas l’objet.

La zone neutre **à droite, entre les deux copilotes** présente les trois tangibles au début de la partie. Une pose dans cette zone les désactive : ni collision, ni champ, ni arc électrique. Ils peuvent être reposés sur le circuit immédiatement, après une nouvelle annonce d’Oz. Cliquer un objet sur la carte Oz signale aussi son retrait et le renvoie inactif au dépôt. Sélectionner directement un objet déjà posé prépare son replacement et coupe son ancien effet.

L’attente d’Oz dure 20 secondes avec **Annuler / Échap** ; ce délai concerne seulement l’annonce de pose, pas un bonus armé. Pause, reset, déconnexion et changement de mode annulent cette attente. Les anciens contacts, paumes, prises ambiguës et paquets périmés sont rejetés. Pendant l’attente, les nouveaux contacts sur la carte servent uniquement à la pose ; le pilotage et la réparation continuent.

Le **Placement manuel** conserve les outils de Baptiste : deux points pour les piliers/arc ou pour le mur, déplacement au clic ou au glissement et rotation du mur à la molette. Aucun passage par un poste copilote n’est nécessaire.

Un pilier seul produit un champ au sol ; deux piliers actifs forment un arc jusqu’à **350 px logiques**. Les dégâts, collisions et ralentissements restent calculés par le serveur. Le [briefing et la recette sur dalle](docs/pose-tactile.md) décrivent les essais.

### Échelle LEGO et tolérance de placement

`config.json` définit **`tableDiagonalInches: 55`**. L’échelle vise l’image active **16:9, plein écran**, et reste indépendante de sa résolution en pixels. Le pas LEGO nominal de 8 mm donne :

| Élément | Empreinte réelle | Rendu logique sur 55″ |
|---|---|---|
| Mur 10 × 4 | 80 × 32 mm | ≈126 × 50 px |
| Pilier 4 × 4 | 32 × 32 mm | ≈50 × 50 px |
| Frange du mur | 10 mm autour | ≈16 px autour |
| Champ électrique d’un pilier | diamètre 84 mm | ≈132 px |

La frange douce du mur couvre un petit décalage sans allonger artificiellement ses extrémités ; les rebonds utilisent un rectangle à coins arrondis et détectent aussi une traversée entre deux images. Le socle du pilier est précis, son champ diffus reste visible au-delà du LEGO. Aucune aimantation sur la piste ne décale l’objet observé : elle pourrait aggraver un décalage réel. Le mode **Pose tactile** utilise le milieu des contacts sans aimantation sur la piste ; le mode manuel reste disponible.

Le module nominal est documenté par LEGO : brique 2 × 4 d’environ 32 × 16 mm, [brevet EP3717086, §0021](https://data.epo.org/publication-server/rest/v1.2/patents/EP3717086NWB1/document.pdf).

**Essai sur la vraie table :**

1. Afficher le jeu en plein écran sans marge, puis comparer le mur avec une base 10 × 4 et le socle avec une 4 × 4. Si la diagonale réelle diffère, régler `tableDiagonalInches`, puis relancer le serveur. Une fenêtre de navigateur réduite ne peut pas conserver les dimensions physiques.
2. Dans **Pose tactile**, annoncer le mur, puis le poser avec deux contacts autour de sa largeur : comparer son centre et son orientation au LEGO. Vérifier les deux sens de prise, le retrait des doigts et une pose près d’un bord de piste.
3. Enlever le mur physiquement et le cliquer sur la carte Oz : son effet doit disparaître. Sans nouvelle annonce, deux contacts ne doivent pas le replacer. Après une nouvelle annonce, essayer ailleurs ou dans le dépôt neutre. Les deux voitures doivent subir le même mur.
4. Poser un pilier : vérifier le champ au sol et le ralentissement des deux voitures. Poser le second à portée : vérifier l’arc. Désactiver un pilier ou le remettre en station : le champ et l’arc disparaissent.
5. Décaler volontairement le LEGO de 5 à 10 mm et observer depuis les deux côtés. Au-delà de cette marge, corriger Oz ou refaire la pose après recharge. L’alignement et le confort restent à valider avec les objets sur la dalle réelle.

## Intégration des branches fonctionnelles

Les travaux #41 (postes et conduite par équipe), #30 (corridor de boost), #31 (retours des tangibles), #32 (tutoriel) et #34 (console Oz) sont réunis avec leur historique. L’inversion des copilotes n’est appliquée qu’une fois. Les deux thèmes, les animations, les commandes sémantiques et les bonus autonomes sont conservés. Le tutoriel utilise les commandes de conduite par équipe et les piliers neutres ; il peut être parcouru sans Oz en passant son étape dédiée.

La branche `baptiste` est maintenant intégrée : dessin possible dans les deux sens pour l’équipe active, bonus qui suivent la piste déformée et placement sûr des bonus. Le parcours guidé, les zones hors postes et les thèmes récents sont conservés. Le [bilan d’intégration](docs/integration-equipe.md) précise les apports de chaque branche et les adaptations.

## Commandes et extensions futures

Le jeu reçoit des **actions de jeu**, indépendantes des périphériques. `client-shared/controls.ts` est l’interface commune aux adaptateurs clavier et tactile : direction, POWER et gestes. Les types de messages sont dans `server/types.ts` ; les objets fixes et la validation partagée sont dans `server/tangibles.ts` ; les règles et la consommation des stocks restent validées dans `server/GameRules.ts`.

Un futur adaptateur mobile pourra convertir un gyroscope en direction normalisée `[-1, 1]` et utiliser la même interface, sans modifier la physique. Aucun contrôle mobile, appairage ni accès aux capteurs n’est implémenté à ce stade. Un futur lecteur de tangibles pourra envoyer les mêmes actions de présence, déplacement et retrait qu’Oz, après ajout de son rôle de connexion.

| Équipe | Direction clavier | Accélération en mode pédale | POWER du copilote | Réparation des deux postes |
|---|---|---|---|---|
| Cyan | `Q` / `D` | maintenir `Z` | `A` | maintenir `A` + `P` |
| Rose | `←` / `→` | maintenir `↑` | `M` | maintenir `M` + `C` |

Deux doigts proches saisissant le même bord de piste déplacent sa section tant que la traction évolue. L’amplitude maximale est de **220 px**, avec une rampe de 0,18 s et une transition plus large ; la largeur de chaussée reste identique. Les déplacements sont limités pour garder la piste hors des contrôles et de l’écran. Les interventions successives se fondent sans additionner leurs amplitudes au-delà de la limite. Les paramètres sont dans `config.json` ; relancer le serveur après modification.

### Messages tangibles

`TangibleMoved` reçoit `{ id, x, y, angle, active? }` depuis Oz pour une pose manuelle. Les positions sont normalisées ; l’angle est en degrés. Une nouvelle pose sur le circuit est active par défaut ; dans le dépôt, elle est toujours inactive. `TangibleRemoved` replace l’objet inactif au dépôt. `TangibleControl` conserve l’activation/désactivation ; l’ancien `dock` est un alias de retour au dépôt. Les identifiants et types sont fixes et neutres.

`TangiblePrepare` crée l’autorisation de pose tactile pour un objet ; seule la table peut confirmer `TangibleTouchPlaced` avec le jeton courant et ses deux contacts. Le serveur recalcule la géométrie, consomme l’autorisation une fois et vérifie le dépôt. Le journal `/api/oz-log` conserve les poses et retraits.

## Vérification

**Avant de fusionner une branche, lancer `npm run check`.** Cette commande vérifie les types des clients et du serveur, puis lance les tests d’acceptation, de gestes et de réseau, et enfin le build. La même commande tourne sur GitHub pour chaque pull request et chaque push sur `main` (`.github/workflows/check.yml`) ; une compilation ou un test cassé est signalé avant la fusion.

`npm run verify` exécute tous les contrôles ci-dessous et compile les deux applications.

```bash
npm run typecheck
npm run test:acceptance
npm run test:gestures
npm run test:network
npm run test:visuals
npm run test:tangibles
npm run test:autopilot
npm run test:boost
npm run test:tangible-touch
npm run build
```

Les tests couvrent génération, conduite, collisions neutres, réparation, armement, vol, pause, présence des trois tangibles fixes, pose atomique, rotation autour du centre et à pivot fixe, raccourcis AZERTY, annulation groupée, transformations dans les quatre vues, commandes rapides avec anciens états réseau, déconnexion, journal serveur rejoué et séparation des rôles réseau. La validation matérielle des contacts simultanés et de la latence sur la table réelle reste à réaliser ; voir `measures.md`. L’affichage de diagnostic s’active avec `?debug=1` ou F3. Le journal des événements tangibles du serveur est disponible sur `/api/oz-log`.

## Structure

L’audit graphique, les trois directions proposées et la liste de sons à chercher sont dans [docs/direction-artistique.md](docs/direction-artistique.md). Cinq thèmes sont disponibles dans **Paramètres → Ambiance** : **Néon**, **Ferraille**, **Toy Circuit**, **F1 Classic** et **Mayhem**. Chaque ambiance possède son décor animé, sa piste, sa voiture et ses commandes ; le cyan et le rose identifient toujours les équipes. Le choix est mémorisé localement et peut changer pendant la partie. Voir [les thèmes et leur parcours de vérification](docs/themes.md) et [les détails du rendu néon](docs/rendu-neon.md). L’[audit des textes et de l’orientation](docs/lisibilite.md) documente les choix de lisibilité des issues #26 et #35.

```text
server/          état autoritaire, règles, physique, génération, tutoriel, WebSocket
client-table/    rendu Canvas, HUD, adaptateur tactile et clavier
client-oz/       console du magicien et simulation des tangibles
client-shared/   interface d’actions, connexion et synchronisation
scripts/         tests des règles et du protocole réseau
prototypes/      laboratoire historique, conservé sans modification
```

Les anciennes règles expérimentales fantôme / destruction restent dans le moteur pour référence, mais ne sont plus exposées comme boutons ou commandes de la table. Les spécifications historiques de `.kiro/` et le laboratoire ne décrivent donc pas toujours les commandes actuelles ; ce README décrit le prototype fonctionnel.
