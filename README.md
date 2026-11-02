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
- **Magicien d’Oz** : `http://<ip-de-la-table>:3000/oz` sur un ordinateur, une tablette ou un téléphone du même Wi-Fi. Accès direct par cette adresse, sans code ni connexion supplémentaire. L’adresse exacte est affichée au démarrage. `localhost` désigne toujours l’ordinateur sur lequel le navigateur est ouvert.
- Pour changer le port : `PORT=3100 npm start`.

Le serveur doit rester ouvert pendant la séance. Les deux appareils doivent pouvoir communiquer sur le réseau local (un Wi-Fi invité qui isole les appareils ne convient pas). Ce prototype est prévu pour le réseau local de la séance ; il n’implémente pas de compte utilisateur.

### Récupérer la version des tests utilisateurs

La préparation de séance se trouve sur **`feat/preparation-tests-utilisateurs`**. `main` ne contient pas encore l’identification initiale des quatre postes ni les dernières adaptations du tutoriel et de la console.

Arrêter l’ancien serveur, puis, depuis le dossier du projet :

```bash
git fetch origin
git switch feat/preparation-tests-utilisateurs
git pull --ff-only origin feat/preparation-tests-utilisateurs
npm ci
npm run build
npm start
```

Recharger ensuite la table sur `http://localhost:3000/`. `npm start` et `npm run dev:server` exécutent `dist/server/` : récupérer les sources sans reconstruire peut laisser fonctionner un ancien tutoriel. Ne pas définir `CRASHOUT_DEV_TOOLS` pendant la séance.

Au lancement de **TUTORIEL**, les voitures attendent l’appui sur les quatre clés de réparation. Les contacts peuvent être successifs ; le quatrième poste identifié déclenche les trois secondes de feux communs. La réparation apprise plus tard demande, elle, de maintenir les deux clés de l’équipe ensemble.

### Développement

```bash
npm run build:server
npm run dev
```

Ouvrir `http://localhost:5173/client-table/` et `http://localhost:5173/client-oz/`. Vite relaie les échanges et les API vers le serveur du port 3000. Après une modification du serveur, relancer `npm run build:server`.

## Déroulement

Les partenaires d’une équipe sont en diagonale : pilote cyan en bas à gauche et copilote cyan en haut à droite ; pilote rose en haut à gauche et copilote rose en bas à droite. Chaque poste fait face à son bord de table. Les dépôts tangibles et l’attribution des gestes suivent la position du copilote.

1. Choisir **TUTORIEL** pour découvrir le jeu à quatre, ou **COURSE** pour créer directement un circuit. Le thème de séance est **Ferraille**. Le choix des ambiances et de la conduite reste réservé aux outils de développement.
2. Cyan place P1, Rose place P2 ; Cyan relie les deux points, puis Rose les relie dans sa moitié ; chacun peut commencer par P1 ou P2. La création est guidée et séquentielle. Le circuit suit les tracés, y compris les boucles et croisements ; les refus sont expliqués à l’écran.
3. Toucher le bouton à icône de circuit : le revêtement se dessine progressivement, puis la ligne à damier fait plusieurs tours et ralentit jusqu’à sa position aléatoire. Quand elle est fixée, **▶** permet de lancer la course sur la table. Le lancement, la pause et la remise à zéro appartiennent aux joueurs.
4. Le pilote conduit avec la bande gauche / droite. **Avec les outils de développement**, **Paramètres → Conduite**, séparément pour chaque équipe, bascule entre l’avance automatique et une pédale maintenue pour accélérer, à vitesse maximale réduite. Le pilote n’a plus de bouton pour utiliser les objets.
5. Le copilote utilise **POWER** pour son objet ramassé, réalise les gestes et répare avec le pilote. Oz gère seul l’activation des tangibles.
6. Une sortie de piste immobilise la voiture. Maintenir les deux pads de réparation pour la remettre en jeu. La pause fige la course et les durées des effets.

## Tester les tangibles avec deux personnes

