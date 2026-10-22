/**
 * AetherChess Professional Chess Audio System
 * Powered by the Web Audio API with zero external dependencies and sub-millisecond latency.
 * Provides distinct acoustic events for moves, captures, checks, game outcomes,
 * and review move classifications (Brilliant, Great, Best, Inaccuracy, Mistake, Blunder).
 */

export type ChessSoundEvent =
  | 'move'
  | 'move_opponent'
  | 'capture'
  | 'castle'
  | 'check'
  | 'checkmate'
  | 'promotion'
  | 'brilliant'
  | 'great'
  | 'best'
  | 'excellent'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder'
  | 'missed_win'
  | 'win'
  | 'loss'
  | 'draw'
  | 'resign';

export type SoundTheme = 'classic' | 'wood' | 'minimal';

export interface AudioSettings {
  masterEnabled: boolean;
  moveSounds: boolean;
  captureSounds: boolean;
  checkSounds: boolean;
  reviewSounds: boolean;
  resultSounds: boolean;
  volume: number; // 0.0 to 1.0
  theme: SoundTheme;
}

const DEFAULT_SETTINGS: AudioSettings = {
  masterEnabled: true,
  moveSounds: true,
  captureSounds: true,
  checkSounds: true,
  reviewSounds: true,
  resultSounds: true,
  volume: 0.75,
  theme: 'classic'
};

const SOUND_FILES: Record<string, string> = {
  move: '/audio/chess/move.mp3',
  move_opponent: '/audio/chess/move-opponent.mp3',
  capture: '/audio/chess/capture.mp3',
  castle: '/audio/chess/castle.mp3',
  check: '/audio/chess/check.mp3',
  checkmate: '/audio/chess/checkmate.wav',
  promotion: '/audio/chess/promotion.mp3',
  brilliant: '/audio/chess/brilliant.mp3',
  great: '/audio/chess/great.wav',
  best: '/audio/chess/best.wav',
  excellent: '/audio/chess/excellent.wav',
  inaccuracy: '/audio/chess/inaccuracy.wav',
  mistake: '/audio/chess/mistake.wav',
  blunder: '/audio/chess/blunder.mp3',
  missed_win: '/audio/chess/missed-opportunity.wav',
  win: '/audio/chess/game-end.mp3',
  loss: '/audio/chess/loss.wav',
  draw: '/audio/chess/draw.wav',
  resign: '/audio/chess/resign.wav'
};

const STORAGE_KEY = 'aetherchess_audio_settings';

class AudioManager {
  private ctx: AudioContext | null = null;
  private bufferCache: Map<string, AudioBuffer> = new Map();
  private settings: AudioSettings = DEFAULT_SETTINGS;
  private lastPlayedEventKey: string = '';
  private initialized: boolean = false;

  constructor() {
    this.loadSettings();
    if (typeof window !== 'undefined') {
      const unlock = () => {
        this.init();
        window.removeEventListener('pointerdown', unlock);
        window.removeEventListener('click', unlock);
        window.removeEventListener('keydown', unlock);
      };
      window.addEventListener('pointerdown', unlock, { once: true, passive: true });
      window.addEventListener('click', unlock, { once: true, passive: true });
      window.addEventListener('keydown', unlock, { once: true, passive: true });
    }
  }

