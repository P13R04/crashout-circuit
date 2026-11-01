# Sessions de test avec des personnes extérieures (issue #40)

Il n'y a pas de présentation : l'application est testée par des personnes qui ne l'ont pas construite. Ce document sert à préparer, lancer et observer une session sans connaître le code. Les premiers essais sont prévus le **lundi 2 novembre 2026**. L’objectif de l’issue reste au moins **deux sessions** ; ne pas les compter comme réalisées avant d’avoir rempli les observations ci-dessous.

## 1. Session type (45 minutes)

| Temps | Étape | Qui |
|---|---|---|
| 5 min | Accueil, une phrase de contexte : « une course à deux équipes, chaque équipe a un pilote et un copilote » | Animateur |
| 15 min | **Tutoriel** (bouton TUTORIEL) : les deux équipes suivent leurs étapes seules, sans aide | Testeurs |
| 15 min | **Course libre** en mode COURSE, avec l’opérateur qui pose et active les tangibles | Testeurs, Oz |
| 5 min | Questions : qu'avez-vous compris, qu'est-ce qui vous a bloqué, que referiez-vous ? | Animateur |
| 5 min | Téléchargement du journal dans la console, rangement, notes | Animateur |

**Équipe minimale** : 4 testeurs (pilote et copilote de chaque équipe) et 1 opérateur sur un autre ordinateur. Un observateur supplémentaire est utile ; à défaut, l’opérateur prend aussi les notes.

**Consignes à donner, et seulement celles-ci** : le but est de finir des tours, un copilote a un bouton POWER et des gestes, une voiture en panne se répare à deux. Ne pas expliquer les gestes : c'est le tutoriel qui doit le faire. Noter chaque moment où l'on aurait envie de parler.

**Matériel** : la table, les trois tangibles LEGO (un mur, deux piliers), un second ordinateur pour la console Oz, un téléphone ou une feuille pour la grille d'observation, optionnellement une caméra sur la table.

## 2. Fiche de lancement (sans connaissances techniques)

1. Sur l'ordinateur relié à la table, ouvrir un terminal dans le dossier du projet.
2. Mettre à jour et démarrer :

   ```bash
   git pull
   npm install
   npm run build
   npm start
   ```

   Le terminal affiche les adresses, un **code opérateur** et « Outils de test : désactivés ». Si les outils sont activés, supprimer la variable `CRASHOUT_DEV_TOOLS` et redémarrer avant la séance. Laisser le terminal ouvert.
3. Ouvrir `http://localhost:3000/` dans Chrome ou Edge, puis **Paramètres → Plein écran**. **Ferraille** est l’ambiance initiale. Les diagnostics, simulations et modes de test sont inaccessibles dans ce lancement normal, y compris par leurs anciens raccourcis et paramètres d’URL.
4. Sur l'autre ordinateur (même réseau Wi-Fi, pas un réseau invité qui isole les appareils), ouvrir `http://<adresse-de-la-table>:3000/oz`. L’adresse exacte et le code sont écrits au démarrage du serveur. Saisir ce code dans la console. Un téléphone ou une tablette convient aussi ; le bouton ↻ oriente la carte.
5. Dans la console, garder **Pose avec les doigts**. Sur la table, choisir **TUTORIEL** (un clic à la souris lance aussi le parcours tactile). Chaque personne touche la clé de son poste : le départ attend les quatre personnes. Les coéquipiers de même couleur sont en diagonale.
6. À la fin du tutoriel, ranger les trois tangibles dans la réserve à droite, entre les copilotes. Choisir **CRÉER LE CIRCUIT**, tracer le circuit à deux équipes, puis toucher le bouton de départ. Les tours, dégâts, réparations et paramètres de course redeviennent ceux d’une partie normale.

### Consignes réservées à l’opérateur

La table ne signale jamais qu’une sélection attend dans la console. Les participants voient uniquement les contacts de leurs doigts, la pose et les effets de l’objet. Ne pas leur annoncer les sélections internes.

- Avant la séance : poser les trois objets dans la réserve à droite. Choisir le thème, la vitesse **Facile**, **3 tours**, le timer désactivé et un volume confortable. Préparer la grille de notes ; le journal des objets se télécharge dans la console opérateur.
- Pendant les gestes de bonus et la conduite : ne rien sélectionner dans la console. Une sélection de tangible réserve les prochains contacts et interrompt la reconnaissance des autres gestes jusqu’à la pose, l’annulation ou l’expiration.
- À l’étape du mur : sélectionner **1** juste avant la pose. Le copilote saisit le mur de part et d’autre de sa largeur et touche la table avec ses deux doigts. Le mur apparaît centré, sa longueur perpendiculaire à l’axe des contacts. Le pilote le touche pour constater le blocage, sans perte de vie dans le tutoriel. Toucher le mur dans la console lorsqu’il est physiquement soulevé.
- À l’étape des piliers : sélectionner **2**, puis **3**, juste avant chaque pose. Les doigts encadrent le pilier ; son centre sera au milieu des contacts. Rapprocher les deux piliers pour former un arc. Les pilotes essaient ensuite l’effet électrique réel, sans dégâts pendant le tutoriel. Une ancienne paire déjà sur la table ne valide pas la manipulation : chaque pilier doit être posé pendant l’étape.
- Le bandeau de la console suit séparément les étapes cyan et rose. Si les équipes sont décalées, refaire manipuler l’objet à la seconde équipe quand elle atteint l’étape correspondante. **Annuler** (ou **A** au clavier) annule une sélection ; elle reste sans effet visible sur la table.
- À la fin, attendre que les deux équipes arrivent au rangement. Faire déplacer les objets vers la réserve, puis les retirer sur la carte de la console ; on peut aussi sélectionner chaque objet et enregistrer ses deux contacts directement dans la réserve. Le tutoriel se termine quand les trois objets sont rangés. Le bouton discret **Passer ›** permet de débloquer une étape, mais noter toute utilisation.
- Pendant la course : continuer à annoncer chaque pose juste avant les contacts et à retirer chaque objet soulevé. Les murs et piliers sont neutres, sans recharge ; le bouton ⏻ arme seulement un bonus ramassé. Les sélections et le contrôle des tangibles restent sur l’ordinateur opérateur.