**Réservé à la préparation, jamais à la séance utilisateur.** Relancer le serveur avec `CRASHOUT_DEV_TOOLS=1 npm start` (PowerShell : `$env:CRASHOUT_DEV_TOOLS="1"; npm start`), puis recharger la table. Le bouton **ESSAI OBJETS** ouvre le mode de test autonome. En démarrage normal, ce bouton, le mode clavier, les simulations, F3/F4 et les paramètres de diagnostic sont désactivés ; le serveur refuse aussi les commandes de test. Supprimer cette variable puis redémarrer pour revenir à la version de séance.

Ce mode reste distinct de COURSE et TUTORIEL. Il prépare le circuit prédéfini ; **▶** démarre les deux voitures avec deux secondes de décalage. La session n’a ni limite de temps ni victoire : pause avec **⏸ / Espace**, retour à l’accueil avec la maison.

Les pilotes suivent le centre de la piste en envoyant des commandes de direction et d’accélération à la physique normale. Ils ne voient pas les obstacles et ne les évitent pas. Les murs provoquent de vrais rebonds, les piliers et arcs infligent leurs dégâts et leur ralentissement. Après une déviation, la voiture cherche progressivement le centre sans repositionnement artificiel. Un choc peut provoquer une sortie de piste et une panne.

Le copilote garde **POWER, les gestes, les bonus ramassés, les déformations et la réparation**. Oz conserve uniquement la pose, le retrait et l’activation des tangibles neutres. Les aides PC d’invincibilité et d’objets libres sont désactivées dans cette session.

Lorsqu’une réparation est nécessaire (voiture détruite ou moins de 60 HP), le pilote maintient automatiquement son pad. **Le copilote doit toujours maintenir le sien pendant 2 secondes** ; relâcher interrompt la réparation. La voiture repart ensuite toute seule. Une personne peut ainsi réparer les deux voitures à tour de rôle depuis leurs postes copilote respectifs.

### Parcours conseillé sur la table

1. Relancer la version à jour avec `npm run build` puis `npm start`. Ouvrir la table et la console Oz sur le même réseau.
2. Sur la table : **Paramètres → Plein écran**, puis **ESSAI OBJETS → ▶** (outils de développement activés). Une icône de circuit remplace la conduite manuelle.
3. Faire quelques tours sans obstacle, puis poser un mur diagonal depuis Oz. Observer le rebond, les HP et le retour vers le centre. Si une voiture tombe, désactiver le mur pour isoler la réparation, puis maintenir seulement son pad copilote.
4. Poser un pilier, puis le second à portée : vérifier les champs électriques, la liaison, les dégâts et le ralentissement sur chaque voiture. Les objets sont réutilisables immédiatement, sans recharge.
5. Tester aussi POWER et les gestes du copilote. Le mode ne donne pas de bonus gratuits : les voitures les ramassent normalement.
6. **Paramètres → Accueil** retrouve le menu. Désactiver `CRASHOUT_DEV_TOOLS` et redémarrer avant d’accueillir les participants.

### Plein écran

**Paramètres → Plein écran** utilise le plein écran du navigateur pour toute la table. **Échap** en sort sans mettre la course en pause ; **Espace / ⏸** gère la pause. La commande est disponible dans tous les modes. Les contacts en cours sont relâchés lors du changement de taille, et le canvas conserve ses proportions 16:9. Pour l’échelle physique des LEGO, utiliser toute la dalle en plein écran.

## Tutoriel guidé

Le bouton **TUTORIEL** lance le parcours à quatre sur le circuit prédéfini, sans victoire ni perte de vie. Les quatre joueurs identifient leur poste en touchant leur clé de réparation avant les feux de départ. Chaque poste reçoit une consigne courte orientée vers son joueur, une démonstration animée et un rappel de sa couleur ; les coéquipiers sont en diagonale.

Les équipes essaient ensuite la direction, les objets ramassés, POWER, le lance-pierre, le boost, la déformation à deux doigts et la réparation à deux. La partie tangible utilise les vrais objets : pose du mur, contact de la voiture, pose des deux piliers et essai de leur effet électrique. Les deux équipes terminent en rangeant les trois objets dans la réserve. **CRÉER LE CIRCUIT** ouvre directement la création d’une course normale, avec les paramètres choisis auparavant.