  // Load preferences from localStorage
  private loadSettings(): void {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        this.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
      }
    } catch {
      this.settings = DEFAULT_SETTINGS;
    }
  }

  // Persist preferences to localStorage
  public saveSettings(newSettings: Partial<AudioSettings>): void {
    this.settings = { ...this.settings, ...newSettings };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {}
  }

  public getSettings(): AudioSettings {
    return { ...this.settings };
  }

  public setMasterMuted(muted: boolean): void {
    this.saveSettings({ masterEnabled: !muted });
  }

  public setVolume(volume: number): void {
    const clamped = Math.max(0, Math.min(1, volume));
    this.saveSettings({ volume: clamped });
  }

  /**
   * Lazily initializes AudioContext and preloads acoustic buffers upon first user interaction.
   * Gracefully satisfies browser autoplay restrictions.
   */
  public async init(): Promise<void> {
    if (this.initialized && this.ctx && this.ctx.state === 'running') return;

    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) return;

      if (!this.ctx) {
        this.ctx = new AudioCtxClass();
      }

      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }

      if (!this.initialized) {
        this.preloadAllBuffers();
        this.initialized = true;
      }
    } catch (err) {
      console.warn('[AudioManager] Failed to initialize AudioContext:', err);
    }
  }

  /**
   * Loads and decodes an authentic audio file, falling back to procedural synthesis if needed.
   */
  public async loadSoundFile(event: string): Promise<AudioBuffer | null> {
    if (!this.ctx) return null;
    const filePath = SOUND_FILES[event];
    if (filePath) {
      try {
        const res = await fetch(filePath);
        if (res.ok) {
          const arrayBuffer = await res.arrayBuffer();
          const decoded = await this.ctx.decodeAudioData(arrayBuffer);
          return decoded;
        }
      } catch (err) {
        // Fallback to synthesis below
      }
    }

    return this.synthesizeEvent(event as ChessSoundEvent, this.ctx.sampleRate);
  }

  /**
   * Pre-renders authentic Chess.com acoustic buffers into memory for zero-latency playback.
   */
  private async preloadAllBuffers(): Promise<void> {
    if (!this.ctx) return;

    const events = Object.keys(SOUND_FILES);
    await Promise.all(
      events.map(async (event) => {
        try {
          const buf = await this.loadSoundFile(event);
          if (buf) {
            this.bufferCache.set(event, buf);
          }
        } catch {}
      })
    );
  }

  /**
   * Synthesizes realistic, organic acoustic piece audio using digital signal processing.
   */
  private synthesizeEvent(event: ChessSoundEvent, sampleRate: number): AudioBuffer | null {
    if (!this.ctx) return null;

    switch (event) {
      case 'move':
        return this.createWoodTap(sampleRate, 0.07, 320, 0.7);
      case 'capture':
        return this.createCaptureImpact(sampleRate);
      case 'castle':
        return this.createCastleSequence(sampleRate);
      case 'check':
        return this.createBellChime(sampleRate, [1318.5, 1975.5], 0.25, 0.6);
      case 'checkmate':
        return this.createChord(sampleRate, [440, 554.37, 659.25, 880], 0.8, 0.7);
      case 'promotion':
        return this.createArpeggio(sampleRate, [523.25, 659.25, 783.99, 1046.5], 0.28);
      case 'brilliant':
        return this.createBrilliantChime(sampleRate);
      case 'great':
        return this.createChord(sampleRate, [587.33, 739.99, 880], 0.35, 0.65);
      case 'best':
        return this.createBellChime(sampleRate, [880, 1320], 0.12, 0.55);
      case 'excellent':
        return this.createBellChime(sampleRate, [987.77, 1480], 0.15, 0.55);
      case 'inaccuracy':
        return this.createMutedTick(sampleRate, 0.08, 220);
      case 'mistake':
        return this.createDescendingWarning(sampleRate, [440, 370], 0.22);
      case 'blunder':
        return this.createBlunderImpact(sampleRate);
      case 'missed_win':
        return this.createDescendingWarning(sampleRate, [587, 466], 0.25);
      case 'win':
        return this.createChord(sampleRate, [523.25, 659.25, 783.99, 1046.5], 0.75, 0.7);
      case 'loss':
        return this.createChord(sampleRate, [329.63, 392.0, 493.88], 0.7, 0.6);
      case 'draw':
        return this.createChord(sampleRate, [440, 659.25], 0.5, 0.5);
      case 'resign':
        return this.createWoodTap(sampleRate, 0.12, 180, 0.8);
      default:
        return this.createWoodTap(sampleRate, 0.07, 300, 0.6);
    }
  }

  // --- Synthesis Utilities ---

  private createWoodTap(sampleRate: number, duration: number, freq: number, damping: number): AudioBuffer {
    const samples = Math.floor(sampleRate * duration);
    const buffer = this.ctx!.createBuffer(1, samples, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < samples; i++) {
      const t = i / sampleRate;
      const env = Math.exp(-t * (damping * 60));
      // Primary wooden thud + transient noise click
      const sine = Math.sin(2 * Math.PI * freq * t);
      const sub = Math.sin(2 * Math.PI * (freq * 0.5) * t) * 0.4;
      const noise = (Math.random() * 2 - 1) * Math.exp(-t * 180) * 0.5;
      data[i] = (sine * 0.6 + sub + noise) * env;
    }
    return buffer;
  }

  private createCaptureImpact(sampleRate: number): AudioBuffer {
    const duration = 0.095;
    const samples = Math.floor(sampleRate * duration);
    const buffer = this.ctx!.createBuffer(1, samples, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < samples; i++) {
      const t = i / sampleRate;
      const env1 = Math.exp(-t * 55);
      const noise1 = (Math.random() * 2 - 1) * Math.exp(-t * 120);
      const wood = Math.sin(2 * Math.PI * 260 * t) * 0.7 + Math.sin(2 * Math.PI * 480 * t) * 0.4;
      
      // Secondary piece collision tap at 20ms
      let tap2 = 0;
      if (t > 0.02) {
        const t2 = t - 0.02;
        tap2 = Math.sin(2 * Math.PI * 340 * t2) * Math.exp(-t2 * 60) * 0.5;
      }

      data[i] = (wood * env1 + noise1 * 0.6 + tap2);
    }
    return buffer;
  }

  private createCastleSequence(sampleRate: number): AudioBuffer {
    const duration = 0.16;
    const samples = Math.floor(sampleRate * duration);
    const buffer = this.ctx!.createBuffer(1, samples, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < samples; i++) {
      const t = i / sampleRate;
      // First piece tap (King)
      const env1 = Math.exp(-t * 50);
      const tap1 = (Math.sin(2 * Math.PI * 320 * t) + (Math.random() * 2 - 1) * 0.3) * env1;

      // Second piece tap (Rook) at 60ms
      let tap2 = 0;
      if (t > 0.065) {
        const t2 = t - 0.065;
        tap2 = (Math.sin(2 * Math.PI * 380 * t2) + (Math.random() * 2 - 1) * 0.3) * Math.exp(-t2 * 50) * 0.85;
      }

      data[i] = tap1 + tap2;
    }
    return buffer;
  }

  private createBellChime(sampleRate: number, freqs: number[], duration: number, amp: number): AudioBuffer {
    const samples = Math.floor(sampleRate * duration);
    const buffer = this.ctx!.createBuffer(1, samples, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < samples; i++) {
      const t = i / sampleRate;
      const env = Math.exp(-t * 12);
      let val = 0;
      for (const f of freqs) {
        val += Math.sin(2 * Math.PI * f * t);
      }
      data[i] = (val / freqs.length) * env * amp;
    }
    return buffer;
  }

  private createChord(sampleRate: number, freqs: number[], duration: number, amp: number): AudioBuffer {
    const samples = Math.floor(sampleRate * duration);
    const buffer = this.ctx!.createBuffer(1, samples, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < samples; i++) {
      const t = i / sampleRate;
      const env = Math.exp(-t * 4.5);
      let val = 0;
      for (const f of freqs) {
        val += Math.sin(2 * Math.PI * f * t);
      }
      data[i] = (val / freqs.length) * env * amp;
    }
    return buffer;
  }

  private createArpeggio(sampleRate: number, notes: number[], duration: number): AudioBuffer {
    const samples = Math.floor(sampleRate * duration);
    const buffer = this.ctx!.createBuffer(1, samples, sampleRate);
    const data = buffer.getChannelData(0);
    const noteDur = duration / notes.length;

    for (let i = 0; i < samples; i++) {
      const t = i / sampleRate;
      const noteIdx = Math.min(notes.length - 1, Math.floor(t / noteDur));
      const noteTime = t - noteIdx * noteDur;
      const freq = notes[noteIdx];
      const env = Math.exp(-noteTime * 14);
      data[i] = Math.sin(2 * Math.PI * freq * noteTime) * env * 0.6;
    }
    return buffer;
  }

  private createBrilliantChime(sampleRate: number): AudioBuffer {
    const duration = 0.45;
    const samples = Math.floor(sampleRate * duration);
    const buffer = this.ctx!.createBuffer(1, samples, sampleRate);
    const data = buffer.getChannelData(0);
    const freqs = [1046.5, 1318.5, 1567.98, 2093.0]; // C6, E6, G6, C7 shimmer

    for (let i = 0; i < samples; i++) {
      const t = i / sampleRate;
      const env = Math.exp(-t * 7);
      let val = 0;
      freqs.forEach((f, idx) => {
        // subtle staggered attack
        const stagger = idx * 0.035;
        if (t >= stagger) {
          const tSub = t - stagger;
          val += Math.sin(2 * Math.PI * f * tSub) * Math.exp(-tSub * 8) * (1 - idx * 0.1);
        }
      });
      data[i] = val * 0.4;
    }
    return buffer;
  }

  private createDescendingWarning(sampleRate: number, freqs: number[], duration: number): AudioBuffer {
    const samples = Math.floor(sampleRate * duration);
    const buffer = this.ctx!.createBuffer(1, samples, sampleRate);
    const data = buffer.getChannelData(0);
    const noteDur = duration / freqs.length;

    for (let i = 0; i < samples; i++) {
      const t = i / sampleRate;
      const idx = Math.min(freqs.length - 1, Math.floor(t / noteDur));
      const noteTime = t - idx * noteDur;
      const f = freqs[idx];
      const env = Math.exp(-noteTime * 10);
      data[i] = Math.sin(2 * Math.PI * f * noteTime) * env * 0.5;
    }
    return buffer;
  }

  private createMutedTick(sampleRate: number, duration: number, freq: number): AudioBuffer {
    const samples = Math.floor(sampleRate * duration);
    const buffer = this.ctx!.createBuffer(1, samples, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < samples; i++) {
      const t = i / sampleRate;
      const env = Math.exp(-t * 40);
      const tone = Math.sin(2 * Math.PI * freq * t) * 0.4;
      const noise = (Math.random() * 2 - 1) * 0.3;
      data[i] = (tone + noise) * env * 0.4;
    }
    return buffer;
  }

  private createBlunderImpact(sampleRate: number): AudioBuffer {
    const duration = 0.32;
    const samples = Math.floor(sampleRate * duration);
    const buffer = this.ctx!.createBuffer(1, samples, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < samples; i++) {
      const t = i / sampleRate;
      const env = Math.exp(-t * 8);
      // Low descending hollow buzz/thud
      const f = 160 - t * 120;
      const osc1 = Math.sin(2 * Math.PI * f * t);
      const osc2 = Math.sin(2 * Math.PI * (f * 1.5) * t) * 0.5;
      data[i] = (osc1 + osc2) * env * 0.65;
    }
    return buffer;
  }

  /**
   * Primary playback method. Verifies enabled status, applies volume, and plays the cached buffer.
   */
  public async play(event: ChessSoundEvent, dedupeKey?: string): Promise<void> {
    if (!this.settings.masterEnabled) return;

    // Check specific event group toggles
    if ((event === 'move' || event === 'move_opponent') && this.settings.moveSounds === false) return;
    if ((event === 'capture' || event === 'castle') && this.settings.captureSounds === false) return;
    if ((event === 'check' || event === 'checkmate') && this.settings.checkSounds === false) return;
    if (['brilliant', 'great', 'best', 'excellent', 'inaccuracy', 'mistake', 'blunder', 'missed_win'].includes(event)) {
      if (this.settings.reviewSounds === false) return;
    }
    if (['win', 'loss', 'draw', 'resign'].includes(event) && this.settings.resultSounds === false) return;

    // Deduplication check: prevent identical audio events for the same move/ply
    if (dedupeKey) {
      if (this.lastPlayedEventKey === dedupeKey) {
        return;
      }
      this.lastPlayedEventKey = dedupeKey;
    }

    // Try Web Audio API first for 0-latency playback
    try {
      await this.init();
      if (this.ctx && this.ctx.state === 'running') {
        let buffer: AudioBuffer | null | undefined = this.bufferCache.get(event);
        if (!buffer) {
          buffer = await this.loadSoundFile(event);
          if (buffer) {
            this.bufferCache.set(event, buffer);
          }
        }

        if (buffer) {
          const source = this.ctx.createBufferSource();
          source.buffer = buffer;

          const gain = this.ctx.createGain();
          gain.gain.value = this.settings.volume;

          source.connect(gain);
          gain.connect(this.ctx.destination);

          source.start(0);
          return;
        }
      }
    } catch (err) {
      // Fall through to HTML5 Audio fallback below
    }

    // Direct HTML5 Audio element fallback (works even if AudioContext is suspended/unsupported)
    const filePath = SOUND_FILES[event];
    if (filePath) {
      try {
        const audio = new Audio(filePath);
        audio.volume = this.settings.volume;
        audio.play().catch(() => {});
      } catch {}
    }
  }

  /**
   * Resolves the primary move audio event from move metadata.
   */
  public resolveMoveSound(params: {
    isCapture?: boolean;
    isCheckmate?: boolean;
    isCheck?: boolean;
    isCastle?: boolean;
    isPromotion?: boolean;
  }): ChessSoundEvent {
    if (params.isCheckmate) return 'checkmate';
    if (params.isCheck) return 'check';
    if (params.isPromotion) return 'promotion';
    if (params.isCastle) return 'castle';
    if (params.isCapture) return 'capture';
    return 'move';
  }

  /**
   * Resolves review audio from Stockfish move classification.
   */
  public resolveReviewSound(classification?: string): ChessSoundEvent | null {
    switch (classification) {
      case 'brilliant': return 'brilliant';
      case 'great': return 'great';
      case 'best': return 'best';
      case 'excellent': return 'excellent';
      case 'inaccuracy': return 'inaccuracy';
      case 'mistake': return 'mistake';
      case 'blunder': return 'blunder';
      case 'missed_win': return 'missed_win';
      default: return null;
    }
  }
}

export const audioManager = new AudioManager();
