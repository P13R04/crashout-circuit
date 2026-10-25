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
- **Magicien d’Oz** : `http://<ip-de-la-table>:3000/oz` sur un autre ordinateur du même Wi-Fi. L’adresse exacte est affichée au démarrage et dans la console Oz. `localhost` désigne toujours l’ordinateur sur lequel le navigateur est ouvert.
- Pour changer le port : `PORT=3100 npm start`.

Le serveur doit rester ouvert pendant la séance. Les deux appareils doivent pouvoir communiquer sur le réseau local (un Wi-Fi invité qui isole les appareils ne convient pas). Ce prototype est prévu pour le réseau local de la séance ; il n’implémente pas de compte utilisateur.

### Développement

```bash
npm run build:server
npm run dev
```

Ouvrir `http://localhost:5173/client-table/` et `http://localhost:5173/client-oz/`. Vite relaie les échanges et les API vers le serveur du port 3000. Après une modification du serveur, relancer `npm run build:server`.

## Déroulement

1. Choisir **Jouer sur table** ou **Mode PC · séquentiel**.
2. Cyan place P1, Rose place P2 ; Cyan dessine P1 → P2, puis Rose dessine P2 → P1. Les deux modes utilisent cette création guidée et séquentielle. Le circuit suit les tracés, y compris les boucles et croisements ; les refus sont expliqués à l’écran.
3. Toucher **GÉNÉRER LE CIRCUIT**, puis **LANCER LA COURSE** sur la table. Le lancement, la pause et la remise à zéro appartiennent aux joueurs.
4. Le pilote conduit avec la bande gauche / droite. Le bouton central **PÉDALE** bascule entre l’avance automatique et une pédale maintenue pour accélérer, à vitesse maximale réduite. Le pilote n’a plus de bouton pour utiliser les objets.
5. Le copilote utilise **POWER** pour son objet ramassé, réalise les gestes et répare avec le pilote. Oz reproduit la présence des tangibles neutres.
6. Une sortie de piste immobilise la voiture. Maintenir les deux pads de réparation pour la remettre en jeu. La pause fige la course et les durées des effets.

## POWER et objets ramassés

Les boutons nommés **FANTÔME** et **DÉTRUIRE** ont été retirés de la zone copilote. Le copilote possède un seul bouton d’action, **POWER**, et le pad de réparation.

1. La voiture ramasse un objet lorsque son stock est vide. Son icône apparaît comme information dans le poste copilote.
2. **Seul POWER du copilote de l’équipe propriétaire peut armer ce stock.** POWER adverse ne l’arme pas. Appuyer plusieurs fois ne prolonge pas la fenêtre.
3. Pendant les **5 secondes** configurées, le geste correspondant est disponible sur la surface partagée : **3 doigts rapprochés, tirer l’un d’eux puis relâcher** pour le lance-pierre à élastique, **2 doigts espacés de 100 à 400 px** pour le portail de boost.
4. L’armement est **neutre et volable** : le premier geste valide consomme l’objet armé du propriétaire, et l’effet appartient à l’équipe qui a exécuté le geste. Un lance-pierre volé peut donc toucher son ancien propriétaire ; un portail volé aide l’équipe qui l’a créé.
5. Sans geste dans la fenêtre, l’objet est perdu, comme dans la règle précédente du prototype. Si deux stocks du même type sont armés, celui du poste le plus proche du geste est consommé. Un stock ne peut être consommé qu’une fois.

La table tactile ne reconnaît pas l’identité d’une personne : l’équipe qui fait le geste est celle du poste copilote le plus proche. Les gestes et le vol fonctionnent sans connexion Oz. Le magicien n’attribue plus les gestes et ne peut pas donner, armer ou déclencher de bonus.

### Tester les gestes à la souris

La barre de simulation apparaît avec une souris, ou avec `?sim=1`. Ramasser d’abord un objet avec la voiture, puis toucher **POWER** au poste copilote :

- **Simuler lance-pierre** : maintenir le clic pour poser la fourche, tirer en arrière, puis relâcher. La trajectoire est prévisualisée et la pierre vole depuis la poche. En mode PC, ce geste est disponible directement dès qu’un lance-pierre est armé.
- **Simuler 2 doigts** puis deux clics définissent le portail.

