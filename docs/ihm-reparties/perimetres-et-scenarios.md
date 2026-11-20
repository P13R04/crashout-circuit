# Crashout Circuit — Périmètres de modélisation et scénarios

> Prépare les **modèles de tâches** du module IHM réparties. Suit la démarche du cours : *identification* (R1 à R3), *répartition* (R4 à R6), puis *raffinement*. Les requis sont dans [requis-ihm-reparties.md](requis-ihm-reparties.md). Les choix **[À VALIDER]** y sont listés.

Notation des territoires (diapos 44 à 47) : **Gr** = tâche collective ou compétitive (groupe) · **Pe** = personnelle · **Pr** = critique (données privées). Opérateurs : `>>` séquence · `[]` choix · `[>` désactivation · `|>` interruption · `|||` concurrence · `|=|` ordre indifférent · `*` itération · `[T]` option.

---

## 1. Les périmètres

Un **périmètre** est un morceau du système assez petit pour un modèle de tâches lisible (une page), assez complet pour avoir un but utilisateur et des données bien identifiées. Onze périmètres sont proposés ; **M0** est le modèle racine, les autres sont des sous-routines.

| # | Périmètre (modèle) | But utilisateur | Qui | Dispositifs | Territoire dominant | Données | Dépend de |
|---|---|---|---|---|---|---|---|
| **M0** | **Faire une partie** (pattern de déroulement) | Jouer une partie de bout en bout | 4 joueurs | Table + 4 téléphones | Gr | Phase, équipes, résultats | tous |
| **M1** | **Se connecter et prendre sa place** (pattern de connexion) | Rejoindre sa place d'équipe sans installer | Chaque joueur | Table (QR) → téléphone | **Pr** (scan) puis Gr | Équipe, rôle, pseudo, jeton | — |
| **M2** | **Créer le circuit ensemble** | Dessiner un circuit à deux équipes | Cyan puis rose | Téléphones, table (aperçu) | Gr | Ancres P1/P2, tracés, circuit | M1 |
| **M3** | **Piloter** | Conduire sa voiture, rester en piste | Pilote | Téléphone pilote, table (voir) | Pe | Direction, mode, vie, tour | M1 |
| **M4** | **Utiliser un bonus** | Ramasser, armer, jouer le geste, voler | Copilote (et pilote pour le ramassage) | Téléphone copilote, table | Pe → Gr | Stock (Pr), bonus armé (Gr), geste (Pr) | M1, M3 |
| **M5** | **Poser un objet** (ex-Oz) | Gêner la piste avec le mur ou les piliers | Copilotes | Téléphone copilote, table | Gr (effet), Pr (aperçu) | Réserve, position, activation | M1 |
| **M6** | **Réparer sa voiture** | Remettre la voiture en course à deux | Pilote + copilote de la même équipe | Deux téléphones, table (feux) | Gr (coopération) | Panne, jauge de maintien | M3 |
| **M7** | **Déformer la piste** | Modifier un bord pour aider ou perturber | Copilote | Téléphone copilote, table | Gr | Bord choisi, amplitude | M1 |
| **M8** | **Suivre la course** | Savoir où l'on en est, vérifier ses adversaires | Tous | Table (principal), téléphones (alertes) | Gr | État public, alertes | M3 |
| **M9** | **Découvrir le jeu** (tutoriel) | Apprendre les gestes sans aide | 4 joueurs | Téléphones (consignes), table (avancement) | Pe + Gr | Étape courante par équipe | M1, M3 à M7 |
| **M10** | **Régler et animer la séance** | Lancer, mettre en pause, régler, rejouer, exporter le journal | Animateur | Table [À VALIDER] | Gr | Paramètres, journal | M1 |
| **M11** | **Se reconnecter après une coupure** | Reprendre sans rien perdre | Un joueur | Téléphone, table | Pe | Jeton de session, état | M1 |

### Découpage conseillé des modèles

- **M0** décrit uniquement l'enchaînement : *Se signaler* (M1) `>>` *Attendre le démarrage* `>>` *Démarrer la partie* `>>` *Participer* `>>` *Voir les résultats*. C'est le **pattern de déroulement** de la diapo 40, comme dans Kayak Racer.
- **M3, M4, M5, M6, M7** sont appelés en **concurrence** (`|||`) dans *Participer à la partie*, avec une itération : chaque joueur peut enchaîner ces tâches. Utiliser des **sous-routines** (`⤷`) pour les garder lisibles.
- **M2** ne se joue qu'avant la course : il se place avant *Démarrer*.
- **M6** est le meilleur exemple de **tâche collaborative inter-appareils** : deux utilisateurs, deux appareils, une action synchrone. Il mérite un modèle collaboratif (rôles pilote et copilote côte à côte).
- **M4** montre la **transition de territoire** privé → public (R6) : le stock est privé, le bonus armé devient public.
- **M10** peut être regroupé avec M0 si l'équipe décide que l'animateur est un joueur.

### Pourquoi ces périmètres (arguments pour le rapport)

