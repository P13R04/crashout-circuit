# Crashout Circuit — Nouveaux requis « IHM réparties »

> Complète `context.md` et `.kiro/specs/crashout-circuit/requirements.md`. Écrit le 16 novembre 2026, d'après le cours *IHM réparties sur plusieurs dispositifs* (`IHMRéparties2627_VChristian.pdf`) et la décision d'équipe : **la table n'a plus de joueurs, tous les joueurs jouent sur leur téléphone, et le Magicien d'Oz disparaît**.
> Des précisions doivent encore être apportées par l'équipe : les points non tranchés sont marqués **[À VALIDER]** et listés en §9. Rien ici n'est implémenté.

Identifiants : `RD-<chapitre>-<nn>` (RD = requis distribué). Statuts : **NOUVEAU**, **MODIFIÉ** (remplace un requis existant), **RETIRÉ**.
Lien avec le cours : R1 à R6 sont les règles de la démarche d'identification et de répartition (diapos 32 à 36).

---

## 1. Rappel du système et du changement

| | Avant (état au 2 novembre) | Après (cible IHM réparties) |
|---|---|---|
| Joueurs | 4 joueurs **autour** de la table, aux 4 coins | 4 joueurs, **chacun sur son téléphone** |
| Table | Surface de jeu **et** de saisie (gestes, pads, postes) | **Espace partagé** : course, circuit, état des équipes, résultats |
| Tangibles | Mur et 2 piliers LEGO, posés par les doigts, annoncés par Oz | Objets neutres posés **depuis le téléphone du copilote** [À VALIDER] |
| Opérateur | Magicien d'Oz sur un 2e ordinateur (`/oz`) | **Supprimé** ; l'animateur s'appuie sur la table |
| Réseau | WebSocket : rôles `table` et `oz` | WebSocket : rôles `table`, `pilot`, `copilot` (par équipe) |

Ce qui ne change pas : serveur Node **autoritaire**, règles de jeu, physique, génération du circuit, thèmes, audio, repère logique 1920×1080 de la table.

---

## 2. Dispositifs et territoires (cours R4)

| Dispositif | Territoire privilégié | Autres territoires possibles | Rôle cognitif |
|---|---|---|---|
| **Table / grand écran** | **Groupe** | Stockage (réserve des objets, circuit) | Vue macroscopique partagée : voir la course, les équipes, les résultats |
| **Téléphone pilote** (×2) | **Personnel** | Privé (identification) | Contrôle continu : direction, conduite, état de sa voiture, réparation |
| **Téléphone copilote** (×2) | **Personnel** | Privé (stock, aperçus), groupe (dessin du circuit) | Action ciblée : bonus, gestes, objets posés, réparation |

- **RD-A-01** (NOUVEAU) Le système doit être un **système interactif distribué** de 5 dispositifs au minimum en partie complète : une table (ou un grand écran) et quatre téléphones.
- **RD-A-02** (NOUVEAU) Chaque tâche doit être attribuée à un dispositif et à un type de territoire (groupe, stockage, personnel, privé), et cette attribution doit être **justifiée** dans le document de conception (cours R5 et attentes du module).
- **RD-A-03** (NOUVEAU) La table ne doit afficher **aucune** information privée d'un joueur (stock non armé, aperçu de geste ou de pose en cours, identité du téléphone).
- **RD-A-04** (NOUVEAU) Chaque téléphone ne doit recevoir que les données nécessaires à son rôle (principe de pertinence contextuelle, diapo 52).
- **RD-A-05** (NOUVEAU) La table ne doit plus être un dispositif de saisie obligatoire : aucune tâche de jeu ne doit exiger de toucher la table. Un usage tactile facultatif pour l'animateur est possible [À VALIDER].

### Informations manipulées : publiques ou privées (5W1H, cours « Concevoir »)

