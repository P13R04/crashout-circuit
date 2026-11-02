/**
 * Conserve un utilitaire de journal et de relecture pour les tests ; le téléchargement actuel passe par
 * client-oz/main.ts et /api/oz-log ; cette classe n’est pas instanciée par la console actuelle.
 */
/** Décrit une commande opérateur horodatée avec ses paramètres. */
export interface OzLogEntry {
  t: number;                       // ms since epoch
  type: string;                    // protocol message type, or 'ReactionTime'
  params: Record<string, unknown>; // the message payload without `type` and `t`
}

/** Conserve un utilitaire de journal et de relecture pour les tests ; le téléchargement actuel passe par main.ts et le journal serveur. */
export class OzLog {
  readonly entries: OzLogEntry[] = [];
  private replayTimers: ReturnType<typeof setTimeout>[] = [];
  private onChange: (() => void) | null = null;

  /** Branche la notification de mise à jour du journal sur le lecteur souhaité. */
  subscribe(fn: () => void): void { this.onChange = fn; }

  /** Ajoute une commande horodatée puis avertit le lecteur du journal. */
  record(type: string, params: Record<string, unknown>, t = Date.now()): void {
    this.entries.push({ t, type, params });
    this.onChange?.();
  }

  /** Présente les dernières commandes du journal sous forme de lignes lisibles. */
  tail(n = 50): string[] {
    return this.entries.slice(-n).map(/* Formate l’heure, la commande et ses paramètres pour la liste des événements récents. */ (e) => {
      const d = new Date(e.t);
      const ts = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
      const kv = Object.entries(e.params)
        .map(/* Présente chaque paramètre avec des nombres arrondis et des valeurs lisibles. */ ([k, v]) => `${k}=${typeof v === 'number' ? Math.round(v * 1000) / 1000 : JSON.stringify(v)}`)
        .join(' ');
      return `${ts}  ${e.type}  ${kv}`;
    });
  }

  /** Sérialise le journal complet pour sa sauvegarde ou sa relecture. */
  exportJson(): string {
    return JSON.stringify(this.entries, null, 2);
  }

  /** Télécharge le journal local dans un fichier JSON. */
  download(filename = `oz-log-${new Date().toISOString().replace(/[:.]/g, '-')}.json`): void {
    const blob = new Blob([this.exportJson()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    /** Libère l’adresse temporaire du fichier une fois le téléchargement lancé. */
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /** Lit un journal JSON et conserve seulement les entrées dont les champs sont valides. */
  static parse(json: string): OzLogEntry[] {
    const data = JSON.parse(json) as unknown;
    if (!Array.isArray(data)) throw new Error('journal: tableau attendu');
    return data.map(/* Valide les champs d’une entrée relue avant de l’accepter dans le journal. */ (e) => {
      if (typeof e?.t !== 'number' || typeof e?.type !== 'string') throw new Error('journal: entrée invalide');
      return { t: e.t, type: e.type, params: (e.params ?? {}) as Record<string, unknown> };
    });
  }

  /**
   * Reprogramme les commandes enregistrées en conservant leurs écarts de temps.
   * Les entrées gardent leurs délais d’origine ; emit reçoit le message sans horodatage t et les entrées ReactionTime sont ignorées.
   */
  replay(entries: OzLogEntry[], emit: (type: string, params: Record<string, unknown>) => void, onDone?: () => void): void {
    this.stopReplay();
    const playable = entries.filter(/* Écarte les mesures de réaction qui ne sont pas des commandes rejouables. */ (e) => e.type !== 'ReactionTime');
    if (playable.length === 0) { onDone?.(); return; }
    const t0 = playable[0].t;
    for (const e of playable) {
      this.replayTimers.push(setTimeout(/* Réémet la commande enregistrée à son décalage de temps d’origine. */ () => emit(e.type, e.params), e.t - t0));
    }
    this.replayTimers.push(setTimeout(/* Signale que la dernière commande du journal a été rejouée. */ () => onDone?.(), playable[playable.length - 1].t - t0 + 50));
  }

  /** Annule les commandes différées d’une relecture encore en cours. */
  stopReplay(): void {
    this.replayTimers.forEach(clearTimeout);
    this.replayTimers = [];
  }
}
