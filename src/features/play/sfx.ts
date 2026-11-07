import { usePlayStore } from "./progress/playStore";

/**
 * Game sound effects, synthesised in the browser.
 *
 * The first version of play sound was a single sine beep at different
 * pitches, which is why the games felt silent even with sound on: a beep says
 * "something happened", not "you nailed it" or "you crashed". These are built
 * from the same three ingredients real game audio uses - tones with shaped
 * envelopes, filtered noise (whooshes, bat cracks, crowds) and short
 * sequences (fanfares) - so each event has a sound you can tell apart with
 * your eyes shut.
 *
 * Still no audio files: everything is generated, so it adds no download and
 * cannot fail to load. Every effect checks the player's sound switch at the
 * moment it plays (usePlayStore.soundEnabled), so callers just call
 * sfx("hit") and never pass the setting around.
 */

export type Sfx =
  | "tap"
  | "select"
  | "correct"
  | "wrong"
  | "win"
  | "lose"
  | "tick"
  | "flap"
  | "point"
  | "crash"
  | "whoosh"
  | "bat-perfect"
  | "bat-good"
  | "bat-edge"
  | "defend"
  | "bounce"
  | "stumps"
  | "footstep"
  | "crowd-roar"
  | "crowd-cheer"
  | "crowd-ooh"
  | "crowd-groan"
  | "drop";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;

function audio(): { ctx: AudioContext; out: GainNode } | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = 0.55;
      // A gentle compressor keeps a six's roar and a bat crack from clipping
      // when they land together.
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      master.connect(comp).connect(ctx.destination);
    }
    if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
    return { ctx, out: master! };
  } catch {
    return null;
  }
}

function noise(c: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === c.sampleRate) return noiseBuffer;
  const length = Math.floor(c.sampleRate * 2.5);
  const buf = c.createBuffer(1, length, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buf;
  return buf;
}

interface ToneOpts {
  type?: OscillatorType;
  from: number;
  to?: number;
  at?: number;
  dur: number;
  gain?: number;
  attack?: number;
}

function tone(c: AudioContext, out: AudioNode, o: ToneOpts) {
  const t0 = c.currentTime + (o.at ?? 0);
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(o.from, t0);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t0 + o.dur);
  const peak = o.gain ?? 0.25;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + (o.attack ?? 0.008));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  osc.connect(g).connect(out);
  osc.start(t0);
  osc.stop(t0 + o.dur + 0.05);
}

interface NoiseOpts {
  at?: number;
  dur: number;
  gain?: number;
  filter?: BiquadFilterType;
  freq: number;
  freqTo?: number;
  q?: number;
  attack?: number;
  /** Seconds to hold near peak before the release (crowds swell and hang). */
  hold?: number;
}

