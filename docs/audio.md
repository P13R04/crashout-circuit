# Direction sonore et inventaire — Ferraille

Le son doit rendre les actions compréhensibles autour de la table, tout en laissant les joueurs se parler. L'identité retenue associe **acier récupéré, réacteurs compacts, énergie électrique et signaux de tableau de bord**. Les événements gardent les mêmes codes sonores dans les cinq thèmes ; le moteur de réacteur est limité à Ferraille/Néon et l'ambiance musicale industrielle à Ferraille.

## État du dépôt intégré

Les travaux de Quentin #37, #38, #39 et #40 ont été récupérés : commande `check` et CI ; réglage des gestes par URL et export F4 ; lance-pierre à 50 PV et étourdissement de 1,5 s ; fiches et journal de tests extérieurs. Le conflit des scripts de `package.json` est résolu en conservant les deux ajouts. Le test des dégâts neutres utilise maintenant les dégâts configurés, plutôt que l'ancienne hypothèse de destruction en un impact.

## Sons fonctionnels dans cette version

| Interaction / état | Son | Technique | Déclenchement et limite |
|---|---|---|---|
| Bouton, POWER appuyé, premier appui de réparation | Clic bref et doux | Triangle, 35 ms | Un clic par action ; aucun clic pour les déplacements de doigts ou le maintien de direction |
| Mode choisi / création de circuit | Deux notes de confirmation | Sinus | Transition confirmée |
| Tracé accepté | Accord court montant | Sinus | Réponse serveur |
| Geste ou tracé refusé | Deux notes graves | Sinus | Réponse serveur, limitation des répétitions |
| Circuit prêt | Deux notes | Sinus | Passage en READY |
| Départ | Trois bips identiques, puis GO plus haut et plus long | Triangle | Suit `sessionStartAt` ; pas de décompte rejoué à la reconnexion |
| Pause / reprise | Deux notes descendantes / montantes | Sinus | Arrête les boucles et les sons planifiés ; reprise sans rattraper les anciens bips |
| Objet ramassé | Deux notes aiguës | Sinus | Serveur, différencié de l'armement |
| Bonus armé / geste attendu | Trois notes montantes | Sinus | `itemArmed` confirmé ; pas de boucle permanente |
| Lance-pierre en traction | Petit indicateur de hauteur proportionnelle à la tension | Sinus très faible | Une seule source ; ce signal électronique ne cherche pas à imiter un élastique |
| Traction valide | Double confirmation brève | Sinus | Une fois au franchissement du seuil |
| Traction annulée / insuffisante | Note descendante | Sinus | Stock conservé ; aucun faux impact |
| Lance-pierre lancé | Souffle de mouvement | Extrait Kenney RPG Audio | Tir confirmé ; un véritable claquement d'élastique serait une amélioration |
| Danger avant impact | Trois bips brefs | Sinus | Télégraphe serveur de la pierre ; arrêt des bips restants en pause |
| Choc contre un mur | Petit choc métallique, deux variantes | Extraits Kenney Impact Sounds | Source située doucement en stéréo ; coalescence des impacts simultanés |
| Impact de pierre | Choc métallique plus grave, deux variantes | Extraits Kenney Impact Sounds | Un impact principal, même si les deux voitures sont touchées ; pas d'explosion militaire |
| Dégâts électriques | Zap distinct d'un choc métallique | Extrait Kenney Sci-fi Sounds | Les vrais dégâts des champs / arcs émettent `electricHit` ; règles physiques inchangées |
| Sortie de piste | Petit signal descendant | Sinus | Signale la chute sans fabriquer un bruit physique complexe |
| Santé faible | Double note grave | Sinus | Au passage sous 30 PV, pas une alarme en continu |
| Véhicule hors d'usage | Trois notes descendantes | Sinus | Distinct de l'impact ; moteur coupé |
| Réparation coopérative commencée | Double note douce | Sinus | Quand la progression réelle commence |
| Progression de réparation | Petit tic par quart de progression | Sinus | Pas de fausse boucle de machine |
| Réparation interrompue | Note descendante discrète | Sinus | S'arrête dès que la coopération est interrompue |
| Réparation terminée | Trois notes de confirmation | Sinus | Réponse serveur |
| Redémarrage après réparation | Même grammaire trois bips + GO que le départ | Triangle | Suit le feu de la voiture ; pause respecte le temps restant |
| Tangible attendu par Oz | Double note discrète | Sinus | Nouvelle annonce / nouveau jeton ; aucun son sur chaque contact |
| Attente de tangible annulée | Petit signal descendant | Sinus | Pas joué à la place d'une pose réussie |
| Mur ou pilier posé / activé | Claquement de plaque | Extrait Kenney Impact Sounds | État confirmé sur la table ; les mouvements répétés sont limités par le suivi existant |
| Mur ou pilier retiré / désactivé | Coupure mécanique | Extrait Kenney Sci-fi Sounds | État confirmé ; un changement de forme n'est pas un nouveau bonus |
| Arc créé | Mise sous tension | Extrait Kenney Sci-fi Sounds | Prioritaire sur deux petits sons de pose simultanés |
| Arc interrompu | Coupure plus grave | Extrait Kenney Sci-fi Sounds | Un son de rupture, pas un son par segment dessiné |
| Champ électrique actif | Ronflement énergétique très faible | Boucle Kenney Sci-fi Sounds | Une seule boucle pour l'ensemble des champs, pas une source par particule |
| Boost posé | Montée électronique courte | Sinus | Différente du passage d'une voiture |
| Voiture accélérée par le boost | Souffle de propulseur | Extrait Kenney Sci-fi Sounds | Réponse serveur, jamais à chaque image dans la zone |
| Piste déformée | Bref signal élastique électronique | Sinus | Au plus une confirmation toutes les 0,8 s, pas à chaque point déplacé |
| Moteurs Ferraille/Néon | Réacteurs de récupération | Boucle Kenney Sci-fi Sounds | Deux sources maximum ; volume et hauteur suivent la vitesse ; arrêt en panne, attente de respawn et pause |
| Tour terminé | Deux notes | Sinus | Les checkpoints intermédiaires restent silencieux |
| Dernier tour | Trois notes plus hautes | Sinus | Entrée dans le dernier tour ; différent de la victoire |
| Fin de course | Accord montant plus long | Sinus | Une seule annonce globale ; le visuel désigne le vainqueur |
| Étape de tutoriel terminée | Double confirmation | Sinus | Validation réelle de la leçon |
| Ambiance Ferraille | Nappe industrielle / usine abandonnée | **Factory ambiance — yd**, extrait de 38 s | Boucle discrète, indépendante des effets et de la musique |
| Musique Ferraille | Instrumental synth/rock industriel | **Glutton — Kistol**, 122 s | Proposition initiale, bas volume, indépendante ; pas de voix ajoutée |

