# Neon Circuit Lab

Prototype Web local d’un jeu de course asymétrique pensé pour une table multitouch/tangible. Il ne cherche pas encore à reproduire le jeu final : il sert à isoler et itérer les principes qui devront justifier l’usage d’une grande surface partagée.

Le principe central est la **piste vivante** : le circuit est à la fois le terrain de course et l’interface commune sur laquelle pilote, copilote et architecte agissent.

## Lancer le prototype

Prérequis : une version récente de Node.js (22 ou plus) et npm.

Depuis un terminal :

```bash
cd "/Users/piero/Documents/M2/Interfaces tactiles/prototype-piste-vivante"
npm run dev -- --port 3000
```

Ouvrir ensuite [http://localhost:3000](http://localhost:3000).

Les modifications de code sont prises en compte automatiquement tant que ce terminal reste ouvert. Pour arrêter le prototype, appuyer sur `Ctrl+C` dans ce terminal.

### Si le port 3000 est déjà occupé

Identifier le processus qui l’utilise :

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
```

Puis arrêter uniquement le processus indiqué, en remplaçant `PID` par son identifiant :

```bash
kill PID
```

S’il ne s’arrête pas après quelques secondes, utiliser en dernier recours :

```bash
kill -9 PID
```

Enfin relancer `npm run dev -- --port 3000`. Éviter de tuer tous les processus Node : d’autres projets peuvent en dépendre.

## Démonstrateur d’interactions

Le prototype est désormais une série de cinq scènes autonomes sur une piste droite. Ce choix rend chaque relation de cause à effet immédiatement lisible dans une capture de slide : l’action table est affichée avant son effet sur la voiture.

| Scène | Action montrée | Effet visible |
|---|---|---|
| 00 · Tracer à deux | Deux points initiaux et deux demi-tracés simultanés | Une boucle irrégulière se ferme entre les deux joueurs |
| 01 · Déformer la piste | Deux contacts saisissent et étirent localement la bordure | La route se décale et la voiture contourne le mur |
| 02 · Passer en fantôme | Le pilote active un bonus à son poste | La voiture traverse le mur, avec halo fantôme |
| 03 · Dessiner un boost | Trois doigts définissent un polygone | La voiture accélère dans la zone |
| 04 · Lance-pierre | Deux appuis servent de base, un troisième est tiré | Un projectile guidé inflige des dégâts |
| 05 · Sortie et respawn | Un mur orienté dévie la trajectoire | La voiture tombe, puis revient au dernier point sûr |

Chaque scène démarre automatiquement, peut être mise en pause, puis relancée. Les cercles lumineux sont des faux contacts temporaires : ils ne sont présents que pendant le geste et suivent son mouvement (traction du lance-pierre, étirement de bordure, tracés synchronisés). Dans le scénario de sortie de piste, les deux contacts pilote/coéquipier précèdent visiblement le respawn. La bande basse n’est pas une maquette d’application complète : elle explique qui agit, quel geste est produit, et quelle information est affichée au pilote.

## Cadre de conception

Le prototype valide quatre hypothèses avant tout travail réseau, mobile ou matériel :

1. Un trait libre peut devenir un circuit clair, jouable et visuellement convaincant.
2. Le pilotage reste accessible quand la vitesse est maîtrisée, que la décision principale est la rotation, et que l’inertie latérale doit être compensée activement.
3. Les actions d’aide et de sabotage sont intéressantes lorsqu’elles modifient la route elle-même, plutôt que lorsqu’elles activent des bonus abstraits.
4. Une déformation temporaire peut ouvrir une opportunité sans supprimer la difficulté de conduite.

La cible finale est une table commune : le pilote conserve un contrôle continu, le copilote agit directement à l’endroit utile sur la route, et l’architecte transforme simultanément ce même espace grâce à des tangibles orientés. Un smartphone ou une tablette isolée ne doit pas offrir une expérience équivalente.

## Architecture de la piste déformable

Le modèle est intentionnellement indépendant du rendu et des futures entrées matérielles.

```text
trait utilisateur
  → nettoyage, lissage et rééchantillonnage
  → trajectoire centrale paramétrée par progression s
  → échantillons de bord gauche(s) et bord droit(s)
  → rendu, limites de conduite, objets et checkpoints
```

Le circuit canonique n’est jamais réécrit pendant une interaction. Une déformation contient seulement une bande locale : position sur la progression et déplacement latéral demandé. À chaque image, le même déplacement est appliqué au centre et aux deux bords voisins : la bande se décale comme une chicane temporaire, sans gonfler ni rétrécir la piste.

Cette approche permet de mettre à jour uniquement la petite portion concernée : pas de nouvelle génération de spline, pas de perte de checkpoints, et le même champ sert au rendu comme à la limite hors-piste de la voiture. Une évolution ultérieure ajoutera une contrainte de largeur minimale et de rayon de virage pendant le geste.

## Organisation du code

| Emplacement | Responsabilité actuelle |
|---|---|
| `app/page.tsx` | Simulation, génération de circuit, interactions souris/clavier et rendu Canvas |
| `app/globals.css` | Interface du laboratoire et direction visuelle néon |
| `app/layout.tsx` | Métadonnées du prototype |

La prochaine refactorisation isolera ces responsabilités dans `track`, `simulation`, `input` et `render`. Cette séparation préparera le remplacement de la souris et du clavier par des adaptateurs `TouchInput`, `TangibleInput` et `MobileInput`, sans changer la logique de jeu.

## Limites connues et prochaines itérations

Ce prototype est une base de recherche, pas encore une version de course complète.

- La validation visuelle des tracés mal fermés, des virages trop serrés et des circuits en huit reste à formaliser.
- Les objets sont actuellement simulés par la souris ; leur interface future devra accepter position, rotation et identifiant tangible.
- La déformation actuelle gère une bande unique ; plusieurs bandes simultanées viendront lorsque l’interaction multitouch sera définie et testée.
- L’enregistrement puis la relecture d’un tour de référence est une bonne prochaine étape pour opposer un architecte à une voiture « du passé ».
- Il n’y a volontairement ni réseau, ni connexion mobile, ni persistance pour l’instant.

## Vérifier avant de partager une itération

```bash
npm run build
```

Cette commande vérifie que le prototype est compilable sans lancer le serveur local.