function hiss(c: AudioContext, out: AudioNode, o: NoiseOpts) {
  const t0 = c.currentTime + (o.at ?? 0);
  const src = c.createBufferSource();
  src.buffer = noise(c);
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = o.filter ?? "bandpass";
  f.frequency.setValueAtTime(o.freq, t0);
  if (o.freqTo) f.frequency.exponentialRampToValueAtTime(o.freqTo, t0 + o.dur);
  f.Q.value = o.q ?? 1;
  const g = c.createGain();
  const peak = o.gain ?? 0.3;
  const attack = o.attack ?? 0.005;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  if (o.hold) g.gain.setValueAtTime(peak, t0 + attack + o.hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  src.connect(f).connect(g).connect(out);
  src.start(t0, Math.random() * 1.5);
  src.stop(t0 + o.dur + 0.05);
}

/** A crowd: several detuned noise bands so it sounds like many voices, not one hiss. */
function crowd(c: AudioContext, out: AudioNode, level: number, dur: number, hold: number, pitch = 1) {
  for (const [freq, q, share] of [
    [520, 0.7, 1],
    [900, 0.9, 0.8],
    [1500, 1.1, 0.55],
    [2600, 1.4, 0.3],
  ] as const) {
    hiss(c, out, { dur, hold, attack: 0.25, gain: level * share, freq: freq * pitch, q });
  }
}

export function sfx(name: Sfx): void {
  try {
    if (!usePlayStore.getState().soundEnabled) return;
  } catch {
    return;
  }
  const a = audio();
  if (!a) return;
  const { ctx: c, out } = a;
  try {
    switch (name) {
      case "tap":
        tone(c, out, { type: "triangle", from: 880, dur: 0.05, gain: 0.12 });
        break;
      case "select":
        tone(c, out, { type: "triangle", from: 660, to: 990, dur: 0.08, gain: 0.14 });
        break;
      case "tick":
        tone(c, out, { type: "square", from: 1400, dur: 0.025, gain: 0.05 });
        break;
      case "correct":
        tone(c, out, { type: "triangle", from: 784, dur: 0.1, gain: 0.2 });
        tone(c, out, { type: "triangle", from: 1175, at: 0.08, dur: 0.18, gain: 0.2 });
        break;
      case "wrong":
        tone(c, out, { type: "sawtooth", from: 220, to: 140, dur: 0.28, gain: 0.12 });
        tone(c, out, { type: "square", from: 110, dur: 0.22, gain: 0.06 });
        break;
      case "win":
        [523, 659, 784, 1047].forEach((f, i) => tone(c, out, { type: "triangle", from: f, at: i * 0.11, dur: 0.22, gain: 0.2 }));
        tone(c, out, { type: "sine", from: 1568, at: 0.44, dur: 0.5, gain: 0.12 });
        break;
      case "lose":
        [392, 330, 262].forEach((f, i) => tone(c, out, { type: "triangle", from: f, at: i * 0.16, dur: 0.26, gain: 0.18 }));
        break;
      case "flap":
        hiss(c, out, { dur: 0.13, gain: 0.22, filter: "bandpass", freq: 900, freqTo: 2400, q: 1.2 });
        tone(c, out, { type: "sine", from: 420, to: 640, dur: 0.07, gain: 0.08 });
        break;
      case "point":
        tone(c, out, { type: "square", from: 988, dur: 0.07, gain: 0.08 });
        tone(c, out, { type: "square", from: 1319, at: 0.07, dur: 0.14, gain: 0.08 });
        break;
      case "crash":
        hiss(c, out, { dur: 0.35, gain: 0.45, filter: "lowpass", freq: 1800, freqTo: 200 });
        tone(c, out, { type: "sine", from: 160, to: 50, dur: 0.35, gain: 0.35 });
        break;
      case "whoosh":
        hiss(c, out, { dur: 0.4, gain: 0.18, attack: 0.15, filter: "bandpass", freq: 400, freqTo: 3000, q: 0.8 });
        break;
      case "drop":
        tone(c, out, { type: "sine", from: 600, to: 150, dur: 0.18, gain: 0.18 });
        break;
      // ── Cricket ──────────────────────────────────────────────────────────
      case "bat-perfect":
        // Willow on leather: a hard click with a woody body under it.
        hiss(c, out, { dur: 0.09, gain: 0.7, filter: "bandpass", freq: 2600, q: 2.2, attack: 0.001 });
        tone(c, out, { type: "triangle", from: 520, to: 360, dur: 0.12, gain: 0.35, attack: 0.001 });
        tone(c, out, { type: "sine", from: 1250, dur: 0.05, gain: 0.2, attack: 0.001 });
        break;
      case "bat-good":
        hiss(c, out, { dur: 0.08, gain: 0.5, filter: "bandpass", freq: 2000, q: 2, attack: 0.001 });
        tone(c, out, { type: "triangle", from: 440, to: 320, dur: 0.1, gain: 0.25, attack: 0.001 });
        break;
      case "bat-edge":
        hiss(c, out, { dur: 0.06, gain: 0.35, filter: "highpass", freq: 3200, attack: 0.001 });
        tone(c, out, { type: "square", from: 1900, dur: 0.03, gain: 0.05, attack: 0.001 });
        break;
      case "defend":
        hiss(c, out, { dur: 0.06, gain: 0.35, filter: "bandpass", freq: 1200, q: 1.5, attack: 0.001 });
        tone(c, out, { type: "sine", from: 300, to: 220, dur: 0.08, gain: 0.2, attack: 0.001 });
        break;
      case "bounce":
        hiss(c, out, { dur: 0.05, gain: 0.25, filter: "lowpass", freq: 600, attack: 0.001 });
        tone(c, out, { type: "sine", from: 140, to: 90, dur: 0.07, gain: 0.25, attack: 0.001 });
        break;
      case "stumps":
        // Three stumps and two bails: a quick ragged clatter.
        for (let i = 0; i < 5; i++) {
          hiss(c, out, { at: i * 0.045 + Math.random() * 0.02, dur: 0.07, gain: 0.4 - i * 0.05, filter: "bandpass", freq: 1500 + i * 300, q: 3, attack: 0.001 });
        }
        tone(c, out, { type: "triangle", from: 700, to: 500, dur: 0.15, gain: 0.15, attack: 0.001 });
        break;
      case "footstep":
        hiss(c, out, { dur: 0.05, gain: 0.12, filter: "lowpass", freq: 380, attack: 0.002 });
        break;
      case "crowd-roar":
        crowd(c, out, 0.28, 2.8, 1.2, 1.1);
        break;
      case "crowd-cheer":
        crowd(c, out, 0.2, 1.7, 0.5, 1);
        break;
      case "crowd-ooh":
        // A rising then falling "oooh" when the ball beats the bat.
        hiss(c, out, { dur: 1.1, gain: 0.16, attack: 0.25, filter: "bandpass", freq: 380, freqTo: 520, q: 3 });
        hiss(c, out, { dur: 1.1, gain: 0.1, attack: 0.25, filter: "bandpass", freq: 760, freqTo: 1000, q: 3 });
        break;
      case "crowd-groan":
        hiss(c, out, { dur: 1.3, gain: 0.16, attack: 0.15, filter: "bandpass", freq: 520, freqTo: 260, q: 2 });
        hiss(c, out, { dur: 1.3, gain: 0.1, attack: 0.15, filter: "bandpass", freq: 1000, freqTo: 500, q: 2 });
        break;
    }
  } catch {
    // Audio is a bonus; a game must never break because a sound could not play.
  }
}

/**
 * A low crowd murmur under a cricket match. Returns a stop function. Quiet on
 * purpose: it is atmosphere, not a soundtrack.
 */
export function startCrowdAmbience(): () => void {
  try {
    if (!usePlayStore.getState().soundEnabled) return () => undefined;
  } catch {
    return () => undefined;
  }
  const a = audio();
  if (!a) return () => undefined;
  const { ctx: c, out } = a;
  try {
    const src = c.createBufferSource();
    src.buffer = noise(c);
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 700;
    f.Q.value = 0.5;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.035, c.currentTime + 1.2);
    // A slow wobble so the murmur breathes instead of sitting flat.
    const lfo = c.createOscillator();
    const lfoGain = c.createGain();
    lfo.frequency.value = 0.18;
    lfoGain.gain.value = 0.012;
    lfo.connect(lfoGain).connect(g.gain);
    src.connect(f).connect(g).connect(out);
    src.start();
    lfo.start();
    return () => {
      try {
        g.gain.cancelScheduledValues(c.currentTime);
        g.gain.setValueAtTime(g.gain.value, c.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.4);
        src.stop(c.currentTime + 0.5);
        lfo.stop(c.currentTime + 0.5);
      } catch {
        /* already stopped */
      }
    };
  } catch {
    return () => undefined;
  }
}
