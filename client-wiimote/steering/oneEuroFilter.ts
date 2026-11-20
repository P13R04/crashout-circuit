/**
 * Filtre adaptatif « 1 € » : lisse beaucoup au repos, presque pas pendant un mouvement rapide.
 * Liens : client-wiimote/steering/wiimoteSteering.ts. Référence : Casiez, Roussel, Vogel, CHI 2012.
 * Module pur : le pas de temps est fourni par l'appelant. Remplace le passe-bas fixe et le lissage de direction, qui
 * ajoutaient du retard à chaque geste pour masquer le tremblement de la main et la quantification de l'accéléromètre.
 */

/** Part de l'écart rattrapée en un pas de `dt` secondes pour une fréquence de coupure donnée. */
function smoothingFactor(cutoffHz: number, dt: number): number {
  return 1 / (1 + 1 / (2 * Math.PI * cutoffHz) / dt);
}

export class OneEuroFilter {
  private value: number | null = null;
  private speed = 0;

  /**
   * @param minCutoffHz fréquence de coupure au repos : plus elle est basse, plus le tremblement est effacé ;
   * @param beta gain de la vitesse : plus il est haut, moins un geste rapide est retardé ;
   * @param speedCutoffHz fréquence de coupure du calcul de vitesse.
   */
  constructor(
    private readonly minCutoffHz = 1,
    private readonly beta = .05,
    private readonly speedCutoffHz = 5,
  ) {}

  /** Oublie l'historique : la prochaine valeur est renvoyée telle quelle. */
  reset(): void {
    this.value = null;
    this.speed = 0;
  }

  /** Filtre une valeur reçue `dt` secondes après la précédente. */
  filter(input: number, dt: number): number {
    if (this.value === null) {
      this.value = input;
      return input;
    }
    this.speed += ((input - this.value) / dt - this.speed) * smoothingFactor(this.speedCutoffHz, dt);
    const cutoff = this.minCutoffHz + this.beta * Math.abs(this.speed);
    this.value += (input - this.value) * smoothingFactor(cutoff, dt);
    return this.value;
  }
}
