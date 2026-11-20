---
name: limiter-taille-fichiers
description: Évite les fichiers, fonctions et dossiers trop gros. À utiliser avant de créer ou d'allonger un fichier source (.ts), avant d'ajouter un fichier dans un dossier déjà chargé, avant de conclure une tâche de code, et chaque fois qu'un fichier approche 300 lignes ou un dossier 10 fichiers. Seuils chiffrés, découpe et rangement par responsabilité, garde-fou `npm run check:sizes`.
---

# Limiter la taille des fichiers et des dossiers

Un fichier trop grand ou un dossier qui mélange quarante fichiers décourage les personnes qui connaissent peu le projet : il mélange plusieurs responsabilités et se lit mal. Ce skill fixe des seuils chiffrés. Pour la règle de dépendance entre modules, voir le skill `clean-architecture`, qui ne donne aucun seuil de taille.

## Seuils

| Élément | Cible | Plafond |
|---|---|---|
| Fichier source `.ts` | 300 lignes | **500 lignes** (mesure `wc -l`) |
| Dossier (fichiers `.ts` directs) | 10 fichiers | **12 fichiers** |
| Fonction | — | 60 lignes |
| Imbrication (`if`, boucles, callbacks) | — | 3 niveaux |

- Hors périmètre : `prototypes/`, `dist/`, `node_modules/`, les fichiers de données, audio et documents.
- Beaucoup de lignes des anciens fichiers dépassent 160 caractères : les couper quand on y touche, sans en faire un critère bloquant.

## Quand l'appliquer

1. **Avant de créer un fichier** : choisir son nom par responsabilité métier (`boostGate.ts`, `pickupSpawn.ts`), pas par catégorie technique, puis le placer dans le dossier de sa responsabilité (voir « Ranger les dossiers »). Si ce dossier approche 10 fichiers, créer un sous-dossier avant d'ajouter.
2. **Avant d'allonger un fichier** de plus de 300 lignes : chercher d'abord s'il faut extraire un module plutôt qu'ajouter.
3. **Avant de conclure une tâche** : lancer `npm run check:sizes` (inclus dans `npm run check` et `npm run verify`) et vérifier qu'aucun fichier touché n'a grossi au-delà de sa cible.

## Comment découper

- Un module = une responsabilité qu'on peut nommer en une phrase. Les sections marquées par des commentaires `// ---` sont des découpes naturelles.
- **Pas de fichier fourre-tout** : interdits `utils`, `helpers`, `common`, `misc`, `tools`. Nommer par ce que fait le code.
- **Déplacement pur** : ne changer ni la logique, ni les noms publics. Garder une **façade** (le fichier d'origine réexporte ou délègue) pour que les chemins d'import extérieurs restent valables, et la placer dans le dossier de ses modules.
- Un nouveau fichier suit la convention du dépôt : en-tête en français (rôle et liens) et résumé en français pour chaque fonction.
- Attention aux dépendances circulaires : le module extrait ne doit pas importer la façade qui l'appelle ; passer l'état ou les fonctions en paramètres, ou isoler les types dans un module sans dépendance.

## Ranger les dossiers

- Un dossier = un sujet qu'on peut nommer en un mot (`tangibles`, `net`, `modes`, `themes`, `ui`, `sound`). Pas de dossier `misc`, `common` ou `shared` : nommer par ce qu'il contient.
- Au-delà de 10 fichiers directs, répartir en sous-dossiers par responsabilité (exemples du dépôt : `server/rules/session` et `gameplay`, `client-table/themes/neon`, `scrap` et `circuit`, `client-table/gesture/actions`, `scripts/acceptance/race`).
- Garder à la racine d'un dossier le point d'entrée et la façade (`index.ts`, `main.ts`, `GameRules.ts`), les modules vont dans leur sous-dossier.
- **Déplacer un fichier** demande de réécrire dans le même commit : les imports (y compris `import()` dynamiques et `new URL(..., import.meta.url)`), les chemins de `package.json`, des tests et de la documentation (`README.md`, `context.md`, `docs/guide-du-code.md`, agents, skills). Vérifier ensuite avec `npm run verify`.

## Garde-fou automatique

`scripts/quality/file-sizes.ts` compte les lignes des `.ts` hors `prototypes/`, `dist/` et `node_modules/`. Il échoue si :

- un fichier **hors liste de base** dépasse 500 lignes ;
- un dossier contient **plus de 12 fichiers `.ts`** directs (les sous-dossiers se comptent séparément) ;
- un fichier de la liste de base (`scripts/quality/file-sizes.baseline.json`) **grossit** par rapport à sa taille enregistrée ;
- une entrée de la liste est devenue inutile (fichier revenu sous 500 lignes ou disparu) : la retirer.

Chaque découpe retire son entrée de la liste de base. Quand la liste est vide, plus aucun `.ts` ne dépasse 500 lignes. Ne jamais augmenter une valeur de la liste pour faire passer le contrôle.

## Inspiration

Skill `software-architecture` de popey (fichiers de 200 lignes au plus, fonctions de 80 au plus) : https://github.com/popey/claude-code-skills/blob/a5a66011267ac6a6c3b030547a804184fa4f7cad/plugins/antigravity-awesome-skills-claude/skills/software-architecture/SKILL.md. Sa licence est introuvable : le texte n'est pas repris, seuls les ordres de grandeur ont inspiré les seuils.
