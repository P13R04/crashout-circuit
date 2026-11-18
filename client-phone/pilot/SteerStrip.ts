/**
 * Bande de direction tactile : le pilote pose le pouce et le glisse à gauche ou à droite ; relâcher recentre.
 * Liens : client-phone/pilot/PilotScreen.ts, client-phone/pilot/touchSteering.ts, client-phone/phone.css.
 * Fonctionne en HTTP comme en HTTPS et sans autorisation : c'est la direction par défaut, le gyroscope est une option.
 */
import type { DriveSample } from './gyro.js';
import { steerFromTouch } from './touchSteering.js';

export class SteerStrip {
  readonly root = document.createElement('div');
  private readonly thumb = document.createElement('div');
  private pointer: number | null = null;
  private key: string | null = null;
  steer = 0;

  constructor() {
    this.root.className = 'steer-strip';
    this.root.tabIndex = 0;
    this.root.setAttribute('role', 'slider');
    this.root.setAttribute('aria-label', 'Direction');
    this.root.setAttribute('aria-valuemin', '-100');
    this.root.setAttribute('aria-valuemax', '100');
    this.thumb.className = 'steer-thumb';
    for (const [side, glyph] of [['left', '◀'], ['right', '▶']] as const) {
      const arrow = document.createElement('span');
      arrow.className = `steer-arrow ${side}`;
      arrow.textContent = glyph;
      arrow.setAttribute('aria-hidden', 'true');
      this.root.append(arrow);
    }
    this.root.append(this.thumb);
    this.root.addEventListener('pointerdown', this.down);
    this.root.addEventListener('pointermove', this.move);
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) this.root.addEventListener(type, this.up);
    this.root.addEventListener('keydown', this.keyDown);
    this.root.addEventListener('keyup', this.keyUp);
    this.root.addEventListener('blur', this.release);
    this.root.addEventListener('contextmenu', event => event.preventDefault());
    this.show(0);
  }

  /** Direction actuelle, sans accélération : en mode pédale, c'est le bouton qui la donne. */
  read(): DriveSample {
    return { steer: this.steer, throttle: 0 };
  }

  /** Recentre la direction, par exemple quand l'écran quitte le premier plan ou que la source change. */
  release = (): void => {
    if (this.pointer !== null && this.root.hasPointerCapture(this.pointer)) this.root.releasePointerCapture(this.pointer);
    this.pointer = this.key = null;
    this.show(0);
  };

  /** Applique la direction et déplace le pouce virtuel. */
  private show(steer: number): void {
    this.steer = steer;
    this.thumb.style.left = `${50 + steer * 42.5}%`;
    this.root.classList.toggle('held', steer !== 0 || this.pointer !== null);
    this.root.setAttribute('aria-valuenow', String(Math.round(steer * 100)));
  }

  /** Suit le doigt sur la largeur de la bande. */
  private follow(event: PointerEvent): void {
    const box = this.root.getBoundingClientRect();
    this.show(steerFromTouch((event.clientX - box.left) / Math.max(1, box.width)));
  }

  private down = (event: PointerEvent): void => {
    if (this.pointer !== null || this.key !== null || event.button !== 0) return;
    this.pointer = event.pointerId;
    this.root.setPointerCapture(event.pointerId);
    this.follow(event);
  };

  private move = (event: PointerEvent): void => {
    if (event.pointerId === this.pointer) this.follow(event);
  };

  private up = (event: PointerEvent): void => {
    if (event.pointerId === this.pointer) this.release();
  };

  private keyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    if (this.pointer !== null) return;
    this.key = event.key;
    this.show(event.key === 'ArrowLeft' ? -1 : 1);
  };

  private keyUp = (event: KeyboardEvent): void => {
    if (event.key === this.key) this.release();
  };
}
