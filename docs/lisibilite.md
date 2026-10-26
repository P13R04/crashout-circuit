# Audit de lisibilité — issues #26 et #35

Relecture du 26 octobre 2026. Périmètre : `Renderer.ts`, `HUD.ts`, `main.ts`, `view.ts`, `GestureRecognizer.ts`, les deux pages HTML, `client-oz/`, README et contexte. Le critère est d’expliquer l’état et la prochaine action avec peu de lecture, depuis la place de chaque joueur.

## Inventaire et décisions

| Écran / source | Chaînes ou famille de chaînes | Décision et représentation actuelle |
|---|---|---|
| Accueil / Renderer | CRASHOUT, CIRCUIT | Garder l’identité, orientée vers les deux grands bords. |
| Accueil | Longues explications des rôles, JOUER SUR TABLE, MODE PC SÉQUENTIEL | Remplacer par pictogrammes tactile/souris et les seuls noms TABLE / PC. |
| Création du circuit | Placez P1 / P2, Reliez les deux points, Créer le circuit, Validation… | Garder une seule consigne courte par étape, accompagnée d’une frise à pictogrammes et du code couleur actif. |
| Création du circuit | DÉPART, ARRIVÉE, RELÂCHEZ ICI, RELIÉ, POINT CYAN | Remplacer les sous-titres des ancres par toucher, drapeau ou coche. Garder seulement P1 / P2 comme repères. |
| Création du circuit | Répétitions de validation et « équipe rose à vous » | Supprimer les messages de succès ; la frise et le changement d’équipe les remplacent. |
| Création / erreurs | Éloignez P2, Restez dans la zone pointillée, Partez de P1/P2, Rejoignez P1/P2, Restez dans votre zone, Le cyan trace en premier, Tracé cyan/rose déjà validé, Contact interrompu. Recommencez, Reliez les deux points, Terminez le tracé en cours | Garder les refus utiles, courts et temporaires. Ils indiquent comment corriger l’action ; ne pas les remplacer par une icône ambiguë. |
| Course / HUD | PILOTE, COPILOTE | Garder les noms de rôle courts ; retirer le nom d’équipe redondant avec les couleurs. Chaque panneau est orienté vers son joueur. |
| Pilotage | DIRECTION GLISSEZ, CONDUITE, POWER AU COPILOTE, ACCÉLÉRER | Retirer les explications ; volant, extrémités directionnelles, retour tactile immédiat et pictogramme de pédale. |
| Santé / tours | HP, nombres et tours | Retirer HP ; cœur et valeur numérique. Drapeau et fraction de tours dans chaque panneau pilote. |
| Copilote | POWER, Objet en stock | Remplacer par le symbole Power et l’icône du stock reliée visuellement au bouton. |
| Objet armé | Texte « 3 doigts / 2 doigts », secondes, VOLABLE | Contacts dessinés, anneau de durée et halo doré neutre. Les deux équipes peuvent réaliser le geste. |
| Dock tangible | TANGIBLE, DÉPOSER ICI, ACTIVÉ, INACTIF, activation par Oz, replacer sur piste, IDs | Empreintes mur/pilier, contour du dock et états lumineux. Pas d’instruction technique destinée à l’opérateur sur la table. |
| Réparation | RÉPARATION, maintenez, pad à 2, HORS D’USAGE | Clé, deux témoins représentant les partenaires, anneau de progression, halo de panne et alerte locale. |
| Course / Renderer | PAUSE, REPRENDRE, RESET | Icônes pause, lecture et accueil. La reprise centrale possède une vraie zone tactile, vérifiée par les tests. |
| Mode de conduite | AUTO, PÉDALE | Garder le nom court avec le pictogramme ; la différence de fonctionnement doit rester explicite. |
| Temps / départ | Chronomètre, compte à rebours géant | Temps partagé orienté vers les deux bords. Départ par trois feux plutôt que chiffres géants. |
| Impacts | TOUCHÉ, POW, BAM, BOUM, AÏE, KO | Remplacer par étincelles et impacts locaux ; plus de mots qui recouvrent la course. |
| Résultat | Égalité, tours, nom du vainqueur et longues instructions | Garder Égalité si nécessaire, chiffres et cartes orientées ; trophée à la couleur gagnante et bouton de rejouabilité à pictogramme. |
| Piste de secours | Circuit de secours | Garder : ce court signal prévient d’une génération de repli. |
| État réseau / main et HTML | Connecté, Phase:…, Connexion…, Connexion perdue · Reconnexion… | Supprimer les annonces de fonctionnement normal. Afficher seulement attente initiale et perte de connexion. |
| Paramètres / HTML, main, themes | Paramètres, Ambiance, Néon, Ferraille, descriptions courtes | Garder les noms et nuanciers dans le tiroir fermé par défaut ; choix actif visible et conservé après recharge. |
| Test PC / HTML, GestureRecognizer | Lance-pierre, Boost, Invincibles, Objets libres, aide séquentielle de souris | Garder uniquement dans le tiroir et selon le mode. L’aide de simulation n’est visible que pendant le geste de test concerné. |
| Diagnostic / main | FPS, rendu, RTT, latence et contacts | Garder uniquement sur demande F3 ; absent de l’expérience de jeu normale. |
| Console Oz / HTML | Tangibles, Type, Équipe, Mur, Pilier électrique, Cyan, Rose, Activer/Désactiver, Zone copilote, Retirer | Garder : commandes opérateur précises, sur un écran séparé. Aucun contrôle de bonus, lancement ou pause n’est ajouté. |
| Console Oz / main et OzMap | #ID, type, équipe, état actif, repères 1/2 du mur | Garder les références nécessaires pour sélectionner, identifier et tourner le bon objet. État actif par point lumineux, description accessible conservée. |
| Console Oz / HTML | Clic : placer · glisser : déplacer · poignée 2 : tourner autour de 1 | Garder cette unique ligne compacte pour l’opérateur ; pas de répétition dans chaque carte. |
| Console Oz / main | Connecté, Déconnecté · reconnexion…, En attente du circuit | Garder : l’opérateur doit distinguer l’absence de piste d’une panne de réseau. |
| Console Oz / erreurs | Connexion et circuit requis, Gardez le tangible dans la surface de jeu | Garder le motif du refus, affiché seulement quand nécessaire. |
| HTML / accessibilité | aria-label, titres, rôle des contrôles, aria-pressed | Garder les descriptions accessibles. Un pictogramme visible ne justifie pas de retirer le nom destiné au lecteur d’écran. |
| README et context.md | Règles, commandes, disposition et thèmes | Documentation longue hors jeu. Mettre à jour les coins diagonaux, l’interface actuelle, les thèmes et les parcours de test ; identifier les propositions historiques. |