Le tutoriel montre les gestes sous forme de boucles animées près de chaque poste. Un seul bonus peut être armé à la fois : l’autre équipe peut l’utiliser, puis armer son propre stock. Les gestes sur les cartes de démonstration sont ignorés ; les joueurs les réalisent sur la piste.

Les modes clavier et essai avec voitures autonomes restent conservés pour la préparation : ils nécessitent `CRASHOUT_DEV_TOOLS=1` au démarrage du serveur, puis un rechargement de la table. Ils ne doivent pas être activés pendant les sessions utilisateur.

### Vérifications sur la table avant d’accueillir les testeurs

1. Depuis les quatre places, lire sa couleur et son rôle ; vérifier que chaque joueur retrouve sa voiture et son partenaire en diagonale.
2. Avec deux pilotes qui conduisent, essayer le boost avec deux contacts simultanés puis décalés, le lance-pierre et une déformation dans un virage. Observer si les démonstrations suffisent sans explication orale.
3. Annoncer un tangible dans la console : aucun pictogramme ni bip ne doit apparaître sur la table avant le contact. Poser le mur, tester sa rotation via la prise en largeur, puis les deux piliers et leur arc.
4. Réparer à deux, relâcher un des appuis pour vérifier la remise à zéro, puis recommencer et attendre les trois feux avant de repartir.
5. Terminer le tutoriel, ranger les objets, créer un circuit et finir une course normale. Tester la pause et la sortie du plein écran avec Échap.

Les vérifications automatiques contrôlent les règles, les priorités de gestes, les transitions réseau et les rendus des cinq thèmes. La lecture à distance, la prise LEGO et la détection réelle des doigts restent à valider sur la table.

**Si ça ne démarre pas.** Un ancien processus `node` peut garder le port 3000 sous Windows :

```bash
taskkill //F //IM node.exe
```

(dans PowerShell : `taskkill /F /IM node.exe`), puis relancer `npm start`. Si la page est blanche après une mise à jour, faire **Ctrl + F5**.

## 3. Grille d'observation

Une ligne par fait, avec l'heure (ou le temps de la caméra), l'équipe et le rôle. L'animateur n'aide pas avant d'avoir noté.

| Heure | Équipe / rôle | Étape ou moment | Type | Ce qui s'est passé | Gravité |
|---|---|---|---|---|---|
| | | | blocage · incompréhension · geste raté · silence · question posée · plaisir | | bloquant · gênant · détail |

Rappel des types :
- **Blocage** : la personne ne sait plus quoi faire pendant plus de 10 secondes.
- **Incompréhension** : elle fait autre chose que ce que l'écran demande.
- **Geste raté** : le geste voulu ne part pas, ou un geste non voulu part (noter les doigts utilisés).
- **Silence** : plus de 15 secondes sans parler ni jouer.
- **Question posée** : à l'animateur ou à son coéquipier.

À la fin, demander à chacun : *une chose qui vous a plu, une chose qui vous a gêné, une chose que vous n'avez pas comprise.*

## 4. Journal et mesures

- **Préparation technique uniquement**, avec `CRASHOUT_DEV_TOOLS=1` : **F4** (ou `?log=1`) télécharge `session-<date>.csv` : contacts avec leur largeur, décisions des gestes, retours du serveur (ramassages, tirs, réparations, chutes) et changements de phase, avec l'heure. Le format est décrit dans [seuils-tactiles.md](seuils-tactiles.md).
- **Préparation technique uniquement**, dans ce même lancement : l’affichage `?debug=1` donne fps, durée de frame, RTT, latence doigt→image et nombre de contacts : à relever en début et en fin de séance dans [measures.md](../measures.md) §2.
- **Pendant la séance**, télécharger le journal des objets depuis **Console → Objets et orientation → Télécharger le journal**. Il contient les poses et retraits ; les contacts et gestes détaillés ne sont pas inclus dans ce journal. Compléter la grille et, si prévu, la vidéo. L’adresse `/api/oz-log` exige la même session opérateur ; le journal ne se télécharge pas sans le code.
- Pour comparer le lance-pierre à de vraies parties, relever le nombre de `stoneHit` par minute et le temps entre une panne (`carDisabled`) et la réparation (`repairDone`), puis relancer `npm run sim:sling` après avoir adapté `PLAYERS` (issue #39, [measures.md](../measures.md) §5).

## 5. Après la session

1. Ouvrir **une issue par problème** (titre court, étape concernée, ce qu'on a vu, copie de la ligne de la grille, journal joint) avec le label du lot : `lot A · ergonomie`, `lot B · clarté`, `lot D · tutoriel`, `lot E · tangibles`, `lot F · circuit et objets`, `lot H · fiabilité`.
2. Marquer comme prioritaires les blocages et les gestes ratés répétés ; documenter les problèmes non corrigés et leur contournement avant la session suivante.
3. Compléter le tableau ci-dessous.

| Session | Date | Testeurs | Mode joué | Problèmes relevés (issues) | Journal |
|---|---|---|---|---|---|
| 1 | _à remplir_ | | | | |
| 2 | _à remplir_ | | | | |