| Information | Qui la manipule | Quand | Où | Visibilité |
|---|---|---|---|---|
| Position et vitesse des voitures, circuit, tours, chrono | Tous | Course | Table ; copie réduite sur téléphone | **Publique** |
| Vie (HP) de chaque voiture | Pilote, copilote de l'équipe | Course | Table (jauge) et téléphone pilote | Publique (jauge), détail personnel |
| Direction, mode de conduite AUTO/PÉDALE | Pilote | Course | Téléphone pilote | Personnelle ; effet public |
| Stock de bonus ramassé | Copilote propriétaire | Après ramassage | Téléphone copilote | **Privée** [À VALIDER] |
| Bonus **armé** (en attente de geste) | Tous (volable) | Après POWER | Table (pictogramme) et téléphones | **Publique** : il peut être volé |
| Geste en cours (fourche, portail) et visée | Copilote | Armement → geste | Téléphone copilote | **Privée** jusqu'à l'effet |
| Objets posés (mur, piliers, arc) | Copilotes | Course | Table | Publique ; aperçu de pose privé |
| Ancres et tracés du circuit | Équipes cyan puis rose | Création | Téléphones ; aperçu sur la table | Publique au fur et à mesure de la validation |
| Panne et progression de réparation | Pilote et copilote de l'équipe | Panne | Téléphones de l'équipe ; icône sur la table | Publique (panne), personnelle (maintien) |
| Équipe, rôle, pseudo | Chaque joueur | Connexion | Téléphone | Publique après validation |
| État de connexion des 4 téléphones | Système | Toujours | Table ; message sur le téléphone concerné | Publique |

---

## 3. Connexion et association des dispositifs (pattern de connexion, diapo 33)

- **RD-B-01** (NOUVEAU) La table doit afficher en permanence, tant que la partie n'a pas commencé, un **QR code** (et l'URL en clair) qui mène à l'application téléphone. Le territoire de groupe porte l'affichage ; la lecture est une tâche critique placée sur le téléphone.
- **RD-B-02** (NOUVEAU) Le joueur doit pouvoir rejoindre **sans installation, sans compte et sans clavier obligatoire** depuis un navigateur mobile, puis choisir **équipe (cyan ou rose) et rôle (pilote ou copilote)**. Un pseudo est facultatif.
- **RD-B-03** (NOUVEAU) Le serveur doit refuser une place déjà occupée et le dire clairement sur le téléphone ; la table doit montrer en direct les quatre places (libre / occupée / déconnectée).
- **RD-B-04** (NOUVEAU) Le serveur doit détecter l'**arrivée et le départ** d'un téléphone à tout moment et en informer la table (cours : association dynamique des dispositifs).
- **RD-B-05** (NOUVEAU) Un téléphone qui se reconnecte doit **reprendre sa place** (jeton de session conservé côté navigateur) avec l'état courant, sans refaire le tirage du circuit ni relancer le départ.
- **RD-B-06** (MODIFIÉ) La phase `LOBBY` ne doit plus attendre que les quatre joueurs touchent leur clé sur la table (étape `identify` du tutoriel actuel) : elle attend les **quatre téléphones associés**.
- **RD-B-07** (NOUVEAU) Un joueur doit pouvoir **changer de place** avant le départ, et un animateur doit pouvoir libérer une place bloquée [À VALIDER : depuis la table].
- **RD-B-08** (NOUVEAU) Si la partie démarre avec moins de quatre téléphones, le système doit soit refuser le départ, soit proposer un **pilote automatique** (`AutomaticPilot`) pour la place vide [À VALIDER].

---

## 4. Téléphone du pilote

