/**
 * Compose le message affiché au démarrage : une seule adresse principale, puis les remarques utiles.
 * Liens : server/index.ts, server/net/sessionHttp.ts.
 */

export interface BannerOptions {
  port: number;
  protocol: 'http' | 'https';
  /** Adresses joignables par les autres appareils, la plus probable en premier. */
  baseUrls: string[];
  secure: boolean;
  room: string;
  spectators: boolean;
  developerTools: boolean;
  soloTest: boolean;
  lapsToWin: number;
  physicsHz: number;
  /** Ajoute au besoin la clé privée de l'hôte à l'adresse de la table et de la console Oz. */
  hostUrl: (base: string, path?: string) => string;
}

/** Aligne un libellé et sa valeur sur deux colonnes. */
function row(label: string, value: string): string {
  return `   ${`${label}:`.padEnd(13)}${value}`;
}

/** Construit les lignes affichées une fois le serveur lancé. */
export function startupLines(options: BannerOptions): string[] {
  const { port, protocol, baseUrls, room } = options;
  const [main, ...others] = baseUrls;
  const lines = ['', '🏎  Crashout Circuit : serveur lancé', row('Local', options.hostUrl(`${protocol}://localhost:${port}`))];
  if (main) {
    lines.push(
      row('Oz', options.hostUrl(main, '/oz')),
      row('Joueurs', `${main}/play?room=${room}`),
      ...(options.spectators ? [row('Spectateurs', `${main}/watch?room=${room}`)] : []),
    );
    if (others.length) lines.push(row('Autres', others.join(' · ')));
  } else {
    lines.push(row('Réseau', 'aucune adresse trouvée : connectez la table à un réseau local'));
  }
  if (options.soloTest) lines.push(row('Solo', 'scannez le QR sur la table.'));
  if (options.soloTest && options.developerTools) lines.push(row('Pilote PC', `${protocol}://localhost:${port}/play?room=${room}&keyboard=1`));
  if (!options.secure) lines.push('   ⚠ HTTP : capteurs iOS indisponibles. Utilisez une adresse HTTPS pour jouer au gyroscope.');
  lines.push(row('Outils', options.developerTools ? 'de test activés' : 'de test désactivés'));
  lines.push(row('Config', `lapsToWin=${options.lapsToWin}, physicsHz=${options.physicsHz}`), '');
  return lines;
}
