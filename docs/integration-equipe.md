# Intégration de l’équipe — 28 octobre 2026

L’audit couvre toutes les branches distantes et les têtes des pull requests du dépôt. Les seuls commits fonctionnels encore absents de notre version récente provenaient de `baptiste`. Les branches #30 et #31 étaient déjà dans l’historique ; leurs animations ont été revues dans le rendu actuel et complétées, sans réinstaller l’ancien Renderer.

| Source | Apport intégré et adapté |
|---|---|
| `baptiste` · `0e8ed91` | Relier les points dans les deux sens pour l’équipe active ; normalisation des traits avant envoi et génération. Bonus ancrés à la route durant les déformations, y compris pendant leur délai de réapparition ; marge de sécurité sur la chaussée. |
| #30 · `48f67b0` | Vraie zone d’accélération de 60 px, déploiement, émetteurs, rails, chevrons et trainées d’énergie. Animation adaptée aux deux thèmes ; fin de vie progressive sans secousses ni clignotements agressifs. |
| #31 · `6820320` | Apparition, déplacement et retrait des tangibles ; scan de déploiement du mur, dissolution de son empreinte et particules bornées. Retours sonores avec priorité à la formation/rupture de l’arc. |
| #41 · `020778a` | Partenaires en diagonale et choix AUTO/PÉDALE indépendant par pilote. Une seule inversion des copilotes. |
| #34 · `bf38fe8` | Carte Oz orientable, raccourcis, commandes rapides, rotation à pivot et historique, adaptés aux trois tangibles neutres et à la recharge dans les deux stations. |
| #32 · `6e693be` | Tutoriel à progression indépendante, consignes brèves, commandes éclairées et étape Oz facultative. |
| Visuels #26/#35 · `f954b54` | Thèmes Néon et Ferraille, ambiance mécanique, éclairage, profondeur, réacteurs et trajectoires conservés. |
| Test tangibles · `9e07658` | Pilotes automatiques avec la vraie physique, copilote requis pour réparer, session sans limite et plein écran avec sortie par Échap. |

Les anciens travaux circuit, lance-pierre, déformation, chute, reset et contrôles (#3, #4, #9, #10, #12, #20) sont déjà ancêtres de cette version. Aucune nouvelle branche issue d’un fork n’a été découverte dans les pull requests consultées. Les anciens instantanés locaux de travail ne sont pas réappliqués au-dessus des versions fonctionnelles qui les remplacent.

## Décisions de compatibilité

- L’ordre **cyan puis rose**, les contacts concurrents, les anneaux de 95 px et la confirmation de génération restent validés par le serveur. Commencer par l’autre point ne change jamais l’équipe attribuée au trait. L’arrivée éclairée s’adapte au point choisi.
- L’ancienne suppression de l’ajustement à la surface n’est pas reprise : le dessin reste inchangé lorsqu’il tient dans la zone jouable ; un débordement reste redimensionné uniformément pour éviter les postes. Les tests qui protègent ces limites sont conservés.
- Le boost garde sa puissance liée à l’écartement de 100–400 px. Son centre reste celui des contacts ; la barre est orientée transversalement et le flux suit la piste. À un carrefour, l’orientation des contacts distingue les deux branches. Les collisions utilisent la même zone que le rendu, sur ses quatre côtés.
- Les champs de piliers et les arcs de notre version visuelle sont conservés. Les tangibles restent neutres et leur déplacement nécessite une recharge ; les petites corrections restent bornées autour de la pose initiale.
- La silhouette complète du mur est visible dès sa pose, même pendant le scan : une animation ne masque jamais une partie déjà dangereuse. Le retrait devient un effet diffus sans collision.
- Les animations se figent en pause, respectent la réduction des mouvements et utilisent des halos réutilisés. Aucun changement de pose ne renvoie toute la géométrie du circuit ; les transitions et les sons sont bornés.

## Vérifier avant intégration dans main

```bash
npm run verify
```

Cette commande vérifie les règles, les gestes, les échanges réseau, le rendu, les transitions, les pilotes automatiques et la géométrie du boost, puis compile le serveur et les deux applications.

Validation complète réussie : 95 scénarios de règles, 17 de gestes, 20 de rendu, 7 de transitions et sons, 12 de pilotage automatique et 4 de boost, ainsi que les échanges réseau et la compilation. Les tests réseau distinguent la géométrie initiale des mises à jour allégées ; ils ne supposent plus que chaque tick renvoie toute la piste.

La vérification dans le navigateur utilise des serveurs séparés de la session de travail. Les deux thèmes, les zones de boost sur les deux côtés du circuit, la réparation depuis les postes copilotes et le dessin dans les deux sens ont été contrôlés. Un défaut d’étiquetage P1/P2 après synchronisation JSON a été corrigé et couvert par un test. Les mesures de frame du navigateur ne constituent pas une mesure de cadence sur la dalle réelle.

## Recette courte sur table

1. Ouvrir la table en plein écran et Oz sur le même Wi-Fi. Choisir **TEST TANGIBLES**, puis ▶ pour tester à effectif réduit.
2. Après avoir ramassé un boost et l’avoir armé avec POWER, poser les deux doigts de travers sur une portion de piste : le boost doit garder son centre et pointer dans le sens de la course. Vérifier un portail sur chaque côté du circuit, puis dans un virage et, dans une partie dessinée, dans un croisement en huit.
3. Vérifier le franchissement de la zone, la puissance selon l’écartement, la consommation/vol du stock, la disparition après huit secondes et la pause au milieu du déploiement.
4. Charger le mur, le poser et faire une petite correction : l’empreinte reste entière pendant l’animation. Le retirer ou le remettre en station supprime immédiatement sa collision, puis dissout son ancien rendu.
5. Poser les piliers, vérifier leurs champs et leur arc, puis la désactivation et la recharge à l’autre poste. Les deux voitures doivent subir leurs effets. Réparer depuis le seul pad copilote dans le mode de test.
6. Dans TABLE ou PC, commencer le trait cyan par P2 puis le rose par P1 : les traits sont acceptés dans leurs moitiés, sans intervertir les équipes. Le bouton de génération reste nécessaire.
7. Déformer la piste à proximité d’un bonus : il doit suivre sa portion de route sans réapparaître prématurément ni se retrouver dans le vide après la détente.
8. Changer de thème, réduire les animations, tester le tutoriel et revenir à une partie normale. Les modes, la disposition, la recharge et les rôles restent les mêmes.

La précision de placement, la lisibilité à quatre postes, le budget de contacts et la cadence en 4K restent à vérifier sur la table physique, selon `measures.md`.
