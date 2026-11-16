# Contexte projet

Crashout Circuit est un jeu de course asymétrique conçu pour une grande table multitouch avec objets tangibles. Deux équipes opposées associent un pilote et un coéquipier : le pilote conduit depuis un poste fixe, le coéquipier transforme localement la piste et manipule les objets de jeu.

## Référence disponible

`prototypes/piste-vivante` est une base de recherche web locale, pas la future architecture de production. Elle contient :

- des scènes de démonstration pour les gestes multitouch et les rôles ;
- une maquette de table éditable ;
- une génération illustrative de circuit et de ligne de départ ;
- des objets de test : mur, piliers reliés par arc électrique, boost, fantôme, lance-pierre et respawn.

Avant de modifier ou de remplacer une mécanique, lire le `README.md` du prototype et inspecter son rendu. Préserver ce sous-dossier comme contexte historique et expérimental ; les nouvelles applications ou intégrations doivent être créées à côté, jamais directement dans ce prototype sans demande explicite.

## Principes de conception à conserver

- La table est un espace partagé et non orienté : sa grande taille et les positions physiques des joueurs sont importantes.
- Les interactions doivent exploiter plusieurs contacts et/ou objets tangibles de façon coopérative, pas seulement comme une souris agrandie.
- Le coéquipier doit pouvoir aider son équipe et perturber l’équipe adverse.
- Les commandes pilotes finales sont prévues autour d’un tangible orienté et potentiellement d’un téléphone, mais aucune couche réseau ou mobile n’est imposée à ce stade.

## Taille des fichiers et architecture

- Un fichier source `.ts` vise **300 lignes** et ne dépasse jamais **500 lignes** (hors `prototypes/`) ; une fonction fait 60 lignes au plus, avec 3 niveaux d’imbrication au plus. Pas de fichier fourre-tout (`utils`, `helpers`, `common`) : nommer par responsabilité métier.
- Un dossier contient au plus **12 fichiers `.ts`** (cible 10) : au-delà, créer des sous-dossiers par responsabilité (par exemple `server/rules/session` et `gameplay`, `client-table/themes/neon`).
- Le contrôle est automatique : `npm run check:sizes` (dans `check` et `verify`) refuse un fichier de plus de 500 lignes ou un dossier de plus de 12 fichiers, et lit `scripts/quality/file-sizes.baseline.json`, qui liste les fichiers encore trop grands et ne doit jamais grossir.
- Skills du projet, dans `.claude/skills/` : `limiter-taille-fichiers` (seuils chiffrés, à appliquer avant de créer ou d’allonger un fichier et avant de conclure une tâche) et `clean-architecture` (règle de dépendance et frontières, copié de wondelai/skills, voir son `SOURCE.md`).
- Un découpage est un déplacement pur : mêmes noms publics, mêmes tests. Un fichier déplacé voit ses imports et les chemins cités dans la documentation mis à jour dans le même commit.
