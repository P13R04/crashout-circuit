/**
 * Minimal Web Audio feedback (no asset files): short synthesized cues for the
 * major interactions. The AudioContext can only start after a user gesture, so
 * `unlock()` is called from the first pointerdown.
 */
let audio: AudioContext | null = null;

export function unlock(): void {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
  } catch { /* audio unavailable */ }
}

function tone(freq: number, dur: number, type: OscillatorType, gain = 0.15, slideTo?: number, delay = 0): void {
  if (!audio || audio.state !== 'running') return;
  const t0 = audio.currentTime + delay;
  const osc = audio.createOscillator();
  const g = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(g).connect(audio.destination);
  osc.start(t0);
  osc.stop(t0 + dur);
}

function noise(dur: number, gain = 0.2): void {
  if (!audio || audio.state !== 'running') return;
  const len = Math.floor(audio.sampleRate * dur);
  const buf = audio.createBuffer(1, len, audio.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = audio.createBufferSource();
  const g = audio.createGain();
  g.gain.value = gain;
  src.buffer = buf;
  src.connect(g).connect(audio.destination);
  src.start();
}

/** Server `Feedback.kind` → sound. */
export function playFeedback(kind: string): void {
  switch (kind) {
    case 'stoneWarning': tone(880, 0.12, 'square', 0.08); tone(880, 0.12, 'square', 0.08, undefined, 0.2); tone(880, 0.12, 'square', 0.08, undefined, 0.4); break;
    case 'stoneImpact': noise(0.35, 0.3); tone(120, 0.3, 'sawtooth', 0.2, 40); break;
    case 'ghost': tone(300, 0.4, 'sine', 0.15, 900); break;
    case 'boostGate': case 'boostHit': tone(400, 0.25, 'triangle', 0.15, 1200); break;
    case 'repairDone': tone(523, 0.12, 'sine', 0.15); tone(659, 0.12, 'sine', 0.15, undefined, 0.12); tone(784, 0.2, 'sine', 0.15, undefined, 0.24); break;
    case 'wallDestroyed': noise(0.2, 0.25); tone(200, 0.2, 'square', 0.1, 60); break;
    case 'hit': tone(180, 0.15, 'square', 0.12, 80); break;
    case 'pickup': tone(660, 0.1, 'sine', 0.12); tone(990, 0.1, 'sine', 0.12, undefined, 0.08); break;
    case 'carDisabled': tone(400, 0.6, 'sawtooth', 0.15, 60); break;
    case 'mapError': tone(200, 0.2, 'square', 0.1); break;
  }
}