## Orientation et contraste

- Les quatre postes suivent `PANELS` : cyan pilote bas-gauche / copilote haut-droite ; rose pilote haut-gauche / copilote bas-droite. Même géométrie pour les contacts, docks et retours locaux.
- Les informations communes indispensables sont répétées vers les deux grands bords. Les pictogrammes neutres de la zone centrale partagent une seule surface.
- Les panneaux ont un fond opaque. La piste reste plus claire et plus contrastée que le vide. Les structures, pressions, engrenages et vapeurs passent sous le tablier ; aucune vapeur de décor ne masque une voiture.
- Les halos d’état actifs restent locaux ; les couleurs cyan/rose identifient les équipes, le doré identifie les gestes armés neutres et les boosts. Le cyan ambiant de Ferraille n’attribue pas une propriété à un décor.
- Les jonctions de circuit sont ouvertes et les limites de route suivent la géométrie de collision. Une mise en pause fige aussi les retours visuels.

## Vérification avant publication

Types, compilation, 63 tests d’acceptation, 14 tests de gestes, 17 tests de rendu et scénario réseau réel. Contrôles spécifiques : reprise centrale, attribution diagonale, changement de thème, chute/réparation, géométrie finale d’une déformation, pause et préférence de mouvement réduit.

Les contrôles en navigateur portent sur accueil, étapes de carte, course, pause, résultat, paramètres et console Oz. Les thèmes ont aussi été observés en mouvement sur une scène isolée, avec capture de la pause et du mode réduit. Le test avec des joueurs novices sur la dalle, notamment la compréhension de POWER, des deux pads et du dock sans lecture des règles, reste à réaliser ; il ne peut pas être déduit des seuls tests automatisés.
