/**
 * Optional sound.
 *
 * Off by default and off until the player turns it on — see playStore's
 * SOUND_KEY. Nothing here autoplays, and nothing loads an audio file: these
 * are short synthesised tones through the Web Audio API, so the feature adds
 * no bytes to the bundle and can't fail on a slow connection.
 *
 * Every call is wrapped: AudioContext is unavailable or blocked in a few real
 * situations (an old webview, a page that hasn't had a user gesture yet, a
 * browser with autoplay locked down), and a game must never break because a
 * beep couldn't play.
 */

let context: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!context) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return null;
      context = new Ctor();
    }
    return context;
  } catch {
    return null;
  }
}

/**
 * Runs `fn` against a context that is definitely running.
 *
 * This is the fix for silent games. The old code called `context.resume()` and
 * then scheduled the tone immediately — but resume() is ASYNCHRONOUS, and a
 * suspended context has a frozen `currentTime` of 0. So the oscillator was
 * scheduled to start and stop at times that were already in the past by the
 * moment the context actually woke up, and the first sound of every session
 * was silently discarded. Since the context only ever suspends again when the
 * tab is backgrounded, that was most of the sounds people never heard.
 *
 * Waiting for the resume to settle costs a few milliseconds once, and then
 * never again.
 */
function withRunningContext(fn: (ctx: AudioContext) => void): void {
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    ctx
      .resume()
      .then(() => fn(ctx))
      .catch(() => {
        /* autoplay still blocked — the game continues silently */
      });
    return;
  }
  fn(ctx);
}

/** A short tone. `seconds` is capped so nothing can drone. */
export function playTone(frequency: number, seconds = 0.08): void {
  withRunningContext((ctx) => {
    try {
      const duration = Math.min(0.6, Math.max(0.02, seconds));
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = frequency;
      // A quick attack and exponential release — a raw square edge at full
      // gain is what makes browser-synth audio sound like an error beep.
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        ctx.currentTime + duration,
      );
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration + 0.02);
    } catch {
      /* audio unavailable — the game continues silently */
    }
  });
}

/** A rising three-note flourish for a win. */
export function playFanfare(): void {
  [523, 659, 784].forEach((f, i) =>
    window.setTimeout(() => playTone(f, 0.14), i * 110),
  );
}
