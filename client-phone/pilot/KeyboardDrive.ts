/** Adapte les flèches à la place pilote du mode de développement PC. */
import type { DriveSample } from './gyro.js';

export class KeyboardDrive {
  private readonly held = new Set<string>();

  constructor(private readonly release: () => void) {
    window.addEventListener('keydown', this.key);
    window.addEventListener('keyup', this.key);
    window.addEventListener('blur', this.clear);
    document.addEventListener('visibilitychange', this.clear);
  }

  read(): DriveSample | null {
    if (!document.hasFocus()) return null;
    const steer = Number(this.held.has('ArrowRight')) - Number(this.held.has('ArrowLeft'));
    return { steer, throttle: Number(this.held.has('ArrowUp')) };
  }

  close(): void {
    window.removeEventListener('keydown', this.key);
    window.removeEventListener('keyup', this.key);
    window.removeEventListener('blur', this.clear);
    document.removeEventListener('visibilitychange', this.clear);
  }

  private key = (event: KeyboardEvent): void => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    if (event.type === 'keydown') this.held.add(event.key);
    else this.held.delete(event.key);
  };

  private clear = (): void => { this.held.clear(); this.release(); };
}