Les simulations passent par les mêmes règles d’armement, de vol et de consommation que les gestes tactiles. Le lance-pierre conserve les paramètres de `main` : traction minimale de 40 px, portée croissante et dégâts de 100 HP.

En course **PC uniquement**, la barre de test de la table conserve **Véhicules invincibles** et **Tous les objets utilisables**. Ces outils de développement restent ignorés en mode table et ne sont pas accessibles à Oz.

## Console Oz : rapide au pavé tactile

La console `/oz` présente une grande carte et trois objets fixes : **Mur** (id 1), **Pylône 1** (id 2), **Pylône 2** (id 3). Ils sont **neutres** : le mur et l’arc affectent les deux véhicules. Aucun choix de type, d’équipe ou de zone de dépôt n’est nécessaire. Oz ne dispose d’aucune commande de partie ou de bonus ; le serveur maintient cette séparation.

1. Presser **M**, **1** ou **2**, ou cliquer sur le bouton de l’objet, pour préparer sa pose. L’aperçu suit le pointeur uniquement dans la console ; la table ne change pas.
2. **Cliquer sur la carte** pour placer ou repositionner l’objet et l’activer en une seule action. Après la pose, l’objet reste sélectionné ; son raccourci prépare le prochain déplacement. Un clic dans le vide sans préparation ne déplace rien.
3. Après la toute première pose du Pylône 1, le Pylône 2 est automatiquement préparé s’il est absent. Les déplacements suivants ne changent pas automatiquement la sélection.
4. Pour le mur, **← / →** tournent de 5°, **Maj + ← / →** de 15°. Avant la pose, seule l’orientation de l’aperçu change ; après la pose, la rotation garde le centre du mur fixe. Les pylônes ne tournent pas au clavier.
5. **Espace** ou le bouton **Retirer / Réafficher** reproduit le soulèvement ou la repose au même endroit. **Suppr** retire seulement. La position, l’orientation et le type sont conservés. Un objet jamais placé ne peut pas être réaffiché.
6. **Ctrl + Z** ou **Annuler l’action** restaure l’état précédent du tangible : pose, déplacement, rotation ou présence. Un glissement ou une rotation maintenue compte comme une manipulation. Les dégâts déjà infligés ne sont pas annulés. **Échap** ou **Annuler la pose** abandonne seulement l’aperçu préparé.
7. Le glissement direct reste disponible : corps ou poignée **1** pour déplacer le mur, poignée **2** pour le tourner autour de **1** à longueur constante. Un simple clic sélectionne sans déplacement.
8. **R** ou **Vue** tourne la carte de 90° pour correspondre au point de vue de l’opérateur. Ce réglage est mémorisé dans le navigateur ; il ne déplace pas les objets sur la table.

L’aide-mémoire reste affiché sous la carte et les boutons rappellent leurs raccourcis :

| Commande | Action |
|---|---|
| `M` | Préparer le mur |
| `1` / touche `&` sur AZERTY | Préparer le Pylône 1 |
| `2` / touche `é` sur AZERTY | Préparer le Pylône 2 |
| Clic | Placer l’objet préparé |
| `←` / `→` | Tourner le mur de 5° |
| `Maj` + `←` / `→` | Tourner le mur de 15° |
| `Espace` | Retirer / réafficher |
| `Suppr` | Retirer |
| `Échap` | Annuler la pose préparée |
| `Ctrl` + `Z` | Annuler la dernière manipulation |
| `R` | Tourner la vue de 90° |

Les touches physiques **1/&** et **2/é** fonctionnent sans Maj, ainsi que les chiffres du pavé numérique. Les raccourcis ne s’appliquent pas dans un champ de saisie. Les postes joueurs ombrés restent interdits aux objets ; un aperçu rouge et un message expliquent les placements refusés. Aucun alignement automatique ne décale la position observée.

Les deux pylônes présents à une distance d’au plus **500 px logiques** forment automatiquement un arc. Les états **Pylône manquant**, **Hors portée** et **Arc établi** sont affichés dans la console. Retirer un pylône coupe l’arc ; le réafficher le restaure si la paire est à portée. Le jeu applique automatiquement les collisions, dégâts et ralentissements.

