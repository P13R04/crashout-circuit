# Audio de Crashout Circuit

Tous les extraits distribués dans ce dossier sont sous **CC0 1.0** : https://creativecommons.org/publicdomain/zero/1.0/

- **Kenney — Impact Sounds 1.0** : https://kenney.nl/assets/impact-sounds
  - `metal-light-1.wav` ← `impactMetal_light_000.ogg`
  - `metal-light-2.wav` ← `impactMetal_light_001.ogg`
  - `metal-heavy-1.wav` ← `impactMetal_heavy_000.ogg`
  - `metal-heavy-2.wav` ← `impactMetal_heavy_001.ogg`
  - `metal-place.wav` ← `impactPlate_light_000.ogg`
- **Kenney — Sci-fi Sounds 1.0** : https://kenney.nl/assets/sci-fi-sounds
  - `electric-zap.wav` ← `forceField_000.ogg`
  - `electric-on.wav` ← `forceField_002.ogg`
  - `boost-pass.wav` ← `thrusterFire_002.ogg`
  - `power-off.wav` ← `doorClose_000.ogg`
  - `reactor-loop.wav` ← `engineCircular_000.ogg`
  - `electric-loop.wav` ← `spaceEngineLow_000.ogg`
- **Kenney — RPG Audio** : https://kenney.nl/assets/rpg-audio
  - `sling-release.wav` ← `knifeSlice.ogg` : souffle bref de mouvement, employé pour le lancement. Ce n'est pas un enregistrement d'élastique.
- **yd — Factory ambiance** : https://opengameart.org/content/factory-ambiance
  - `factory-ambience.mp3` ← `Factory.ogg`, extrait de 20 à 60 s, raccord circulaire de 2 s, durée finale 38 s. Nappe industrielle composée, pas une prise de son d'usine.
- **Kistol — Glutton** : https://opengameart.org/content/glutton
  - `glutton-music.mp3` ← `Glutton_0.ogg`, morceau complet de 124 s, raccord circulaire de 2 s, durée finale 122 s. Proposition de musique instrumentale synth/rock industrielle.

Les licences originales des trois packs Kenney sont conservées dans les fichiers `LICENSE-Kenney-*.txt`. Les pages de yd et Kistol indiquent CC0 ; attribution volontaire ci-dessus.

## Traitement des fichiers

Téléchargement depuis les banques officielles le 30 octobre 2026. Aucun extrait n'a été produit par génération audio.

Effets courts : conversion mono PCM 16 bits, 44,1 kHz ; crête ramenée vers −3 dBFS avec amplification plafonnée ; attaques et queues fondues sur 5 ms pour supprimer les clics. Les textures énergétiques sont raccourcies (zap 0,7 s, activation 0,9 s, boost 0,75 s).

Réacteur et bourdonnement : mono PCM 44,1 kHz, raccord circulaire de 120 ms, durée finale 4,88 s. Ambiance et musique : normalisation −20 LUFS, crête vraie −2 dB, encodage MP3 128 kb/s, raccord circulaire de 2 s. Le mixage du jeu les atténue encore.

`sources.json` donne l'auteur, la page source, le nom original, la licence, le traitement, la durée, la taille et l'empreinte SHA-256 de chaque fichier distribué. Les tests vérifient ces empreintes.
