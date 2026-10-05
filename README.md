# Crashout Circuit

Espace principal du projet **Crashout Circuit**. La racine est volontairement réservée aux futures versions intégrées et à la documentation commune.

## Contenu actuel

- [`prototypes/piste-vivante`](prototypes/piste-vivante) : prototype web de recherche. Il documente et visualise les interactions de course, les rôles sur table multitouch, le tracé coopératif, les obstacles et la maquette de table.

## Démarrer le prototype

```bash
cd prototypes/piste-vivante
npm install
npm run dev -- --port 3000
```

Le prototype reste isolé afin que les futures IA et les futures implémentations puissent s’en servir comme référence sans hériter de son architecture expérimentale.