La console guide l’opérateur pour annoncer chaque pose juste avant les contacts, et retirer chaque objet soulevé. Aucune sélection de la console ne produit de symbole d’attente sur la table. Le [protocole de séance](docs/sessions-de-test.md) décrit les interventions réservées à l’opérateur et les vérifications sur la table. Avec les outils de développement activés côté serveur, le tutoriel clavier reste accessible avec `/client-table/?tutorial=pc` ; un clic à la souris sur TUTORIEL conserve par défaut le parcours tactile.

### Révélation du circuit et tirage de la ligne

Après validation des deux tracés, le revêtement se révèle en **1,8 s**. Une ligne à damier fait ensuite au moins deux tours : vitesse constante au début, puis décélération sur **3,4 s**, et fixation lumineuse de **0,45 s**. Aucun texte supplémentaire n’est nécessaire. De petits clics accompagnent le ralentissement ; le signal « circuit prêt » attend la fixation.

Le serveur tire la position parmi les portions les moins courbées, en évitant les croisements pour la ligne et les voitures. Il recale ensemble les voitures, les checkpoints et les objets ramassables. La présentation partage une horloge commune : une reconnexion reprend au bon moment et ne refait pas le tirage. Un appui anticipé sur le départ est ignoré. Les circuits prédéfinis du tutoriel et du test tangibles restent immédiats.

Les cinq thèmes gardent leurs matériaux et leurs bordures ; le cache du revêtement est réutilisé pendant toute l’animation. Le réglage de réduction des animations remplace le parcours rapide par un fondu et une ligne fixe. Pour tester : **COURSE → tracer les deux moitiés → icône de circuit**, observer la révélation et le ralentissement, puis démarrer une course avec **▶**.

## Priorité des gestes et reprise après réparation

L’annonce d’un tangible réserve tous les nouveaux contacts sur la carte jusqu’à sa pose ou son annulation (**A / Échap** dans Oz). Le bonus déjà armé reste en stock mais son geste est suspendu. Sans tangible attendu, un seul bonus peut être armé : la table affiche son symbole et reconnaît ce type de geste. Un troisième doigt parasite ne transforme pas un boost en lance-pierre. L’autre copilote peut utiliser ce bonus tout en gardant le sien, puis armer son propre stock après consommation du premier.

Les deux contacts du boost ou de la fourche du lance-pierre peuvent arriver avec jusqu’à 1,6 s d’écart. Les contacts peuvent être simultanés, maintenus ou brièvement tapés. La fourche reste mémorisée si un appui se lève ; seul le relâchement du doigt qui tire déclenche le projectile. Une correction de position sur un seul doigt ne bloque plus un boost attendu. La déformation reste disponible sur le bord : une traction cohérente à deux doigts prend le pas sur des appuis immobiles, même avec un bonus armé. La prise utilise les bords effectivement dessinés, notamment dans l’intérieur des coudes.

Une voiture réparée attend **3 secondes** au point de reprise : trois feux rouges au-dessus du modèle, puis vert et départ. Les dégâts et mouvements ne reprennent pas pendant cette attente ; la pause fige aussi ces feux.

## Réglages de course

Dans l’engrenage **à gauche entre les pilotes** : **Facile** (50 %, par défaut), **Moyen** (75 %) ou **Difficile** (vitesse de référence), nombre de tours (1–99) et chronomètre facultatif (désactivé par défaut). Le réglage de vitesse s’applique aussi aux pédales et aux pilotes automatiques de test. Les valeurs sont partagées avec les clients et conservées au retour à l’accueil. Activer ou changer un chrono pendant la course démarre la nouvelle durée à cet instant ; la pause le fige. Accueil se trouve uniquement dans les paramètres.

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

Ces outils nécessitent **`CRASHOUT_DEV_TOOLS=1` sur le serveur**. Le tiroir de simulation apparaît alors en course avec une souris, ou avec `?sim=1`. Aucun paramètre d’URL ne les active dans une session normale. Ramasser d’abord un objet avec la voiture, puis toucher le symbole **POWER** au poste copilote :

- **Lance-pierre** : maintenir le clic pour poser la fourche, tirer en arrière, puis relâcher. La trajectoire est prévisualisée et la pierre vole depuis la poche. En mode PC, ce geste est disponible directement dès qu’un lance-pierre est armé.
- **Boost** puis deux clics définissent le portail. Son centre vient des contacts, sa largeur vaut au moins 110 px et son orientation suit la piste. Aux croisements, l’axe entre les contacts indique la branche à traverser.

