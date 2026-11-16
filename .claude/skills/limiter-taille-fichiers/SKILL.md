---
name: limiter-taille-fichiers
description: Évite les fichiers et fonctions trop grands. À utiliser avant de créer ou d'allonger un fichier source (.ts), avant de conclure une tâche de code, et chaque fois qu'un fichier approche 300 lignes. Seuils chiffrés, découpe par responsabilité, garde-fou `npm run check:sizes`.
---

# Limiter la taille des fichiers

Un fichier trop grand décourage les personnes qui connaissent peu le projet : il mélange plusieurs responsabilités et se lit mal. Ce skill fixe des seuils chiffrés. Pour la règle de dépendance entre modules, voir le skill `clean-architecture`, qui ne donne aucun seuil de taille.

## Seuils

| Élément | Cible | Plafond |
|---|---|---|
| Fichier source `.ts` | 300 lignes | **500 lignes** (mesure `wc -l`) |
| Fonction | — | 60 lignes |
| Imbrication (`if`, boucles, callbacks) | — | 3 niveaux |

- Hors périmètre : `prototypes/`, `dist/`, `node_modules/`, les fichiers de données, audio et documents.
- Beaucoup de lignes des anciens fichiers dépassent 160 caractères : les couper quand on y touche, sans en faire un critère bloquant.

## Quand l'appliquer

1. **Avant de créer un fichier** : choisir son nom par responsabilité métier (`boostGate.ts`, `pickupSpawn.ts`), pas par catégorie technique.
2. **Avant d'allonger un fichier** de plus de 300 lignes : chercher d'abord s'il faut extraire un module plutôt qu'ajouter.
3. **Avant de conclure une tâche** : lancer `npm run check:sizes` (inclus dans `npm run check` et `npm run verify`) et vérifier qu'aucun fichier touché n'a grossi au-delà de sa cible.

## Comment découper

- Un module = une responsabilité qu'on peut nommer en une phrase. Les sections marquées par des commentaires `// ---` sont des découpes naturelles.
- **Pas de fichier fourre-tout** : interdits `utils`, `helpers`, `common`, `misc`, `tools`. Nommer par ce que fait le code.
- **Déplacement pur** : ne changer ni la logique, ni les noms publics. Garder une **façade** (le fichier d'origine réexporte ou délègue) pour que les chemins d'import extérieurs restent valables.
- Un nouveau fichier suit la convention du dépôt : en-tête en français (rôle et liens) et résumé en français pour chaque fonction.
- Attention aux dépendances circulaires : le module extrait ne doit pas importer la façade qui l'appelle ; passer l'état ou les fonctions en paramètres, ou isoler les types dans un module sans dépendance.

## Garde-fou automatique

`scripts/file-sizes.ts` compte les lignes des `.ts` hors `prototypes/`, `dist/` et `node_modules/`. Il échoue si :

- un fichier **hors liste de base** dépasse 500 lignes ;
- un fichier de la liste de base (`scripts/file-sizes.baseline.json`) **grossit** par rapport à sa taille enregistrée ;
- une entrée de la liste est devenue inutile (fichier revenu sous 500 lignes ou disparu) : la retirer.

Chaque découpe retire son entrée de la liste de base. Quand la liste est vide, plus aucun `.ts` ne dépasse 500 lignes. Ne jamais augmenter une valeur de la liste pour faire passer le contrôle.

## Inspiration

Skill `software-architecture` de popey (fichiers de 200 lignes au plus, fonctions de 80 au plus) : https://github.com/popey/claude-code-skills/blob/a5a66011267ac6a6c3b030547a804184fa4f7cad/plugins/antigravity-awesome-skills-claude/skills/software-architecture/SKILL.md. Sa licence est introuvable : le texte n'est pas repris, seuls les ordres de grandeur ont inspiré les seuils.
