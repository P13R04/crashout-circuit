/** Anime le circuit sur le téléphone et affiche l'état du pilote. */
import type { GameState, Team } from '../../../server/types.js';
import { actionButton } from '../../ui/press.js';
import { PeripheralView } from './PeripheralView.js';
import { RaceFrames } from '../../../client-shared/raceMap/raceFrames.js';
import { SceneSlot } from '../../../client-shared/race3d/SceneSlot.js';

type PilotView = 'map' | 'cockpit' | 'chase';
const nextView: Record<PilotView, PilotView> = { map: 'cockpit', cockpit: 'chase', chase: 'map' };
const viewLabel: Record<PilotView, string> = { map: 'Périphérique', cockpit: 'Cockpit', chase: 'Poursuite' };

export class PilotViewport {
  readonly root = document.createElement('section');
  private readonly canvas = document.createElement('canvas');
  private readonly context = this.canvas.getContext('2d')!;
  private readonly scene = new SceneSlot(() => {
    this.switchView('map');
    this.view.disabled = true;
    this.view.textContent = 'Vue 2D · WebGL indisponible';
  });
  private readonly view = actionButton('Vue · Périphérique', () => this.switchView(nextView[this.mode]));
  private mode: PilotView = 'map';
  private readonly mapOptions = document.createElement('div');
  private readonly info = document.createElement('div');
  private readonly hp = document.createElement('progress');
  private readonly status = document.createElement('p');
  private readonly frames = new RaceFrames();
  private readonly peripheral = new PeripheralView();
  private raf = 0;
  private state: GameState | null = null;
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  constructor(private readonly team: Team, private readonly now: () => number) {
    this.root.className = 'pilot-viewport';
    this.canvas.setAttribute('aria-label', 'Circuit vu de dessus');
    const framing = actionButton('Circuit entier', () => {
      this.peripheral.whole = !this.peripheral.whole;
      framing.setAttribute('aria-pressed', String(this.peripheral.whole));
      heading.disabled = this.peripheral.whole;
    });
    const heading = actionButton('Cap en haut', () => {
      this.peripheral.headingUp = !this.peripheral.headingUp;
      heading.setAttribute('aria-pressed', String(this.peripheral.headingUp));
    });
    for (const button of [framing, heading]) button.setAttribute('aria-pressed', 'false');
    this.mapOptions.className = 'view-controls';
    this.mapOptions.append(framing, heading);
    this.view.setAttribute('aria-live', 'polite');
    this.info.className = 'pilot-race-info';
    this.hp.setAttribute('aria-label', 'Santé de la voiture');
    this.status.className = 'detail';
    this.status.setAttribute('role', 'status');
    const hud = document.createElement('div');
    hud.className = 'pilot-hud';
    hud.append(this.info, this.hp, this.view, this.mapOptions);
    this.status.classList.add('pilot-race-status');
    this.root.append(this.canvas, this.scene.canvas, hud, this.status);
    let saved: string | null = null;
    try { saved = sessionStorage.getItem('crashout-pilot-view'); } catch { /* Préférence facultative. */ }
    this.switchView(saved === 'map' || saved === 'chase' || saved === 'cockpit' ? saved : 'cockpit');
    this.raf = requestAnimationFrame(this.draw);
  }

  /** Prend en compte une mise à jour du serveur sans remplacer le canvas. */
  update(state: GameState, t: number): void {
    this.state = state;
    this.frames.update(state, t);
    const car = state.cars[this.team];
    this.hp.max = state.params.hpMax;
    this.hp.value = car.hp;
    const stock = car.heldItem === 'slingshot' ? 'Lance-pierre' : car.heldItem === 'boost' ? 'Boost' : '';
    const info = `PV ${car.hp}/${state.params.hpMax} · Tour ${Math.min(car.lap + 1, state.params.lapsToWin)}/${state.params.lapsToWin}`
      + (stock ? ` · ${stock}${car.itemArmed ? ' armé' : ' en réserve'}` : '');
    if (this.info.textContent !== info) this.info.textContent = info;
  }

  /** Interrompt la boucle de dessin à la fermeture de l'écran. */
  close(): void {
    cancelAnimationFrame(this.raf);
    this.scene.close();
  }

  private switchView(mode: PilotView): void {
    this.mode = mode;
    this.view.textContent = 'Vue · ' + viewLabel[mode];
    this.mapOptions.hidden = mode !== 'map';
    if (mode === 'map') this.scene.hide();
    try { sessionStorage.setItem('crashout-pilot-view', mode); } catch { /* Préférence facultative. */ }
  }

  /** Calcule la taille du canvas et dessine un état intermédiaire. */
  private draw = (): void => {
    this.raf = requestAnimationFrame(this.draw);
    if (!this.state?.track || this.root.hidden || document.hidden) return;
    const now = this.state.phase === 'PAUSED' ? this.state.pausedAt : this.now();
    const poses = this.reducedMotion.matches ? this.state.cars : this.frames.poses(now);
    this.canvas.hidden = this.mode !== 'map'
      && this.scene.draw(this.state, poses, this.mode, this.team, now, this.reducedMotion.matches);
    if (!this.canvas.hidden) this.drawMap(now, poses);
    this.updateStatus(now);
  };

  private drawMap(now: number, poses: ReturnType<RaceFrames['poses']>): void {
    if (!this.state) return;
    const ratio = Math.min(2, window.devicePixelRatio);
    const w = Math.round(this.canvas.clientWidth * ratio), h = Math.round(this.canvas.clientHeight * ratio);
    if (!w || !h) return;
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    this.peripheral.draw(this.context, w, h, this.state, poses, this.team, now);
  }

  private updateStatus(now: number): void {
    if (!this.state) return;
    const car = this.state.cars[this.team];
    const status = this.state.phase === 'RESULT' ? 'Course terminée'
      : this.state.phase === 'PAUSED' ? 'Ⅱ  Pause'
      : car.disabled ? '⚠  Voiture en panne'
      : car.respawnUntil > now ? `◉  Reprise dans ${Math.ceil((car.respawnUntil - now) / 1000)} s`
      : this.state.repairProgress[this.team] > 0 ? '✚  Réparation en cours'
      : now < this.state.sessionStartAt && !this.state.tutorial ? '◉  Départ imminent' : '';
    if (this.status.textContent !== status) this.status.textContent = status;
  }
}