1. Chaque périmètre a **un but utilisateur** et **un dispositif principal** (cours R5).
2. Les trois **patterns** du cours sont présents : déroulement (M0), connexion (M1), saisie (aucune saisie clavier sur la table, pseudo éventuel sur le téléphone).
3. Les **trois types de tâches** du cours apparaissent : collectives (M0, M2, M6, M8), personnelles (M3, M9), critiques (M1 scan, M4 stock, aperçu de geste).
4. Les **transitions de territoire** demandées par R6 sont couvertes : privé → public (M4), personnel → groupe (M2, M6), groupe → personnel (alertes de M8).

---

## 2. Tranches verticales (MVP), d'après le cours

Le cours demande d'itérer par **tranches verticales de bout en bout** plutôt que d'écrire un dispositif à la fois.

| MVP | Échéance du module | Contenu | Périmètres | Critère de réussite |
|---|---|---|---|---|
| **MVP 1** | Séance 3 : premier échange entre appareils | Un téléphone se connecte par QR code et **pilote une voiture visible sur la table** | M1 (partiel), M3 | Direction → mouvement < 80 ms ; la table montre les places |
| **MVP 2** | Séance 5 : au moins un scénario complet | **Une course à quatre téléphones** avec ramassage de bonus, POWER, un geste (boost) et une réparation à deux | M1, M3, M4 (boost), M6, M8 | Scénario 1 joué de bout en bout par 4 personnes |
| **MVP 3** | Séance 8 : démonstration finale et tests | Création du circuit, lance-pierre, objets posés, déformation, tutoriel, reconnexion, journal | M2, M4, M5, M7, M9, M10, M11 | Scénarios 1 à 6, tests utilisateurs réalisés |

Chaque membre doit gérer **une partie de l'implémentation seul** (note individuelle). Découpage naturel par bloc : serveur et protocole, application pilote, application copilote, rendu de la table. À attribuer par l'équipe.

---

## 3. Scénarios

Les scénarios sont des **histoires d'usage** : ils ne remplacent pas les modèles de tâches, ils les alimentent. Chacun donne les acteurs, les dispositifs, le déroulé, les données publiques ou privées et le critère de réussite.

### S1 · Une soirée à quatre (scénario nominal, MVP 2)

- **Acteurs** : Inès (pilote cyan), Marc (copilote cyan), Léa (pilote rose), Sam (copilote rose). Quatre téléphones, une table affichée dans le salon.
- **Déroulé** :
  1. La table affiche un QR code. Chacun le scanne, choisit son équipe et son rôle. La table remplit les quatre places.
  2. Le circuit est déjà prêt (prédéfini) ; la ligne de départ tourne puis se fixe. Trois bips et GO.
  3. Inès et Léa **pilotent** sur leurs téléphones et suivent leurs voitures **sur la table**, sans quitter la table des yeux.
  4. Une capsule de boost est ramassée par la voiture cyan : le stock apparaît **sur le téléphone de Marc seulement**.
  5. Marc appuie sur **POWER** : le bonus devient armé, **visible de tous** sur la table.
  6. Marc pose deux doigts sur la vue du circuit de son téléphone : l'aperçu est privé, le portail apparaît sur la table à la confirmation.
  7. Une voiture sort de piste : Léa et Sam **maintiennent chacun leur contrôle** pendant 2 s ; trois feux sur la table, puis départ.
  8. L'équipe cyan termine 3 tours : la table affiche le classement ; chacun peut rejouer.
- **Données** : public = course, bonus armé, résultats ; privé = stock, aperçu de geste.
- **Réussite** : 4 joueurs terminent la course sans aide ; aucun regard prolongé sur le téléphone de l'autre ; latence perçue acceptable.

### S2 · Le vol de bonus (compétition, M4)

- **Acteurs** : copilotes cyan (Marc) et rose (Sam).
- **Déroulé** : Marc arme son lance-pierre avec POWER, puis hésite. La table montre le bonus armé. Sam, qui n'a pas de stock, voit le pictogramme et **réalise le geste avant lui** : le bonus est consommé, l'effet appartient à l'équipe de Sam. Marc reçoit « bonus volé » sur son téléphone.
- **Ce qu'on teste** : le caractère public de l'armement, le geste rapide sur petit écran, l'attribution par émetteur (et non plus par proximité), le conflit entre deux messages simultanés.
- **Réussite** : le serveur n'accepte qu'un seul geste ; les deux téléphones et la table s'accordent sur le résultat en < 200 ms.

### S3 · La panne qui oblige à coopérer (collaboration inter-appareils, M6)

- **Acteurs** : Inès (pilote) et Marc (copilote) de l'équipe cyan.
- **Déroulé** : la voiture cyan se retrouve hors d'usage. Les deux téléphones affichent une **alerte de réparation** ; la table montre l'icône de panne. Inès maintient son contrôle, Marc maintient le sien. Marc lâche trop tôt : la jauge retombe sur les deux téléphones et sur la table. Ils recommencent, tiennent 2 s, puis trois feux et départ.
- **Ce qu'on teste** : action synchrone sur **deux appareils**, retour de jauge partagé, latence qui rend la synchronisation difficile.
- **Réussite** : l'équipe comprend sans explication qu'il faut tenir ensemble ; la jauge est cohérente sur les trois écrans.