Les simulations passent par les mêmes règles d’armement, de vol et de consommation que les gestes tactiles. Le lance-pierre conserve les paramètres de `main` : traction minimale de 40 px, portée croissante ; la pierre retire 50 HP et étourdit 1,5 s (deux pierres mettent une voiture à pleine santé hors d’usage).

En course **PC uniquement**, ce tiroir contient aussi **Invincibles** et **Objets libres**. Ces outils de développement restent ignorés en mode table et ne sont pas accessibles à Oz.

## Interface de la table : essai visuel

Après `npm run build` puis `npm start`, ouvrir `http://localhost:3000/`.

1. Choisir **COURSE**. Placer P1 puis P2 : les pastilles cyan et rose indiquent l’ordre. Essayer un P2 trop proche : un message bref apparaît et P1 reste en place.
2. Relier les deux points dans la moitié éclairée, dans le sens de son choix ; dès le premier contact, l’autre point devient l’arrivée. L’arrivée devient verte au contact. Après le cyan, le rose prend la main. Les coches remplacent les messages de validation. Toucher le circuit, puis ▶ pour démarrer.
3. Piloter avec la zone à volant. Basculer **AUTO / PÉDALE** dans Paramètres → Conduite ; sa pédale apparaît dans un poste légèrement élargi, sans changer le mode de l’autre équipe. Les tours se lisent près du drapeau de chaque pilote, le temps près du circuit.
4. Ramasser un bonus : son icône se relie à POWER. Armer : le contour devient doré, l’anneau reste plein et les contacts indiquent le geste à deux ou trois doigts. Tester aussi le geste adverse, une longue attente et le lance-pierre (jauge de traction et cible).
5. Déposer un tangible depuis Oz : la zone à empreintes devient occupée (contour continu et pastilles), puis verte avec un éclair après activation par Oz. POWER n’intervient pas dans ce changement.
6. En panne, chercher la clé près de la voiture et dans les postes. Maintenir les deux clés : les deux témoins s’allument et l’anneau se remplit. Relâcher un poste interrompt la progression.
7. Toucher ⏸ puis le grand ▶ central pour reprendre. À la fin, le trophée et le cadre indiquent le gagnant ; les cartes montrent tours et points de passage. ↶ relance une partie ; la maison retourne à l’accueil.
8. Dans une séance normale, ouvrir les paramètres : aucun outil de simulation, d’invincibilité ou de bonus gratuits ne doit apparaître. Une connexion perdue affiche un statut jusqu’au retour du serveur.

Vérifier les deux orientations de lecture sur la table réelle. Les pictogrammes des commandes sont partagés ; seuls les intitulés courts, le temps et les résultats utiles à chaque côté sont orientés pour leur lecteur. Le réglage système « réduire les animations » stabilise les halos, les chevrons et les clignotements décoratifs.

## Console Oz : tangibles neutres et dépôt

La console `/oz` gère **un mur** et **deux piliers** neutres. Ils sont disponibles immédiatement, sans recharge, cooldown ou limite de déplacement. Leurs effets concernent les deux voitures. Oz ne lance pas la partie et ne gère pas les bonus.

