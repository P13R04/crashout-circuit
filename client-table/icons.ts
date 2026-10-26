/** Canvas glyphs share one stroke style and do not depend on emoji fonts. */
export type Icon = 'power' | 'play' | 'pause' | 'home' | 'replay' | 'touch' | 'mouse'
  | 'track' | 'draw' | 'check' | 'target' | 'wrench' | 'wheel' | 'pedal' | 'flag'
  | 'clock' | 'trophy' | 'wait' | 'bolt' | 'heart';

export function icon(ctx: CanvasRenderingContext2D, name: Icon, x: number, y: number, size: number, color = '#fff'): void {
  ctx.save(); ctx.translate(x, y); ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.8;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath();
  switch (name) {
    case 'power':
      ctx.arc(0, 0, 9, -Math.PI * .3, Math.PI * 1.3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(0, -1); break;
    case 'play':
      ctx.moveTo(-5, -9); ctx.lineTo(9, 0); ctx.lineTo(-5, 9); ctx.closePath(); ctx.fill(); break;
    case 'pause': ctx.rect(-7, -9, 4, 18); ctx.rect(3, -9, 4, 18); ctx.fill(); break;
    case 'home':
      ctx.moveTo(-10, -1); ctx.lineTo(0, -10); ctx.lineTo(10, -1);
      ctx.moveTo(-7, -3); ctx.lineTo(-7, 10); ctx.lineTo(7, 10); ctx.lineTo(7, -3);
      ctx.moveTo(-2, 10); ctx.lineTo(-2, 3); ctx.lineTo(2, 3); ctx.lineTo(2, 10); break;
    case 'replay':
      ctx.arc(0, 0, 9, -Math.PI * .8, Math.PI * .8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-8, -9); ctx.lineTo(-8, -3); ctx.lineTo(-2, -3); break;
    case 'touch':
      ctx.arc(0, -5, 4, Math.PI, 0); ctx.lineTo(4, 0); ctx.lineTo(9, 3); ctx.lineTo(7, 12);
      ctx.lineTo(-2, 12); ctx.lineTo(-9, 3); ctx.quadraticCurveTo(-10, -1, -6, 0); ctx.lineTo(-4, 2); ctx.lineTo(-4, -5);
      ctx.moveTo(-8, -8); ctx.lineTo(-10, -10); ctx.moveTo(8, -8); ctx.lineTo(10, -10);
      ctx.moveTo(0, -11); ctx.lineTo(0, -14); break;
    case 'mouse':
      ctx.roundRect(-7, -11, 14, 22, 7); ctx.moveTo(-7, -2); ctx.lineTo(7, -2); ctx.moveTo(0, -11); ctx.lineTo(0, -2); break;
    case 'track':
      ctx.roundRect(-11, -8, 22, 16, 8); ctx.roundRect(-6, -3, 12, 6, 3); break;
    case 'draw':
      ctx.moveTo(-10, 7); ctx.bezierCurveTo(-3, -10, 1, 13, 10, -7);
      ctx.moveTo(5, -8); ctx.lineTo(11, -9); ctx.lineTo(11, -3); break;
    case 'check': ctx.moveTo(-9, 0); ctx.lineTo(-2, 7); ctx.lineTo(10, -8); break;
    case 'target': ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.moveTo(4, 0); ctx.arc(0, 0, 4, 0, Math.PI * 2); break;
    case 'wrench':
      ctx.moveTo(-9, 10); ctx.lineTo(2, -1); ctx.arc(6, -5, 6, Math.PI * .75, Math.PI * 1.6);
      ctx.lineTo(5, -5); ctx.lineTo(9, -2); ctx.lineTo(12, -4);
      ctx.arc(6, -5, 6, .15, Math.PI * .45); ctx.lineTo(-6, 12); ctx.closePath(); break;
    case 'wheel':
      ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.moveTo(-9, -3); ctx.lineTo(9, -3);
      ctx.moveTo(0, -3); ctx.lineTo(0, 10); ctx.moveTo(3, 0); ctx.arc(0, 0, 3, 0, Math.PI * 2); break;
    case 'pedal':
      ctx.roundRect(-6, -10, 12, 18, 3); ctx.moveTo(-3, -5); ctx.lineTo(3, -5);
      ctx.moveTo(-3, 0); ctx.lineTo(3, 0); ctx.moveTo(0, 8); ctx.lineTo(0, 12); ctx.lineTo(8, 12); break;
    case 'flag':
      ctx.moveTo(-7, 11); ctx.lineTo(-7, -11); ctx.lineTo(10, -11); ctx.lineTo(6, -5); ctx.lineTo(10, 1); ctx.lineTo(-7, 1);
      ctx.moveTo(0, -11); ctx.lineTo(0, 1); ctx.moveTo(-7, -5); ctx.lineTo(6, -5); break;
    case 'clock':
      ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.moveTo(0, -6); ctx.lineTo(0, 0); ctx.lineTo(5, 3); break;
    case 'trophy':
      ctx.moveTo(-7, -10); ctx.lineTo(7, -10); ctx.lineTo(6, 0); ctx.quadraticCurveTo(0, 9, -6, 0); ctx.closePath();
      ctx.moveTo(-7, -7); ctx.lineTo(-11, -7); ctx.quadraticCurveTo(-12, 2, -5, 2);
      ctx.moveTo(7, -7); ctx.lineTo(11, -7); ctx.quadraticCurveTo(12, 2, 5, 2);
      ctx.moveTo(0, 5); ctx.lineTo(0, 11); ctx.moveTo(-5, 11); ctx.lineTo(5, 11); break;
    case 'wait':
      ctx.moveTo(-8, -10); ctx.lineTo(8, -10); ctx.lineTo(8, -7); ctx.lineTo(-8, 7); ctx.lineTo(-8, 10);
      ctx.lineTo(8, 10); ctx.lineTo(8, 7); ctx.lineTo(-8, -7); ctx.closePath(); break;
    case 'bolt': ctx.moveTo(2, -12); ctx.lineTo(-8, 2); ctx.lineTo(0, 2); ctx.lineTo(-2, 12); ctx.lineTo(8, -2); ctx.lineTo(0, -2); ctx.closePath(); break;
    case 'heart':
      ctx.moveTo(0, 10); ctx.bezierCurveTo(-22, -5, -5, -17, 0, -6); ctx.bezierCurveTo(5, -17, 22, -5, 0, 10); break;
  }
  ctx.stroke(); ctx.restore();
}

/** Contact dots: the gesture recipe, never a second activation button. */
export function contacts(ctx: CanvasRenderingContext2D, count: number, x: number, y: number, color: string): void {
  ctx.save(); ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = 2;
  for (let i = 0; i < count; i++) {
    const px = x + (i - (count - 1) / 2) * 16;
    ctx.beginPath(); ctx.arc(px, y, 5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(px, y, 8, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}
