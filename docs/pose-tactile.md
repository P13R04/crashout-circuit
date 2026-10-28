# Pose tactile — briefing et essais

## À dire aux copilotes

« Attendez le signal d’Oz. Posez le tangible en touchant la table avec deux doigts, un de chaque côté. Gardez les deux doigts ensemble un court instant, jusqu’à voir l’effet, puis levez-les. Pour le mur, pincez ses deux grands côtés, à mi-longueur : les doigts encadrent sa largeur de quatre tenons, pas ses extrémités. Pour le pilier, le centre sera entre vos doigts. Avant de le reposer ailleurs, rapportez-le à une station de recharge et prévenez Oz. »

Pendant cette courte pose, l’autre copilote évite de commencer un geste sur la carte. Les pilotes peuvent continuer à conduire ; les pads de réparation restent disponibles.

## Parcours d’Oz

1. Dans `/oz`, sélectionner **Pose tactile**. Le mode est partagé par les clients et reste sélectionné au retour à l’accueil ; un redémarrage du serveur revient au mode manuel.
2. Constater la recharge physique puis cliquer **Mur**, **Pilier 1** ou **Pilier 2** juste avant la pose. Le bouton éclairé et le compte à rebours signalent l’attente ; l’objet n’a encore aucun effet.
3. La table accepte une seule paire neuve et confirme la pose automatiquement. La position reste fixe après le retrait des doigts. L’effet physique et électrique est celui du jeu normal.
4. Lorsque l’objet est enlevé, le cliquer sur la carte Oz. Il disparaît et son bouton redevient disponible. Il faut observer un nouveau passage par une station avant de l’annoncer à nouveau.

**Annuler / Échap** abandonne l’attente sans poser d’objet. Une autre annonce remplace la précédente. L’attente expire après 20 secondes et s’annule en pause, au reset, au changement de mode ou si le dernier Oz/la dernière table se déconnecte. Le retrait des doigts ne retire jamais un objet ; seul le clic d’Oz constate son retrait physique.

## Recette sur la dalle

- Partir de **TEST TANGIBLES**, ou d’une partie normale, puis passer en plein écran. Faire une pose avant le départ et une autre pendant la course.
- Tenir le mur par sa largeur : vérifier le milieu et l’angle, puis inverser l’ordre des deux contacts. La taille affichée ne doit pas suivre l’écartement des doigts.
- Refaire avec chaque pilier, puis les deux à portée. Vérifier champs, arc, ralentissement, dégâts sur les deux voitures et disparition immédiate de l’effet au retrait signalé par Oz.
- Annoncer alors qu’un doigt est déjà posé : il ne doit pas être utilisé. Lever et reposer les deux doigts. Essayer un troisième contact libre, une annulation et une attente expirée : aucune pose ni bonus ne doit partir.
- Avec un boost ou lance-pierre armé, annoncer une pose : ses contacts ne doivent ni consommer le bonus ni déformer la piste. Après la pose, refaire un geste neuf ; le fonctionnement normal reprend.
- Vérifier que les pads et le pilotage continuent pendant l’attente ; tester le retour au placement manuel sans déplacer les objets déjà posés.
- Refaire la pose dans les deux thèmes. Tester une perte de Wi-Fi pendant l’attente ; une reconnexion ne doit pas poser un ancien objet.

La confirmation attend 90 ms après une paire valide, sans être repoussée indéfiniment par de petits tremblements. L’écartement accepté correspond à 20–140 mm sur l’image active de la table configurée (55 pouces par défaut). Le test souris utilise deux clics successifs ; les tests automatisés utilisent aussi deux vrais événements tactiles simultanés simulés. La cadence, le rejet des paumes et la précision restent à évaluer avec le matériel réel.

`npm run verify` inclut dix scénarios dédiés, les échanges réseau entre table et Oz et les aperçus dans les deux thèmes, en plus des suites existantes.
