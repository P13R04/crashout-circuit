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
