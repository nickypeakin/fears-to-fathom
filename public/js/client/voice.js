// Spoken lines, using the voices built into the browser (speechSynthesis).
// The narrator, dispatch on the radio, the ranger, your friends' shouts,
// and Wade, low and slow and friendly. Subtitles always show, so a browser
// without voices loses nothing but the sound. Can be switched off in
// Settings.

const STYLE = {
  wade: { pitch: 0.55, rate: 0.82, sex: 'm' },
  whisper: { pitch: 0.2, rate: 0.62, sex: 'm', volume: 0.45 },
  radio: { pitch: 1.1, rate: 1.06, sex: 'f', volume: 0.8 },
  radioWade: { pitch: 0.4, rate: 0.72, sex: 'm', volume: 0.75 },
  ranger: { pitch: 0.8, rate: 0.98, sex: 'm' },
  police: { pitch: 1.0, rate: 1.05, sex: 'f' },
  narrator: { pitch: 0.9, rate: 0.9, sex: 'm', volume: 0.9 },
  friend: { pitch: 1.0, rate: 1.08, sex: null },
};

const FEMALE = /female|woman|samantha|victoria|karen|zira|susan|moira|tessa|fiona|serena|hazel|kate|allison|ava|joanna|salli|kimberly|emma|amy|aria|jenny|libby|sonia/i;
const MALE = /male|man\b|daniel|alex|fred|david|mark|george|james|guy|ryan|tom|aaron|arthur|oliver|rishi|lee/i;

class Voice {
  constructor() {
    this.enabled = true;
    this.volume = 0.8;
    this.voices = [];
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
    this.synth = synth || null;
    if (synth) {
      const load = () => { this.voices = synth.getVoices().filter((v) => /^en/i.test(v.lang)); };
      load();
      synth.addEventListener?.('voiceschanged', load);
    }
  }

  pick(sex, salt = 0) {
    const vs = this.voices;
    if (!vs.length) return null;
    const pool = sex === 'f' ? vs.filter((v) => FEMALE.test(v.name)) : sex === 'm' ? vs.filter((v) => MALE.test(v.name) && !FEMALE.test(v.name)) : vs;
    const list = pool.length ? pool : vs;
    return list[salt % list.length];
  }

  // kind: one of STYLE's keys; salt picks between voices so different
  // friends sound different
  say(text, kind = 'friend', { salt = 0, sex = null } = {}) {
    if (!this.enabled || !this.synth || !text || text === '...' || text.startsWith('(')) return;
    const st = STYLE[kind] || STYLE.friend;
    // keep up with the conversation rather than queueing a backlog
    if (this.synth.pending || this.synth.speaking) {
      this.queued = (this.queued || 0) + 1;
      if (this.queued > 1) { this.synth.cancel(); this.queued = 0; }
    } else this.queued = 0;
    const u = new SpeechSynthesisUtterance(text.replace(/\.\.\./g, ', '));
    const v = this.pick(st.sex || sex, salt);
    if (v) u.voice = v;
    u.pitch = st.pitch;
    u.rate = st.rate;
    u.volume = Math.min(1, this.volume * (st.volume ?? 1));
    this.synth.speak(u);
  }

  stop() {
    if (this.synth) this.synth.cancel();
  }
}

export const voice = new Voice();