Les joueurs contrôlent la partie depuis la table. La console fonctionne avant le départ, en course et en pause, après création du circuit. Une nouvelle partie retire tous les objets et vide l’historique. En cas de déconnexion, la préparation est annulée et les commandes sont bloquées ; la reconnexion récupère l’état serveur sans rejouer de commandes. L’historique local est alors vidé. La pose et l’arc sont prévisualisés immédiatement ; les états réseau anciens ne font pas sauter un objet pendant une manipulation.

## Commandes et extensions futures

Le jeu reçoit des **actions de jeu**, indépendantes des périphériques. `client-shared/controls.ts` est l’interface commune aux adaptateurs clavier et tactile : direction, POWER et gestes. Les types de messages sont dans `server/types.ts` ; les objets fixes et la validation partagée sont dans `server/tangibles.ts` ; les règles et la consommation des stocks restent validées dans `server/GameRules.ts`.

Un futur adaptateur mobile pourra convertir un gyroscope en direction normalisée `[-1, 1]` et utiliser la même interface, sans modifier la physique. Aucun contrôle mobile, appairage ni accès aux capteurs n’est implémenté à ce stade. Un futur lecteur de tangibles pourra envoyer les mêmes actions de présence, déplacement et retrait qu’Oz, après ajout de son rôle de connexion.

| Équipe | Direction clavier | Accélération en mode pédale | POWER du copilote | Réparation des deux postes |
|---|---|---|---|---|
| Cyan | `Q` / `D` | maintenir `Z` | `A` | maintenir `A` + `P` |
| Rose | `←` / `→` | maintenir `↑` | `M` | maintenir `M` + `C` |

Deux doigts proches saisissant le même bord de piste et glissant vers l’extérieur créent toujours une déformation locale temporaire. Les paramètres sont dans `config.json` ; relancer le serveur après modification.

### Messages tangibles

`TangibleMoved` reçoit `{ id, x, y, angle, active? }` : coordonnées normalisées, angle en degrés et présence facultative. Le champ `active` permet une pose et une activation atomiques ; son omission conserve la présence précédente (inactive pour un objet neuf). Le serveur impose le type selon l’identifiant et `team: null`. `TangibleControl` conserve `activate` / `deactivate` pour les objets déjà placés ; les anciennes actions `configure` / `dock` sont ignorées. `TangibleRemoved` efface l’état, notamment pour annuler une première pose. Le quatrième identifiant est refusé. Le journal `/api/oz-log` conserve la présence effective pour pouvoir rejouer les événements.

## Vérification

```bash
npm run typecheck
npm run test:acceptance
npm run test:gestures
npm run test:network
npm run build
```

Les tests couvrent génération, conduite, collisions neutres, réparation, armement, vol, pause, présence des trois tangibles fixes, pose atomique, rotation autour du centre et à pivot fixe, raccourcis AZERTY, annulation groupée, transformations dans les quatre vues, commandes rapides avec anciens états réseau, déconnexion, journal serveur rejoué et séparation des rôles réseau. La validation matérielle des contacts simultanés et de la latence sur la table réelle reste à réaliser ; voir `measures.md`. L’affichage de diagnostic s’active avec `?debug=1` ou F3. Le journal des événements tangibles du serveur est disponible sur `/api/oz-log`.

## Structure

```text
server/          état autoritaire, règles, physique, génération, WebSocket
client-table/    rendu Canvas, HUD, adaptateur tactile et clavier
client-oz/       console du magicien et simulation des tangibles
client-shared/   interface d’actions, connexion et synchronisation
scripts/         tests des règles et du protocole réseau
prototypes/      laboratoire historique, conservé sans modification
```

Les anciennes règles expérimentales fantôme / destruction restent dans le moteur pour référence, mais ne sont plus exposées comme boutons ou commandes de la table. Les spécifications historiques de `.kiro/` et le laboratoire ne décrivent donc pas toujours les commandes actuelles ; ce README décrit le prototype fonctionnel.
