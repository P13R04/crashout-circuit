# Documents de l'évaluation coopérative

Préparation de l'étape 1 de l'évaluation coopérative d'IHM (cours d'Anne-Marie Déry, `EvaluationIHMInterfacesTactiles2026.pdf`) : la prise de notes et le questionnaire de fin. Chaque document tient sur **2 pages A4**.

| Fichier | Contenu | À imprimer |
|---|---|---|
| `feuilles-notation.pdf` / `.html` | Feuille d'observation | 1 exemplaire par observateur et par séance |
| `questionnaire-fin.pdf` / `.html` | Questionnaire de fin | 1 exemplaire par joueur (4 par séance) |

Imprimer en **A4, noir et blanc, recto verso**, échelle 100 %. Aucune information n'est portée par la couleur.

## Feuille d'observation

1. **Séance et participants** : J1 à J4 avec leur place à la table (disposition en diagonale du jeu).
2. **Tâches T1 à T7** : une ligne par tâche (circuit, conduite, objet et POWER, geste de l'objet, déformation, objet posé, réparation) avec le niveau d'aide, la durée et les observations. Puis la course libre.
3. **Modèle conceptuel** : ce que les joueurs croient comprendre, par thème (rôles, POWER, réparation, objets posés), et leurs idées fausses.
4. **Image de l'interface** : éléments d'écran non vus, ambigus ou gênants.
5. **Coopération et table**, **problèmes principaux** avec gravité de 1 à 3, et contrôle rapide de la séance.

## Questionnaire de fin

Anonyme (seul le code du joueur est noté). Questions courtes : profil, impression générale et note sur 10, quatre questions pour dire en quelques mots le modèle du jeu, lisibilité de l'écran, facilité et adéquation de chaque geste, coopération et place à la table, ce qu'il faut changer ou garder. Environ 5 à 7 minutes.

## Modifier et régénérer

Les fichiers HTML sont autonomes (styles inclus) et se modifient directement. Pour refaire les PDF avec Edge :

```bash
msedge --headless=new --no-pdf-header-footer --print-to-pdf=feuilles-notation.pdf feuilles-notation.html
msedge --headless=new --no-pdf-header-footer --print-to-pdf=questionnaire-fin.pdf questionnaire-fin.html
```

Chaque page fait exactement une feuille A4 : un texte ajouté qui dépasse est coupé. Après modification, vérifier que rien ne déborde.