### S4 · La coupure Wi-Fi (résilience, M11)

- **Acteurs** : Léa (pilote rose), dont le téléphone perd le réseau 8 s.
- **Déroulé** : la voiture rose passe en **AUTO** ; la table affiche un indicateur « déconnecté » sur sa place ; le téléphone de Léa affiche « reconnexion ». Au retour, il reprend sa place avec l'état courant. Si la coupure dépasse le délai, la partie se met en **pause** et la table explique pourquoi.
- **Ce qu'on teste** : continuité d'état et temporelle, absence de double tirage du circuit, retour d'état sur les trois dispositifs.
- **Réussite** : aucune perte de stock ni de place ; le joueur sait toujours ce qui se passe.

### S5 · Créer le circuit à deux équipes (M2)

- **Acteurs** : Inès et Léa placent les ancres ; Marc et Sam dessinent les deux moitiés.
- **Déroulé** : cyan place P1 sur la vue de son téléphone ; rose place P2 ; l'aperçu se montre sur la table. Cyan relie P1 à P2 ; rose relie P2 à P1 dans l'autre moitié. La table révèle le circuit puis la ligne de départ tourne et se fixe.
- **Ce qu'on teste** : tâche compétitive/collaborative avec **dessin sur petit écran**, ordre imposé (cyan puis rose), refus expliqués, aperçu public.
- **Réussite** : un circuit roulable à partir de dessins sur téléphone ; les refus sont compris.

### S6 · Première partie : le tutoriel (M9)

- **Acteurs** : quatre personnes qui ne connaissent pas le jeu.
- **Déroulé** : après la connexion, chaque téléphone affiche la **consigne de son rôle** avec une démonstration animée ; la table montre l'avancement des deux équipes. Les étapes se valident par des **événements réels** : un bonus ramassé, POWER, un tir, un portail traversé, une réparation, la pose d'un mur depuis le téléphone, la pose des deux piliers, le rangement.
- **Ce qu'on teste** : consignes par rôle, risque de **perte d'attention** entre téléphone et table, besoin de « passer » une étape.
- **Réussite** : les quatre finissent sans intervention orale de l'animateur ; l'usage de « Passer » est noté.

### S7 · L'animateur sans Oz (M10)

- **Acteurs** : un animateur et des participants extérieurs lors d'un test.
- **Déroulé** : l'animateur règle la difficulté et le nombre de tours sur la table, lance la partie, met en pause pour répondre à une question, libère une place bloquée, puis télécharge le **journal horodaté** à la fin.
- **Ce qu'on teste** : qui a le droit de régler quoi, comment l'animateur reste hors du champ d'attention des joueurs, la qualité du journal pour l'évaluation.
- **Réussite** : l'animateur n'a besoin d'aucun second ordinateur ; le journal permet de rejouer la séance.

### S8 · Une place vide (dynamique de l'application, facultatif)

- **Acteurs** : trois joueurs seulement.
- **Déroulé** : la table propose un **pilote automatique** pour la place vide ou refuse le départ. Un quatrième joueur arrive en cours de partie et reprend la place.
- **Ce qu'on teste** : arrivée et départ d'appareils, équité du jeu, effet sur la lisibilité.
- **Réussite** : la partie reste jouable et la transition est comprise.

---

## 4. Ce que chaque scénario couvre

| Scénario | M0 | M1 | M2 | M3 | M4 | M5 | M6 | M7 | M8 | M9 | M10 | M11 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| S1 | ● | ● | | ● | ● | | ● | | ● | | | |
| S2 | | | | | ● | | | | ● | | | |
| S3 | | | | ● | | | ● | | ● | | | |
| S4 | | ● | | ● | | | | | ● | | | ● |
| S5 | ● | ● | ● | | | | | | | | | |
| S6 | ● | ● | | ● | ● | ● | ● | ● | ● | ● | | |
| S7 | | | | | | | | | | | ● | |
| S8 | | ● | | ● | | | | | ● | | ● | ● |

Les périmètres **M5** (objets posés) et **M7** (déformation) ne sont couverts qu'au sein de S6 : ajouter si besoin un scénario dédié (par exemple « Barrer la route avec un mur et trois piliers »).

---

## 5. Risques de conception à garder en tête (raffinement)

- **Perte d'attention table ↔ téléphone** : un pilote qui regarde sa direction ne voit pas sa voiture. Mitigation : retours **sur la table** pour tout ce qui compte, téléphone minimal pour le pilote.
- **Geste sur petit écran** : les seuils du lance-pierre ont été réglés pour une table de 55 à 65 pouces ; ils doivent être redéfinis en **millimètres**.
- **Surcharge** : le copilote cumule POWER, visée, objets et réparation ; hiérarchiser les écrans plutôt que tout afficher.
- **Latence** : la réparation synchrone dépend de deux réseaux ; prévoir une tolérance de quelques centaines de millisecondes.
- **Suppression d'Oz** : plus aucun humain ne rattrape une erreur d'un objet posé ; la validation serveur et l'annulation doivent être irréprochables.
