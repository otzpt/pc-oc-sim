// All sounds are synthesized with Web Audio, so there are no audio files to license.
// Browsers only allow audio after a user gesture; the first power click provides it.
let ctx = null;
let master = null;
let fan = null;
let muted = false;
try { muted = localStorage.getItem('pcsim.muted') === '1'; } catch { /* storage blocked: default to sound on */ }

function ac() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.8;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function noiseBuffer(seconds) {
  const c = ac();
  const buf = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; } // brown noise
  return buf;
}

export const sound = {
  get muted() { return muted; },
  toggleMute() {
    muted = !muted;
    try { localStorage.setItem('pcsim.muted', muted ? '1' : '0'); } catch { /* ignore */ }
    if (master) master.gain.value = muted ? 0 : 0.8;
    return muted;
  },

  // Tactile switch click: a very short filtered noise tick.
  click() {
    const c = ac();
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(0.03);
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
    const g = c.createGain();
    g.gain.setValueAtTime(0.5, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.03);
    src.connect(hp).connect(g).connect(master);
    src.start();
  },

  // Case and CPU fans spinning up, then a low steady hum.
  fansOn() {
    if (fan) return;
    const c = ac();
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(4); src.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300;
    lp.frequency.linearRampToValueAtTime(900, c.currentTime + 1.2);
    lp.frequency.linearRampToValueAtTime(450, c.currentTime + 3);
    const g = c.createGain();
    g.gain.setValueAtTime(0, c.currentTime);
    g.gain.linearRampToValueAtTime(0.09, c.currentTime + 1.0);
    g.gain.linearRampToValueAtTime(0.035, c.currentTime + 3);
    src.connect(lp).connect(g).connect(master);
    src.start();
    fan = { src, g, lp };
  },
  // Load follows fan duty (0..1) so a stress test is audibly louder.
  fanLevel(duty) {
    if (!fan) return;
    const c = ac();
    fan.g.gain.setTargetAtTime(0.025 + 0.07 * duty, c.currentTime, 0.8);
    fan.lp.frequency.setTargetAtTime(380 + 700 * duty, c.currentTime, 0.8);
  },
  fansOff() {
    if (!fan) return;
    const c = ac();
    const f = fan; fan = null;
    f.g.gain.setTargetAtTime(0, c.currentTime, 0.5);
    f.src.stop(c.currentTime + 3);
  },

  // PC speaker style POST beep (only when POST Beep is enabled in BIOS).
  beep(times = 1) {
    const c = ac();
    for (let i = 0; i < times; i++) {
      const o = c.createOscillator(); o.type = 'square'; o.frequency.value = 1000;
      const g = c.createGain();
      const t = c.currentTime + i * 0.3;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.08, t + 0.005);
      g.gain.setValueAtTime(0.08, t + 0.15);
      g.gain.linearRampToValueAtTime(0.0001, t + 0.16);
      o.connect(g).connect(master); o.start(t); o.stop(t + 0.17);
    }
  },

  // Original startup chime: a soft rising arpeggio with a short echo.
  chime() {
    const c = ac();
    const delay = c.createDelay(); delay.delayTime.value = 0.22;
    const fb = c.createGain(); fb.gain.value = 0.3;
    delay.connect(fb).connect(delay);
    delay.connect(master);
    [[392.0, 0], [523.25, 0.18], [659.25, 0.36], [783.99, 0.54], [1046.5, 0.8]].forEach(([f, at]) => {
      const t = c.currentTime + at;
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const o2 = c.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f * 2;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
      const g2 = c.createGain(); g2.gain.value = 0.15;
      o.connect(g); o2.connect(g2).connect(g);
      g.connect(master); g.connect(delay);
      o.start(t); o2.start(t); o.stop(t + 1.7); o2.stop(t + 1.7);
    });
  },

  // Low buzz for a crash.
  crash() {
    const c = ac();
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 110;
    const g = c.createGain();
    g.gain.setValueAtTime(0.06, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.6);
    o.connect(g).connect(master); o.start(); o.stop(c.currentTime + 0.6);
  },
};
