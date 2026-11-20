/**
 * Suit la confirmation d'une commande ponctuelle sur l'écran copilote.
 * Liens : CopilotScreen.ts, TangibleCards.ts.
 */
import type { GameState } from '../../server/types.js';

const CONFIRMATION_MS = 1_000;

export class CopilotAction {
  private confirm: ((state: GameState) => boolean) | null = null;
  private timeout: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly refresh: () => void) {}

  /** Indique si une commande attend encore un état serveur correspondant. */
  get waiting(): boolean { return this.confirm !== null; }

  /** Envoie une commande, puis retire l'attente si le serveur ne répond pas à temps. */
  run(send: () => void, confirm: (state: GameState) => boolean): void {
    if (this.waiting) return;
    this.confirm = confirm;
    this.timeout = setTimeout(() => {
      this.clear();
      this.refresh();
    }, CONFIRMATION_MS);
    send();
    this.refresh();
  }

  /** Termine l'attente à la confirmation ou à la suspension des commandes. */
  update(state: GameState, enabled: boolean): void {
    if (this.confirm && (!enabled || this.confirm(state))) this.clear();
  }

  /** Libère le délai et ignore toute confirmation attendue. */
  clear(): void {
    clearTimeout(this.timeout);
    this.timeout = undefined;
    this.confirm = null;
  }
}
