# Rôles et flux de la v1 spectateur

Les commandes détaillées du jeu figurent dans `server/protocol/messages.ts` et passent par les filtres de rôle de `server/net/GameServer.ts`, `tableCommands.ts`, `playerCommands.ts` et `ozCommands.ts`.

| Interface | Vers le serveur | Depuis le serveur |
| --- | --- | --- |
| Table | WebSocket, préparation et départ, réglages, thème, gestes et commandes des postes libres. | État de jeu, phase, retours d’action, horloge. |
| Oz | WebSocket, pose et activation des tangibles selon le mode de jeu. | État de jeu, phase, retours d’action, horloge. |
| Pilote | WebSocket, réservation et reprise de sa place, braquage, accélération, mode de conduite, appui de réparation. Départ solo en séance de test. | État de jeu, phase, retours d’action, horloge, réponse privée de réservation. |
| Copilote | WebSocket, réservation et reprise de sa place, actions de copilote autorisées par la session. | État de jeu, phase, retours d’action, horloge, réponse privée de réservation. |
| Spectateur | Requête GET sur le flux SSE avec le code de séance. Le cadrage se règle dans le navigateur. | État réduit pour la course, phase, résultat. La piste complète est envoyée à l’arrivée, à la reconnexion et à chaque nouvelle version. |

Le QR commun ouvre la page du salon. **Regarder** ouvre la vue spectateur et **Jouer** permet de réserver une place. Le spectateur ne prend pas de place. Pour jouer, il doit repasser par le parcours de réservation. La v1 locale limite le flux à huit connexions spectateur simultanées et rejette les connexions au-delà. Le navigateur renouvelle la connexion après une coupure, sauf refus d’un code de séance invalide.

Le flux réduit fournit la phase, le thème, la géométrie, les voitures et les objets visibles. Il omet les jetons, noms des joueurs, entrées, stocks, demandes de pose et réglages internes. Quand le spectateur est activé, les WebSockets de contrôle table et Oz exigent un accès hôte initialisé avec le lien privé affiché dans Terminal.
