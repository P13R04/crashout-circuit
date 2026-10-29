# Sessions de test avec des personnes extérieures (issue #40)

Il n'y a pas de présentation : l'application est testée par des personnes qui ne l'ont pas construite. Ce document sert à préparer, lancer et observer une session sans connaître le code. Au moins **deux sessions** doivent avoir lieu avant le gel du code (samedi 31 octobre – dimanche 1er novembre 2026).

## 1. Session type (45 minutes)

| Temps | Étape | Qui |
|---|---|---|
| 5 min | Accueil, une phrase de contexte : « une course à deux équipes, chaque équipe a un pilote et un copilote » | Animateur |
| 15 min | **Tutoriel** (bouton TUTORIEL) : les deux équipes suivent leurs étapes seules, sans aide | Testeurs |
| 15 min | **Course libre** en mode TABLE, avec Oz qui pose et active les tangibles | Testeurs, Oz |
| 5 min | Questions : qu'avez-vous compris, qu'est-ce qui vous a bloqué, que referiez-vous ? | Animateur |
| 5 min | Sauvegarde du journal (**F4**), rangement, notes | Animateur |

**Équipe minimale** : 4 testeurs (pilote et copilote de chaque équipe), 1 animateur qui observe sans intervenir, 1 opérateur Oz (ce peut être un des développeurs, mais qui ne joue pas).

**Consignes à donner, et seulement celles-ci** : le but est de finir des tours, un copilote a un bouton POWER et des gestes, une voiture en panne se répare à deux. Ne pas expliquer les gestes : c'est le tutoriel qui doit le faire. Noter chaque moment où l'on aurait envie de parler.

**Matériel** : la table, les tangibles en bois (mur, deux piliers), un second ordinateur pour la console Oz, un téléphone ou une feuille pour la grille d'observation, optionnellement une caméra sur la table.

## 2. Fiche de lancement (sans connaissances techniques)

1. Sur l'ordinateur relié à la table, ouvrir un terminal dans le dossier du projet.
2. Mettre à jour et démarrer :

   ```bash
   git pull
   npm install
   npm run build
   npm start
   ```

   Le terminal affiche les adresses ; laisser la fenêtre ouverte pendant toute la séance.
3. Ouvrir `http://localhost:3000/?log=1` dans Chrome ou Edge, puis **Paramètres → Plein écran**. `?log=1` enregistre automatiquement le journal de chaque partie à la fin ; `?debug=1` (ou **F3**) affiche les mesures et les dernières décisions des gestes.
4. Sur l'autre ordinateur (même réseau Wi-Fi, pas un réseau invité qui isole les appareils), ouvrir `http://<adresse-de-la-table>:3000/oz`. L'adresse exacte est écrite par le serveur au démarrage.
5. Choisir **TUTORIEL** puis, pour la course libre, revenir à l'accueil (Paramètres → Accueil) et choisir **TABLE**.

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

- **F4** (ou `?log=1`) télécharge `session-<date>.csv` : contacts avec leur largeur, décisions des gestes, retours du serveur (ramassages, tirs, réparations, chutes) et changements de phase, avec l'heure. Le format est décrit dans [seuils-tactiles.md](seuils-tactiles.md).
- L'overlay `?debug=1` donne fps, durée de frame, RTT, latence doigt→image et nombre de contacts : à relever en début et en fin de séance dans [measures.md](../measures.md) §2.
- Le journal des tangibles posés par Oz est disponible sur `http://<adresse-de-la-table>:3000/api/oz-log`.
- Pour comparer le lance-pierre à de vraies parties, relever le nombre de `stoneHit` par minute et le temps entre une panne (`carDisabled`) et la réparation (`repairDone`), puis relancer `npm run sim:sling` après avoir adapté `PLAYERS` (issue #39, [measures.md](../measures.md) §5).

## 5. Après la session

1. Ouvrir **une issue par problème** (titre court, étape concernée, ce qu'on a vu, copie de la ligne de la grille, journal joint) avec le label du lot : `lot A · ergonomie`, `lot B · clarté`, `lot D · tutoriel`, `lot E · tangibles`, `lot F · circuit et objets`, `lot H · fiabilité`.
2. Marquer comme prioritaires les blocages et les gestes ratés répétés ; tout ce qui n'est pas corrigé avant le gel du dimanche 1er novembre est documenté dans le README.
3. Compléter le tableau ci-dessous.

| Session | Date | Testeurs | Mode joué | Problèmes relevés (issues) | Journal |
|---|---|---|---|---|---|
| 1 | _à remplir_ | | | | |
| 2 | _à remplir_ | | | | |