Dans **Pose avec les doigts** (mode initial), cliquer **Mur / 1 (&)**, **Pilier 1 / 2 (é)** ou **Pilier 2 / 3 (")**, puis déposer l’objet avec deux contacts neufs. Les chiffres du pavé numérique fonctionnent aussi ; les raccourcis sont ignorés dans les champs et sélecteurs. Le milieu fixe le centre ; le grand axe du mur est perpendiculaire à l’axe des doigts. Les dimensions LEGO restent fixes. Deux contacts valides sont confirmés après 90 ms ; ils peuvent être décalés de 1,6 s, même si le premier doigt est levé. Lever les doigts ne retire pas l’objet.

La zone neutre **à droite, entre les deux copilotes** présente les trois tangibles au début de la partie. Une pose dans cette zone les désactive : ni collision, ni champ, ni arc électrique. Ils peuvent être reposés sur le circuit immédiatement, après une nouvelle annonce d’Oz. Cliquer un objet sur la carte Oz signale aussi son retrait et le renvoie inactif au dépôt. Sélectionner directement un objet déjà posé prépare son replacement et coupe son ancien effet.

L’attente d’Oz dure 20 secondes avec **Annuler / Échap** ; ce délai concerne seulement l’annonce de pose, pas un bonus armé. Pause, reset, déconnexion et changement de mode annulent cette attente. Les anciens contacts, paumes, prises ambiguës et paquets périmés sont rejetés. Pendant l’attente, les nouveaux contacts sur la carte servent uniquement à la pose ; le pilotage et la réparation continuent.

La **Pose sur la carte** conserve les outils de Baptiste : deux points pour les piliers/arc ou pour le mur, déplacement au toucher ou au glissement, rotation en tirant la poignée du mur et boutons **−15° / +15°** dans **Objets et orientation**. La molette reste utilisable sur ordinateur. Les cartes des trois objets proposent **Activer / Désactiver / Retirer**, utilisables sans clavier ni clic droit. Le bouton ↻ tourne la carte ; une vue portrait s’adapte automatiquement au téléphone. Le circuit prédéfini du tutoriel est affiché comme celui d’une course ; la pose, le retrait et l’activation des objets y restent disponibles. Le journal se télécharge dans **Objets et orientation**. Aucun passage par un poste copilote n’est nécessaire.

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
2. Dans **Pose avec les doigts** (mode initial), annoncer le mur, puis le poser avec deux contacts autour de sa largeur : comparer son centre et son orientation au LEGO. Vérifier les deux sens de prise, le retrait des doigts et une pose près d’un bord de piste.
3. Enlever le mur physiquement et le cliquer sur la carte Oz : son effet doit disparaître. Sans nouvelle annonce, deux contacts ne doivent pas le replacer. Après une nouvelle annonce, essayer ailleurs ou dans le dépôt neutre. Les deux voitures doivent subir le même mur.
4. Poser un pilier : vérifier le champ au sol et le ralentissement des deux voitures. Poser le second à portée : vérifier l’arc. Désactiver un pilier ou le remettre en station : le champ et l’arc disparaissent.
5. Décaler volontairement le LEGO de 5 à 10 mm et observer depuis les deux côtés. Au-delà de cette marge, corriger Oz ou refaire la pose après une nouvelle sélection. L’alignement et le confort restent à valider avec les objets sur la dalle réelle.

## Intégration des branches fonctionnelles

Les travaux #41 (postes et conduite par équipe), #30 (corridor de boost), #31 (retours des tangibles), #32 (tutoriel) et #34 (console Oz) sont réunis avec leur historique. L’inversion des copilotes n’est appliquée qu’une fois. Les cinq thèmes, les animations, les commandes sémantiques et les bonus autonomes sont conservés. Le tutoriel utilise les commandes de conduite par équipe et les piliers neutres ; ses étapes tangibles nécessitent les manipulations réelles, avec une commande pour passer une étape bloquée si nécessaire.

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

Les tests couvrent génération, conduite, collisions neutres, réparation, armement, vol, pause, présence des trois tangibles fixes, pose atomique, rotation autour du centre et à pivot fixe, raccourcis AZERTY, annulation groupée, transformations dans les quatre vues, commandes rapides avec anciens états réseau, déconnexion, journal serveur rejoué et séparation des rôles réseau. La validation matérielle des contacts simultanés et de la latence sur la table réelle reste à réaliser ; voir `measures.md`. Uniquement avec `CRASHOUT_DEV_TOOLS=1` côté serveur, l’affichage de diagnostic s’active avec `?debug=1` ou F3 ; il liste aussi les dernières décisions du recognizer tactile (F4 télécharge le journal), et les seuils des gestes se règlent par l’URL (`?cluster=`, `?palm=`...) : voir le [protocole d’essai des seuils tactiles](docs/seuils-tactiles.md). La préparation, le lancement et l’observation des essais avec des personnes extérieures sont décrits dans [docs/sessions-de-test.md](docs/sessions-de-test.md). Le journal des événements tangibles du serveur se télécharge depuis la console, ou directement via `/api/oz-log`.

## Structure

L’audit graphique, les trois directions proposées et la liste de sons à chercher sont dans [docs/direction-artistique.md](docs/direction-artistique.md). En préparation, avec `CRASHOUT_DEV_TOOLS=1`, cinq thèmes sont disponibles dans **Paramètres → Ambiance** : **Néon**, **Ferraille**, **Circuit miniature**, **Grand Prix** et **Castagne**. Chaque ambiance possède son décor animé, sa piste, sa voiture et ses commandes ; le cyan et le rose identifient toujours les équipes. **La version de séance affiche Ferraille et cache le choix de thème.** En préparation, le choix est mémorisé localement et peut changer pendant la partie. Voir [les thèmes et leur parcours de vérification](docs/themes.md) et [les détails du rendu néon](docs/rendu-neon.md). L’[audit des textes et de l’orientation](docs/lisibilite.md) documente les choix de lisibilité des issues #26 et #35.

```text
server/          état autoritaire, règles, physique, génération, tutoriel, WebSocket
client-table/    rendu Canvas, HUD, adaptateur tactile et clavier
client-oz/       console du magicien et simulation des tangibles
client-shared/   interface d’actions, connexion et synchronisation
scripts/         tests des règles et du protocole réseau
prototypes/      laboratoire historique, conservé sans modification
```

Les anciennes règles expérimentales fantôme / destruction restent dans le moteur pour référence, mais ne sont plus exposées comme boutons ou commandes de la table. Les spécifications historiques de `.kiro/` et le laboratoire ne décrivent donc pas toujours les commandes actuelles ; ce README décrit le prototype fonctionnel.

### Audio

**Paramètres → Audio** permet de couper le son et de régler effets, ambiance et musique séparément. Les sons physiques utilisent des extraits CC0 téléchargés ; les clics, alertes et confirmations utilisent des signaux simples. Ferraille possède une ambiance industrielle et une proposition de musique. Voir [l’inventaire complet, les sons à rechercher et le parcours d’essai](docs/audio.md), ainsi que [les crédits et licences](client-table/audio/CREDITS.md). `npm run test:audio` fait partie de `check` et `verify`.

## Audit avant les essais du 2 novembre

L’[audit des branches et des issues du 1er novembre 2026](docs/audit-pretests-2026-11-01.md) couvre toutes les branches locales et distantes, les issues et les critères qui nécessitent encore la vraie table. Les ramassables sont répartis aléatoirement à chaque création humaine de circuit, espacés entre eux et de la ligne de départ ; leur réapparition conserve leur position pendant la course. Le tutoriel garde ses positions prévisibles.

Le menu de séance conserve Plein écran, les réglages de course, le son et Accueil. Les volumes détaillés se déplient à la demande ; la durée du chronomètre apparaît seulement s’il est activé. Pendant le tutoriel, les réglages de course sont masqués. Les repères des quatre postes apparaissent pendant la création, pas sur l’accueil.

## Repères des fichiers de configuration

Les en-têtes des sources indiquent leur responsabilité et leurs liens avec les autres fichiers. Les fonctions, les callbacks et les principaux blocs de données possèdent un résumé en français. Dans l’IDE, rechercher le nom de la fonctionnalité ou afficher les symboles du fichier pour rejoindre son point d’entrée.

Les fichiers JSON stricts restent sans commentaires pour être lisibles par Node, npm et les tests. Leurs responsabilités sont les suivantes :

| Fichier | Rôle et liens utiles |
|---|---|
| `package.json` | Commandes de lancement, de compilation et de test ; référence les fichiers de `scripts/`, Vite et les deux configurations TypeScript. |
| `package-lock.json` | Versions exactes des dépendances de `package.json`, utilisées par `npm ci` et la CI. |
| `config.json` | Valeurs de la course et de la table, chargées par `server/config.ts` puis utilisées par `GameRules.ts` et `PhysicsLoop.ts`. |
| `client-table/audio/sources.json` | Provenance et licence des extraits audio référencés dans `AudioAssets.ts` et contrôlés par `scripts/audio.ts`. |

`tsconfig.json` et `tsconfig.server.json` acceptent les commentaires JSONC ; leur en-tête précise leur partage entre clients, tests et serveur. Les dossiers `dist/` et `node_modules/` sont produits par les outils, et `prototypes/` reste la référence historique.