- **RD-C-01** (MODIFIÉ, remplace REQ-3.1.x et la bande tactile de la table) L'application pilote doit fournir la **direction gauche/droite** continue sur écran tactile. L'usage du gyroscope est une variante possible [À VALIDER] ; en cas d'usage, l'autorisation des capteurs doit être demandée sur geste de l'utilisateur (contrainte des navigateurs mobiles).
- **RD-C-02** (MODIFIÉ) Le mode **AUTO** (avance automatique) reste le défaut ; le mode **PÉDALE** ajoute une pédale tenue sur le téléphone. Le choix est **par équipe**, réglé depuis le téléphone pilote ou les paramètres de la table.
- **RD-C-03** (NOUVEAU) Le téléphone pilote doit afficher en continu, de façon lisible d'un coup d'œil : la **vie**, le **tour en cours**, et une **alerte de panne** plus saillante que tout le reste.
- **RD-C-04** (NOUVEAU) Le téléphone pilote ne doit **pas** dupliquer la course entière : la vue de la course reste sur la table (complémentarité). Une mini-vue du circuit est facultative [À VALIDER].
- **RD-C-05** (MODIFIÉ) La latence entre l'entrée sur le téléphone et la réaction de la voiture sur la table doit être **inférieure à 80 ms** (REQ-3.1.3 conservé) ; l'entrée expirée après **250 ms** sans message (`pilotInputTimeoutMs`).
- **RD-C-06** (NOUVEAU) Le téléphone pilote doit donner un retour de ses actions importantes : vibration lorsque le navigateur le permet, sinon retour visuel (impact, panne, voiture remise en piste).
- **RD-C-07** (NOUVEAU) L'écran du téléphone ne doit pas se mettre en veille pendant une partie (`Wake Lock` quand disponible) et doit rester utilisable en portrait ou paysage [À VALIDER].

---

## 5. Téléphone du copilote

- **RD-D-01** (MODIFIÉ) Le bouton **POWER** doit être sur le téléphone du copilote. Il arme le **stock unique** de l'équipe propriétaire ; l'armement reste **neutre et volable** : le premier geste valide, de n'importe quelle équipe, consomme le bonus armé.
- **RD-D-02** (MODIFIÉ) Le **lance-pierre** (fourche + poche tirée puis relâchée, traction 40–260 px, portée 220–900 px, tir au relâchement) et le **boost** (deux contacts de 0 à 400 px) doivent être réalisés **sur le téléphone** par une surface de visée : le copilote voit une **vue du circuit à l'échelle du téléphone** et agit dessus. Les valeurs de portée sont conservées dans le repère logique de la table.
- **RD-D-03** (NOUVEAU) Le geste sur téléphone doit disposer de **seuils adaptés à la taille d'écran** (largeur en mm, pas en pixels logiques de la table). Un aperçu **privé** (trajectoire, portail, puissance) doit être affiché avant l'effet.
- **RD-D-04** (MODIFIÉ) La **déformation locale de piste** (traction d'un bord à deux doigts, jusqu'à 220 px logiques) doit être possible sur la vue du circuit du téléphone copilote.
- **RD-D-05** (NOUVEAU) La vue du circuit du téléphone doit pouvoir être **zoomée et déplacée** sans déclencher de geste de jeu ; le jeu de gestes de jeu et de navigation doit être séparé sans ambiguïté (mode ou zone dédiée).
- **RD-D-06** (NOUVEAU) Le téléphone copilote doit afficher le **stock** (pictogramme du bonus), l'**état armé** (anneau doré, comme sur la table) et l'état « bonus volé par l'autre équipe ».
- **RD-D-07** (NOUVEAU) La table doit montrer le résultat d'un geste (tir, portail, déformation) **dès l'effet**, sans montrer la visée avant.

---

## 6. Table : écran partagé