Les anciens bonus fantôme / destruction conservent leurs retours de compatibilité, sans ajouter de sons à rechercher pour des actions absentes de l'interface actuelle.

## Sons qui gagneraient à être enregistrés ou téléchargés spécialement

L'intégration actuelle est utilisable, mais ces textures demandent une vraie sélection à l'oreille. Elles ne sont pas simulées par une accumulation de bruit blanc ou de dents de scie.

| Priorité | À chercher | Cahier des charges / mots-clés | Remplacement ou ajout prévu |
|---|---|---|---|
| Haute | Élastique de lance-pierre | `slingshot draw`, `rubber band stretch`, `slingshot release`, `rubber twang` ; traction 0,5–2 s, claquement 100–300 ms, pas d'arc médiéval gigantesque | Ajouter la texture à la traction, remplacer le souffle générique du lancement |
| Haute | Moteur de récupération plus spécifique | `electric motor load loop`, `small turbine loop`, `custom engine idle acceleration`, sans parole, deux régimes raccordables | Améliorer le réacteur de banque ; moteur thermique séparé pour F1/Mayhem et moteur miniature pour Toy |
| Haute | Ferraille qui se tord | `metal stress creak`, `sheet metal bend short`, `metal cable tension` ; 0,3–1 s | Donner une matière à la déformation / au retour de piste, garder le signal de validation très faible |
| Moyenne | Réparation mécanique | `ratchet wrench`, `pneumatic tool short`, `servo repair loop` ; 1–2 s, sans coups trop agressifs | Texture uniquement pendant la coopération, arrêt instantané à l'interruption |
| Moyenne | Dangers électriques plus concrets | `tesla arc short`, `electric crackle loop`, `high voltage discharge` ; peu de graves, zap bref | Personnaliser les effets sci-fi génériques, sans bourdonnement envahissant |
| Moyenne | Dérapage et frottement | `tire scrub short`, `metal scrape short` ; mono, variantes 0,2–0,6 s | Seulement si un glissement ou un frottement réel est détecté ; pas sur chaque virage |
| Moyenne | Presses, engrenages et vapeur du décor | `hydraulic press cycle`, `gear clunk`, `steam vent short`, `industrial workshop ambience` | Accent ponctuel proche d'une machine visible ; 1–2 accents simultanés maximum, mix d'ambiance très faible |
| Optionnelle | Musique plus caractéristique de Crashout | `industrial breakbeat instrumental loop`, `dark electro racing loop`, `scrapyard percussion`, 110–140 BPM, sans chant ; intro/course/sortie raccordables | Remplacer ou compléter Glutton après écoute collective sur table |

