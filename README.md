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
5. Le copilote utilise **POWER** pour son objet ramassé, réalise les gestes et répare avec le pilote. Oz gère seul l’activation des tangibles.
6. Une sortie de piste immobilise la voiture. Maintenir les deux pads de réparation pour la remettre en jeu. La pause fige la course et les durées des effets.

## POWER et objets ramassés

Les boutons nommés **FANTÔME** et **DÉTRUIRE** ont été retirés de la zone copilote. Le copilote possède un seul bouton d’action, **POWER**, plus la zone tangible et le pad de réparation.

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

## Console Oz : uniquement les tangibles

La console montre le circuit, les zones copilote et un seul panneau de gestion. Les points verts de la liste indiquent les tangibles activés. Oz ne dispose d’aucune commande de partie ou de bonus ; cette séparation est également appliquée au serveur, y compris pour les anciennes commandes.

1. Choisir un des **quatre identifiants**, son **type** (mur ou pilier électrique) et son **équipe**.
2. Cliquer sur la carte pour le placer. Il peut être placé et déplacé **désactivé**, ce qui permet de préparer sa position sans produire d’effet.
3. Cliquer sur **Activer / Désactiver** pour changer son état. Seul Oz peut le faire. Désactiver conserve sa position, son orientation et son équipe ; réactiver restaure son effet au même endroit. Les murs désactivés apparaissent en pointillés uniquement dans la console.
4. Glisser le corps du mur ou sa poignée **1** pour le déplacer. Glisser la poignée **2** pour le tourner autour de **1**, qui reste fixe. La longueur du mur ne change pas ; l’aperçu est immédiat, même entre deux mises à jour réseau. Un clic de sélection ne déplace plus le mur.
5. **Zone copilote** simule son dépôt dans la zone de son équipe ; on peut aussi le déplacer directement sur cette zone. Le dépôt coupe son effet. Oz peut alors marquer le tangible comme activé et le replacer sur le circuit. **POWER n’a aucun effet sur lui.**
6. **Retirer** simule le retrait physique et efface le tangible. Modifier son type ou son équipe le désactive ; modifier un tangible placé conserve sa position.

Deux piliers **activés**, placés sur le circuit par la même équipe à moins de **500 px logiques**, forment un arc électrique. Désactiver un pilier coupe l’arc ; le réactiver le restaure si la paire est toujours à portée. Chaque pilier participe à une seule paire. Un mur reste un mur.

Les joueurs lancent et contrôlent la partie depuis la table. Les bonus fonctionnent sans magicien connecté. La nouvelle partie efface tous les tangibles. La console reste disponible avant le départ, pendant la course et en pause ; elle attend qu’un circuit existe pour autoriser les modifications.

## Commandes et extensions futures

Le jeu reçoit des **actions de jeu**, indépendantes des périphériques. `client-shared/controls.ts` est l’interface commune aux adaptateurs clavier et tactile : direction, POWER et gestes. Les types de messages sont dans `server/types.ts` ; les règles et la consommation des stocks restent validées dans `server/GameRules.ts`.

Un futur adaptateur mobile pourra convertir un gyroscope en direction normalisée `[-1, 1]` et utiliser la même interface, sans modifier la physique. Aucun contrôle mobile, appairage ni accès aux capteurs n’est implémenté à ce stade. Un futur lecteur de tangibles pourra envoyer les mêmes actions de configuration, dépôt, activation, déplacement et retrait qu’Oz, après ajout de son rôle de connexion.

| Équipe | Direction clavier | Accélération en mode pédale | POWER du copilote | Réparation des deux postes |
|---|---|---|---|---|
| Cyan | `Q` / `D` | maintenir `Z` | `A` | maintenir `A` + `P` |
| Rose | `←` / `→` | maintenir `↑` | `M` | maintenir `M` + `C` |

Deux doigts proches saisissant le même bord de piste et glissant vers l’extérieur créent toujours une déformation locale temporaire. Les paramètres sont dans `config.json` ; relancer le serveur après modification.

## Vérification

```bash
npm run typecheck
npm run test:acceptance
npm run test:gestures
npm run test:network
npm run build
```

Les tests couvrent génération, conduite, collisions, réparation, armement, vol, durée de pause, activation / placement / désactivation des tangibles, rotation à pivot fixe, interactions de déplacement, journal serveur rejoué, séparation des rôles réseau et récupération d’un état complet à la connexion. La validation matérielle des contacts simultanés et de la latence sur la table réelle reste à réaliser ; voir `measures.md`. L’affichage de diagnostic s’active avec `?debug=1` ou F3. Le journal des événements tangibles du serveur est disponible sur `/api/oz-log`.

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