- **RD-E-01** (MODIFIÉ) La table doit afficher : le circuit, les deux voitures, les bonus ramassables, les objets posés, les pierres en vol, les effets, la vie, les tours, le chrono (si activé), l'état des quatre places et les résultats.
- **RD-E-02** (RETIRÉ) Les **quatre panneaux d'angle orientés** (`layout.ts`, `HUD.ts`), les **pads de réparation de la table**, la bande de direction et les postes en diagonale. La notion de « poste copilote le plus proche » pour attribuer un geste disparaît : l'équipe vient du **téléphone émetteur**.
- **RD-E-03** (MODIFIÉ) Les textes partagés ne dépendent plus d'un bord de table : l'orientation est unique (vue d'ensemble), sauf si l'équipe décide que des joueurs se tiennent autour d'une table posée à plat [À VALIDER].
- **RD-E-04** (NOUVEAU) La table doit rester lisible à distance (≥ 3 m) : pictogrammes, halos, animations ; les consignes détaillées vont sur les téléphones.
- **RD-E-05** (NOUVEAU) La table doit afficher, pour chaque équipe, un **indicateur de présence** des deux téléphones et l'indiquer en cas de coupure.
- **RD-E-06** (MODIFIÉ) Les paramètres de séance (plein écran, difficulté, tours, chrono, audio, accueil) doivent rester accessibles à un **animateur** depuis la table ou un lien dédié, et non depuis un poste de joueur [À VALIDER].
- **RD-E-07** (CONSERVÉ) Les thèmes visuels, l'audio, la révélation animée du circuit et la ligne de départ tirée au sort restent inchangés ; la séance utilisateur conserve le thème Ferraille.

---

## 7. Interactions entre dispositifs et continuité (raffinement)

- **RD-F-01** (NOUVEAU) La **réparation synchrone** doit reposer sur **deux téléphones** : le pilote et le copilote de l'équipe maintiennent chacun leur contrôle pendant **2 s**, simultanément ; relâcher l'un remet la jauge à zéro. Les trois feux de reprise (3 s) restent affichés sur la table.
- **RD-F-02** (NOUVEAU) L'**armement** est une **transition de territoire** : un bonus passe de **privé** (stock sur le téléphone) à **public** (armé, visible sur la table) puis revient au privé lors de la consommation. Cette transition doit être animée de manière cohérente sur le téléphone (départ) et sur la table (arrivée).
- **RD-F-03** (NOUVEAU) **Continuité d'état** : aucun progrès ne doit être perdu lors d'une coupure ou d'un changement de téléphone (stock, objet armé, place, réglages de conduite).
- **RD-F-04** (NOUVEAU) **Continuité temporelle** : un retour visuel local immédiat (< 50 ms) doit précéder la confirmation du serveur pour tout geste du copilote, avec correction douce si le serveur refuse.
- **RD-F-05** (NOUVEAU) **Surcharge** : un téléphone ne doit jamais recevoir plus d'une alerte prioritaire à la fois ; les notifications du jeu ne doivent pas masquer la direction ou le contrôle en cours.
- **RD-F-06** (NOUVEAU) Un geste de **transfert** d'une information du téléphone vers la table (par exemple « lancer » un bonus vers le circuit) est une piste de conception à évaluer ; elle ne doit pas être obligatoire [À VALIDER].

---

## 8. Suppression d'Oz et objets posés

- **RD-G-01** (RETIRÉ) Le client **`/oz`**, le rôle réseau `oz`, la console, ses raccourcis et la double annonce/pose (`TangiblePrepare`, `TangibleTouchPlaced`) ne doivent plus exister. Les messages `TangibleMoved`, `TangibleRemoved` et `TangibleControl` sont remplacés par des **intentions** envoyées par le téléphone du copilote.
- **RD-G-02** (MODIFIÉ) Les trois objets **neutres** restent : **un mur et deux piliers** (un pilier seul crée un champ au sol, deux piliers actifs forment un arc jusqu'à 350 px), sans recharge. Dimensions logiques conservées (`tableDiagonalInches`) tant que l'échelle LEGO sert de référence [À VALIDER].
- **RD-G-03** (NOUVEAU) La **pose** d'un objet doit se faire par le copilote depuis la vue du circuit de son téléphone : choisir l'objet, viser (deux points ou deux contacts), **confirmer** ; le serveur recalcule la géométrie et valide.
- **RD-G-04** (NOUVEAU) Le **retrait** d'un objet doit être possible par un copilote depuis son téléphone et renvoie l'objet à la **réserve** inactive ; une pose dans la réserve le désactive.
- **RD-G-05** (NOUVEAU) Aucun objet ne doit être **tenu par deux copilotes en même temps** : le serveur doit trancher la concurrence (premier message valide) et informer l'autre.
- **RD-G-06** (NOUVEAU) La **réserve** des objets doit être visible sur la table (territoire de stockage) et sur les téléphones copilotes (état de chaque objet).
- **RD-G-07** (NOUVEAU) Le serveur doit conserver un **journal horodaté et rejouable** de tous les événements (connexions, intentions, effets) à des fins d'évaluation ; il doit être téléchargeable par l'animateur (remplace `/api/oz-log`).
- **RD-G-08** (NOUVEAU) La latence de l'opérateur Oz (R-16) n'existe plus ; elle est remplacée par la mesure de **latence téléphone → table** (R-16 caduc).
- **RD-G-09** (NOUVEAU) Une évolution vers de **vrais tangibles** (TUIO) doit rester possible : le serveur doit continuer d'accepter une source d'événements de pose indépendante du téléphone, sans toucher aux règles.

---

## 9. Protocole, synchronisation et résilience

- **RD-H-01** (MODIFIÉ) Les rôles de connexion doivent être `table`, `pilot` et `copilot`, chacun associé à une équipe. Le serveur doit **rejeter** tout message qui n'est pas autorisé pour le rôle de l'émetteur (un pilote ne peut pas poser un objet).
- **RD-H-02** (NOUVEAU) La communication temps réel doit rester en **WebSocket** ; les requêtes ponctuelles (session, journal) peuvent rester en HTTP (REST). Le choix d'un mélange est à justifier par tâche.
- **RD-H-03** (NOUVEAU) Les messages doivent rester **sémantiques** (intentions, jamais des contacts bruts) : le téléphone reconnaît ses gestes et n'envoie que le résultat.
- **RD-H-04** (NOUVEAU) Un jeton de **version d'état** doit permettre de gérer des messages rejoués, des états sautés et les micro-coupures (comme la version d'armement actuelle).
- **RD-H-05** (NOUVEAU) Des **retours d'état** doivent exister sur chaque dispositif : enregistrement, attente, erreur, déconnecté, serveur injoignable, reconnexion (diapo 65).
- **RD-H-06** (NOUVEAU) Un téléphone déconnecté ne doit pas figer la partie : la voiture du pilote déconnecté **continue en AUTO** pendant un délai configurable puis la partie se met en **pause** [À VALIDER].
- **RD-H-07** (NOUVEAU) La table doit pouvoir être rechargée sans perdre la partie ; les téléphones restent associés.
- **RD-H-08** (NOUVEAU) Les téléphones doivent fonctionner sur **iOS Safari et Android Chrome** ; la connexion exige un **réseau local commun** (pas de Wi-Fi invité qui isole les appareils) [À VALIDER : ou un tunnel public].

---

## 10. Tutoriel et évaluation

- **RD-I-01** (MODIFIÉ) Le **tutoriel** doit rester guidé à quatre, **par rôle** : chaque téléphone reçoit la consigne et la démonstration de son rôle, la table montre l'avancement commun. Chaque étape reste validée par un **événement réel du jeu**, jamais par minuterie.
- **RD-I-02** (MODIFIÉ) Les étapes `identify`, `borderPull`, `wall`, `pylon`, `arc` et `depot` doivent être **réécrites** pour le téléphone (plus de clé sur la table ni de manipulation LEGO).
- **RD-I-03** (NOUVEAU) Les documents d'évaluation (`docs/evaluation/`) et `docs/sessions-de-test.md` doivent être mis à jour : plus d'opérateur Oz, nouvelles tâches T1–T7, observation de la **coopération entre téléphones** et de la **perte d'attention** entre téléphone et table.
- **RD-I-04** (NOUVEAU) Les **tests utilisateurs** doivent mesurer, en plus de la compréhension : la fréquence des regards table ↔ téléphone, les erreurs de geste sur petit écran et le temps de reprise après coupure.

---

## 11. Impact sur l'existant (pour la planification)

| Zone du code | Impact |
|---|---|
| `server/GameServer.ts` | Nouveaux rôles `pilot` / `copilot`, droits par message, jeton de session, association des places |
| `server/GameRules.ts` | Attribution d'une action par **émetteur** et non par proximité (`layout.ts`) ; pose d'objets par intention ; réparation à deux téléphones |
| `server/layout.ts` | Postes, panneaux d'angle et dépôt neutre à revoir ou supprimer |
| `server/Tutorial.ts` | Étapes `identify`, `wall`, `pylon`, `arc`, `depot` à réécrire |
| `client-table/` | `GestureRecognizer`, `HUD` (postes), contrôles tactiles retirés ; le rendu et les thèmes sont conservés |
| `client-oz/` | **Supprimé** |
| `client-shared/controls.ts` | Devient l'interface commune des **adaptateurs téléphone** (déjà prévue pour un adaptateur mobile) |
| **Nouveau** `client-pilot/`, `client-copilot/` (ou un client unique par rôle) | Applications téléphone |
| `scripts/` | Tests réseau multi-rôles, tests de gestes à l'échelle du téléphone, suppression des tests Oz |

`prototypes/piste-vivante` reste inchangé (`AGENTS.md`).

---

## 12. Questions ouvertes (à trancher avec l'équipe)

1. **La table reste-t-elle posée à plat avec des joueurs autour**, ou devient-elle un grand écran vertical vu de loin ? (conditionne l'orientation des textes et la conscience spatiale)
2. **La table reste-t-elle tactile** pour l'animateur (paramètres, dessin) ou devient-elle un affichage pur ?
3. **Tangibles** : objets virtuels posés depuis le téléphone (hypothèse retenue ici) ou conservation de vrais objets avec lecteur ?
4. **Pilotage** : tactile seul ou gyroscope ? Pédale gardée ?
5. **Création du circuit** : dessin sur les téléphones (chaque équipe sur sa vue) ou sur la table (par un animateur) ?
6. **Qui est l'animateur** sans Oz : un cinquième appareil, la table, ou un des joueurs ?
7. **Moins de quatre joueurs** : pilotes automatiques, parties à deux ?
8. **Stock privé ou public** ? (conditionne l'intérêt du vol de bonus)
9. **Réseau** : Wi-Fi local obligatoire, ou accès public par tunnel ?
10. **Dates** du module : première démonstration (séance 3), scénario complet (séance 5), démonstration finale avec tests utilisateurs (séance 8).

---

## 13. Traçabilité avec les requis existants

| Requis existant | Sort |
|---|---|
| REQ-1.1.1 (4 clients : table, 2 pilotes, Oz) | MODIFIÉ → RD-A-01, RD-H-01 |
| REQ-1.2.2 (LOBBY : pilotes scannent un QR) | ÉTENDU à tous les joueurs → RD-B-01 à RD-B-06 |
| REQ-3.1.x (pilote smartphone) | Repris par RD-C-xx (le code actuel pilote sur la table) |
| REQ-4.x (copilote : gestes, objets) | MODIFIÉ → RD-D-xx |
| REQ-5.x (attribution, territorialité) | MODIFIÉ : attribution par émetteur, territoires explicites → RD-A-xx |
| REQ-7.x (console Magicien d'Oz) | **RETIRÉ** → RD-G-01 |
| REQ-6.x (interface table) | MODIFIÉ → RD-E-xx |
| T-10 (équivalence Oz / vraie table), T-11 (journal Oz) | Remplacés par RD-G-07, RD-G-09 |
| R-16 (latence Oz) | Caduc → RD-G-08 |
