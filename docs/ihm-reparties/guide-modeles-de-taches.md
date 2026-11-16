# Faire les modèles de tâches en modifiant du XML (notation HAMSTERS dans draw.io)

## Provenance (à lire d'abord)

Je n'ai retrouvé **aucune conversation Claude Code** qui explique comment utiliser le logiciel HAMSTERS en modifiant son XML : la recherche dans toutes les sessions locales ne donne que le **contenu du cours** (séance 5, M. Winckler). La méthode ci-dessous vient d'un autre document de ton dépôt de cours : `SI5/S9/ergonomie/projet/dreamer/contexte.md` (§1, §8, §9, §10). Il y est écrit que les modèles ont été faits avec **draw.io**, en suivant la **notation HAMSTERS**, et générés par un **script qui produit le XML draw.io**. Si la conversation que tu as en tête était dans Cowork, je n'y ai pas accès.

Je n'ai **pas** de spécification fiable du format de fichier du logiciel HAMSTERS lui-même (outil Java de l'IRIT) : n'attends donc pas de ce guide un fichier ouvrable dans HAMSTERS. Il produit un fichier `.drawio` qui reprend la notation.

Exemple fourni : [exemple-modele-taches.drawio](exemple-modele-taches.drawio) (« Faire une partie », 5 tâches, 2 sous-arbres, balises de territoire). Le XML est bien formé ; **je ne l'ai pas ouvert dans draw.io**, vérifie le rendu avant de t'y fier.

---

## 1. Principe

- Un fichier `.drawio` est du **XML** (`<mxfile>` → `<diagram>` → `<mxGraphModel>` → `<root>` → des `<mxCell>`).
- Une **tâche** est un `mxCell` avec `vertex="1"` ; un **lien** est un `mxCell` avec `edge="1"`, `source` et `target`.
- **Chaque tâche parente** est reliée à un **nœud opérateur** (ovale blanc), lui-même relié à ses sous-tâches, lues de **gauche à droite**.
- Ouvrir le fichier : https://app.diagrams.net → *Fichier → Ouvrir*, ou l'extension draw.io de VS Code. Pour modifier : *Étendre → Modifier le diagramme* affiche le XML, ou éditer le fichier à la main.

## 2. Squelette minimal

```xml
<mxfile host="app.diagrams.net">
  <diagram name="Faire une partie" id="m0">
    <mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" page="1" pageWidth="1600" pageHeight="900">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>

        <!-- tâche parente (abstraite) -->
        <mxCell id="t1" value="Faire une partie" vertex="1" parent="1"
                style="rounded=1;whiteSpace=wrap;html=1;fillColor=#e5e7eb;strokeColor=#4b5563;fontSize=11;">
          <mxGeometry x="300" y="60" width="130" height="56" as="geometry"/>
        </mxCell>
        <!-- opérateur -->
        <mxCell id="o1" value="&gt;&gt;" vertex="1" parent="1"
                style="ellipse;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#111827;fontSize=11;">
          <mxGeometry x="335" y="145" width="60" height="26" as="geometry"/>
        </mxCell>
        <!-- sous-tâche -->
        <mxCell id="t2" value="Se connecter" vertex="1" parent="1"
                style="rounded=1;whiteSpace=wrap;html=1;fillColor=#e5e7eb;strokeColor=#4b5563;fontSize=11;">
          <mxGeometry x="150" y="230" width="130" height="56" as="geometry"/>
        </mxCell>

        <!-- liens orthogonaux, sans flèche -->
        <mxCell id="e1" edge="1" parent="1" source="t1" target="o1"
                style="edgeStyle=elbowEdgeStyle;elbow=vertical;endArrow=none;html=1;">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="e2" edge="1" parent="1" source="o1" target="t2"
                style="edgeStyle=elbowEdgeStyle;elbow=vertical;endArrow=none;html=1;">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```

Règles de saisie XML : échapper `&` en `&amp;`, `<` en `&lt;`, `>` en `&gt;`, les guillemets de l'attribut en `&quot;`. Les opérateurs `>>`, `[>`, `|>` doivent donc être écrits `&gt;&gt;`, `[&gt;`, `|&gt;`. Les `id` sont libres mais **uniques**.

## 3. Types de tâches (couleurs reprises du projet dreamer)

| Type | `fillColor` | `strokeColor` |
|---|---|---|
| Abstraite | `#e5e7eb` | `#4b5563` |
| Interactive : saisie | `#dbeafe` | `#2563eb` |
| Interactive : affichage | `#e0e7ff` | `#4f46e5` |
| Système | `#dcfce7` | `#16a34a` |
| Utilisateur : perception | `#fef3c7` | `#d97706` |
| Utilisateur : cognitive | `#fce7f3` | `#db2777` |
| Sous-routine | `#f3f4f6` | `#4b5563` + `strokeWidth=3` |

Les couleurs sont une adaptation pour la lisibilité ; HAMSTERS distingue les types par des **icônes** (nuage = abstraite, personne + clavier = interactive).

**Marqueurs** (dans le `value`) : `OPT ` + `dashed=1` pour une tâche optionnelle ; `↻ ` pour une itération ; `⤷ ` pour un appel de sous-routine.

## 4. Opérateurs (dans l'ovale)

`>>` séquence · `[]` choix · `[>` désactivation · `|>` interruption · `|||` concurrence · `|=|` ordre indifférent.

## 5. Balises de territoire (spécifique IHM réparties, diapos 44 à 47)

Le cours place, près de chaque tâche, une petite pastille : **Gr** (collective ou compétitive), **Pe** (personnelle), **Pr** (critique, privée). Dans le fichier d'exemple, c'est un `ellipse` de 24 × 24 px posé en haut à gauche de la tâche :

| Territoire | `fillColor` | `strokeColor` |
|---|---|---|
| Gr | `#fde68a` | `#b45309` |
| Pe | `#bfdbfe` | `#1d4ed8` |
| Pr | `#fecaca` | `#b91c1c` |

Une pastille n'a pas de lien : seule sa position la rattache à sa tâche. En cas de déplacement dans draw.io, la déplacer avec elle (ou la grouper).

## 6. Règles de mise en page (celles du projet dreamer)

- Chaque niveau occupe **170 px** de hauteur ; une tâche mesure **130 × 56**, un opérateur **60 × 26**.
- Les feuilles sont placées de **gauche à droite** ; chaque parent est **centré au-dessus de ses enfants**.
- Le titre et la légende sont en haut à gauche.
- Liens : `edgeStyle=elbowEdgeStyle;elbow=vertical;endArrow=none`.

Pour un grand modèle, **générer le XML par script** (une liste d'arbres `(libellé, type, territoire, opérateur, enfants)` ; un parcours calcule la largeur de chaque sous-arbre, place les feuilles puis centre les parents). C'était déjà la méthode du projet dreamer ; je peux t'écrire le script au besoin.

## 7. À modéliser pour Crashout Circuit

Voir [perimetres-et-scenarios.md](perimetres-et-scenarios.md) : **M0** racine, puis M1 à M11 en sous-routines. Chaque feuille doit porter son type de tâche **et** sa balise de territoire, et chaque modèle doit préciser le dispositif où la tâche s'exécute (par exemple dans le libellé ou une légende à côté).