Banques accessibles : Kenney pour la base CC0 ; OpenGameArt avec vérification de la licence de **chaque** morceau ; BigSoundBank pour des prises de son d'atelier. Un extrait de Freesound peut aussi convenir si sa licence autorise l'intégration et la redistribution. Les morceaux commerciaux ou les vidéos YouTube ne sont pas utilisés comme sources audio par défaut.

## Réglages et robustesse

**Paramètres → Audio** : bouton activé/coupé, trois volumes (effets, ambiance, musique), bouton Tester. Préférence locale mémorisée ; aucun texte supplémentaire sur la piste. Volume initial : effets 70 %, ambiance 22 %, musique 12 %, encore atténués par le mix interne. La console Oz ne joue pas une seconde copie de la course.

L'audio se déverrouille sur un vrai contact ou une touche, avec nouvelle tentative si le navigateur refuse la première fois. Les fichiers courts sont décodés une fois ; la musique est lue en flux. Les fichiers sont servis depuis l'application, sans connexion aux banques pendant la partie. Le serveur gère les plages d'octets pour la lecture et la répétition de la musique.

Le mix possède un limiteur, une atténuation de l'ambiance/musique lors des signaux prioritaires, une limite de 14 sons ponctuels, une seule source de tension, deux réacteurs et une boucle électrique maximum. Les bruits décoratifs ne sont pas déclenchés à chaque animation visuelle. La stéréo reste légère pour que les sons soient entendus des deux côtés de la table.

Pause, perte de connexion, onglet masqué et mise en sourdine arrêtent les sources. Le retour ne rejoue pas les anciens décomptes. Un fichier manquant ne bloque jamais le jeu ni les signaux électroniques restants.

## Sources et contrôle

Les **14 extraits** et leurs empreintes sont dans `client-table/audio/sources.json` ; crédits et licences dans `client-table/audio/CREDITS.md`. Ces fichiers sont des extraits téléchargés puis convertis/normalisés, pas des effets complexes recréés en code. Les signaux élémentaires sont des sinus et triangles avec enveloppes douces.

Les tests audio vérifient décomptes, pause/reprise, état de réparation, annulation Oz, limitation des sons, arrêt des sources, fichier manquant, intégrité/licences et vraie collision électrique. Le navigateur a décodé les 13 buffers courts et d'ambiance sans erreur ; la musique en flux, la pause, la reprise et la sourdine ont été vérifiées sur une page isolée à très faible volume. Les réponses audio partielles du serveur de production ont aussi été vérifiées. L'écoute artistique finale et les volumes à distance nécessitent la table et ses enceintes.

## Parcours d'essai court

1. Choisir Ferraille, ouvrir Audio et appuyer sur Tester. Couper puis réactiver ; recharger pour vérifier la mémorisation.
2. Lancer le test des tangibles : écouter les trois bips et GO ; augmenter/abaisser indépendamment musique et ambiance.
3. Poser un mur, un pilier puis son voisin : placement, activation, arc et rupture doivent être différents. Faire passer les deux voitures : choc métallique contre le mur, zap sur le champ/arc.
4. Ramasser et armer un bonus ; tirer un lance-pierre, créer un boost puis le traverser. Un seul bruit d'impact principal doit rester lisible quand les deux voitures sont touchées.
5. Réparer : début/progression, interruption, réussite, puis décompte local de redémarrage. Les moteurs restent coupés pendant la panne et l'attente.
6. Mettre en pause au milieu d'un décompte et d'un tir. Masquer l'onglet et couper le Wi-Fi : aucune boucle ne doit continuer ; le retour ne doit pas rejouer tous les signaux manqués.
7. Faire un tour et finir une course : pas de bips à chacun des huit checkpoints, un signal par tour, puis une fin globale.
