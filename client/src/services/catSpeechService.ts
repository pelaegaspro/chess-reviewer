/**
 * Coach Voice & Speech Synthesis Service
 * Provides authentic Chess.com Game Review coach spoken commentary
 * supporting both SpongeBob SquarePants and Cat Coach (Mittens).
 * Powered by HTML5 Web Speech API (SpeechSynthesis) with Chromium timing bug fixes.
 */

export type CoachPersonality = 'anand' | 'spongebob' | 'cat';

export interface SpeechOptions {
  priority?: boolean;
  onStart?: () => void;
  onEnd?: () => void;
}

const STORAGE_KEY_VOICE = 'aether_coach_voice_enabled';
const STORAGE_KEY_COACH = 'aether_active_coach';

class CoachSpeechService {
  private enabled: boolean = true;
  private activeCoach: CoachPersonality = 'anand';
  private isSpeaking: boolean = false;
  private currentAudio: HTMLAudioElement | null = null;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private listeners: Set<(speaking: boolean) => void> = new Set();
  private coachListeners: Set<(coach: CoachPersonality) => void> = new Set();
  private preferredVoice: SpeechSynthesisVoice | null = null;
  private speakTimeoutId: any = null;
  private resumeIntervalId: any = null;

  constructor() {
    this.loadSettings();
    this.initVoices();
    this.setupGestureUnlock();
  }

  private loadSettings(): void {
    try {
      const savedVoice = localStorage.getItem(STORAGE_KEY_VOICE) ?? localStorage.getItem('aether_cat_coach_voice_enabled');
      this.enabled = savedVoice !== null ? savedVoice === 'true' : true;

      const savedCoach = localStorage.getItem(STORAGE_KEY_COACH);
      if (savedCoach === 'anand' || savedCoach === 'spongebob' || savedCoach === 'cat') {
        this.activeCoach = savedCoach;
      } else {
        this.activeCoach = 'anand';
      }
    } catch {
      this.enabled = true;
      this.activeCoach = 'anand';
    }
  }

  /**
   * Automatically unlocks and primes SpeechSynthesis on the user's first interaction.
   * Eliminates browser autoplay blocks across Chrome, Safari, Edge, and Firefox.
   */
  private setupGestureUnlock(): void {
    if (typeof window === 'undefined') return;

    const unlock = () => {
      try {
        if ('speechSynthesis' in window) {
          if (window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
          }
          this.initVoices();
        }
      } catch {}

      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('click', unlock);
      window.removeEventListener('keydown', unlock);
    };

    window.addEventListener('pointerdown', unlock, { once: true, passive: true });
    window.addEventListener('click', unlock, { once: true, passive: true });
    window.addEventListener('keydown', unlock, { once: true, passive: true });
  }

  public initVoices(): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    const select = () => {
      const voices = window.speechSynthesis.getVoices();
      if (!voices || voices.length === 0) return;

      // Priority list: friendly, high-clarity English voices
      const targetVoices = [
        'Google US English',
        'Samantha',
        'Daniel',
        'Microsoft Jenny Online (Natural)',
        'Microsoft Guy Online (Natural)',
        'Microsoft David',
        'Microsoft Zira',
        'Karen',
        'Alex'
      ];

      for (const name of targetVoices) {
        const found = voices.find(v => v.name.toLowerCase().includes(name.toLowerCase()));
        if (found) {
          this.preferredVoice = found;
          return;
        }
      }

      const enVoice = voices.find(v => v.lang.startsWith('en-US') || v.lang.startsWith('en'));
      this.preferredVoice = enVoice || voices[0] || null;
    };

    select();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = select;
    }
  }

  public getVoiceForCoach(coach: CoachPersonality): SpeechSynthesisVoice | null {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return null;

    if (coach === 'anand') {
      // 1. Look for authentic Indian English voices (en-IN, Ravi, Veena, Heera, etc.)
      const indianVoice = voices.find(v => {
        const lang = v.lang.toLowerCase();
        const name = v.name.toLowerCase();
        return (
          lang.includes('en-in') ||
          lang.includes('en_in') ||
          name.includes('india') ||
          name.includes('ravi') ||
          name.includes('veena') ||
          name.includes('heera') ||
          name.includes('kavya') ||
          name.includes('prabhat') ||
          name.includes('neerja') ||
          name.includes('mohan')
        );
      });
      if (indianVoice) return indianVoice;

      // 2. High clarity mature, calm baritone English voice for grandmaster Anand
      const matureVoice = voices.find(v => {
        const name = v.name.toLowerCase();
        return (
          name.includes('guy online (natural)') ||
          name.includes('david') ||
          name.includes('daniel') ||
          name.includes('google us english') ||
          name.includes('alex')
        );
      });
      if (matureVoice) return matureVoice;
    }

    return this.preferredVoice || voices[0] || null;
  }

  public isVoiceEnabled(): boolean {
    return this.enabled;
  }

  public setVoiceEnabled(enabled: boolean): void {
    this.enabled = enabled;
    try {
      localStorage.setItem(STORAGE_KEY_VOICE, String(enabled));
      localStorage.setItem('aether_cat_coach_voice_enabled', String(enabled));
    } catch {}

    if (!enabled) {
      this.stop();
    }
  }

  public toggleVoice(): boolean {
    this.setVoiceEnabled(!this.enabled);
    return this.enabled;
  }

  public getCoach(): CoachPersonality {
    return this.activeCoach;
  }

  public setCoach(coach: CoachPersonality): void {
    this.activeCoach = coach;
    try {
      localStorage.setItem(STORAGE_KEY_COACH, coach);
    } catch {}

    this.coachListeners.forEach(cb => {
      try { cb(coach); } catch {}
    });
  }

  public subscribeCoach(listener: (coach: CoachPersonality) => void): () => void {
    this.coachListeners.add(listener);
    listener(this.activeCoach);
    return () => this.coachListeners.delete(listener);
  }

  public getIsSpeaking(): boolean {
    return this.isSpeaking;
  }

  public subscribeSpeaking(listener: (speaking: boolean) => void): () => void {
    this.listeners.add(listener);
    listener(this.isSpeaking);
    return () => this.listeners.delete(listener);
  }

  private setSpeakingState(speaking: boolean): void {
    this.isSpeaking = speaking;
    this.listeners.forEach(cb => {
      try { cb(speaking); } catch {}
    });
  }

  public stop(): void {
    try {
      if (this.currentAudio) {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
        this.currentAudio = null;
      }
      if (this.speakTimeoutId) {
        clearTimeout(this.speakTimeoutId);
        this.speakTimeoutId = null;
      }
      if (this.resumeIntervalId) {
        clearInterval(this.resumeIntervalId);
        this.resumeIntervalId = null;
      }
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      this.setSpeakingState(false);
      this.currentUtterance = null;
      (window as any).__coachUtterance = null;
    } catch {}
  }

  /**
   * Converts algebraic chess notation (SAN) into natural spoken English.
   * e.g. "Nf3" -> "Knight to f 3", "Bxf7+" -> "Bishop takes f 7, check!", "O-O" -> "Castles kingside"
   */
  public sanToSpokenWords(san: string): string {
    if (!san) return '';

    let clean = san.trim();
    if (clean === 'O-O') return 'Castles kingside';
    if (clean === 'O-O-O') return 'Castles queenside';

    let suffix = '';
    if (clean.includes('#')) {
      suffix = ', checkmate!';
      clean = clean.replace('#', '');
    } else if (clean.includes('+')) {
      suffix = ', check!';
      clean = clean.replace('+', '');
    }

    const isCapture = clean.includes('x');
    clean = clean.replace('x', ' takes ');

    const pieceChar = clean.charAt(0);
    let pieceName = '';

    if (pieceChar === 'Q') {
      pieceName = 'Queen ';
      clean = clean.substring(1);
    } else if (pieceChar === 'K') {
      pieceName = 'King ';
      clean = clean.substring(1);
    } else if (pieceChar === 'R') {
      pieceName = 'Rook ';
      clean = clean.substring(1);
    } else if (pieceChar === 'B') {
      pieceName = 'Bishop ';
      clean = clean.substring(1);
    } else if (pieceChar === 'N') {
      pieceName = 'Knight ';
      clean = clean.substring(1);
    }

    if (pieceName && !isCapture) {
      pieceName += 'to ';
    }

    const parts = (pieceName + clean + suffix).replace(/([a-h])([1-8])/g, '$1 $2');
    return parts.trim();
  }

  /**
   * Formats nautical, high-energy SpongeBob SquarePants Game Review commentary.
   */
  public buildSpongeBobReviewText(params: {
    classification?: string;
    playedMoveSan?: string;
    bestMoveSan?: string;
    explanation?: string;
    openingName?: string;
  }): string {
    const { classification, playedMoveSan, bestMoveSan, openingName } = params;
    const cls = classification?.toLowerCase() || 'good';
    const playedWord = playedMoveSan ? this.sanToSpokenWords(playedMoveSan) : '';
    const bestWord = bestMoveSan ? this.sanToSpokenWords(bestMoveSan) : '';

    switch (cls) {
      case 'brilliant':
        return `Holy Krabby Patties! That's a BRILLIANT move! You sacrificed material with ${playedWord} to unleash an unstoppable attack worthy of King Neptune! Ah-ha-ha-ha!`;

      case 'great':
        return `Sweet mother of pearl! A GREAT move! ${playedWord} was the only winning secret formula in this position! I'm ready!`;

      case 'best':
        return `I'm ready, I'm ready! That's the BEST move on the board! ${playedWord} keeps your pieces cooking to perfection! Gary would be so proud!`;

      case 'excellent':
        return `Aye-aye, Captain! An excellent move! ${playedWord} keeps the Krusty Krab sailing ahead of your opponent!`;

      case 'good':
        return `Good move! Solid as a rock, Patrick would love this ${playedWord}.`;

      case 'book':
        if (openingName) {
          return `Order up! Classic book move in the ${openingName}! Straight from the Krusty Krab employee handbook!`;
        }
        return `Order up! A textbook opening book move!`;

      case 'inaccuracy':
        if (bestWord) {
          return `Barnacles! That's an inaccuracy! Squidward is playing the clarinet in our defense! Better was ${bestWord}!`;
        }
        return `Barnacles! That's an inaccuracy, letting your opponent equalize!`;

      case 'mistake':
        if (bestWord) {
          return `Tartar sauce! A mistake! Plankton is trying to steal our initiative! Better was ${bestWord}!`;
        }
        return `Tartar sauce! A mistake! You missed a tactical threat!`;

      case 'blunder':
        if (bestWord) {
          return `ME HOY MINOY! Blunder alert! We dropped our golden spatulas into the deep sea! Oh no, better was ${bestWord}!`;
        }
        return `ME HOY MINOY! That's a giant blunder! The evaluation swung into the Mariana Trench!`;

      case 'missed_win':
        if (bestWord) {
          return `Sweet mother of Pearl, you missed a win! The buried treasure was right there with ${bestWord}!`;
        }
        return `You missed a forced win! Neptune wept!`;

      default:
        return `Look at that, ${playedWord} was played! What a nautical move!`;
    }
  }

  /**
   * Formats authentic Chess.com Cat Coach commentary.
   */
  public buildCatReviewText(params: {
    classification?: string;
    playedMoveSan?: string;
    bestMoveSan?: string;
    explanation?: string;
    openingName?: string;
  }): string {
    const { classification, playedMoveSan, bestMoveSan, explanation, openingName } = params;
    const cls = classification?.toLowerCase() || 'good';
    const playedWord = playedMoveSan ? this.sanToSpokenWords(playedMoveSan) : '';
    const bestWord = bestMoveSan ? this.sanToSpokenWords(bestMoveSan) : '';

    switch (cls) {
      case 'brilliant':
        return `Brilliant move! You sacrificed material with ${playedWord} to seize a winning advantage.`;

      case 'great':
        return `Great find! In a critical tactical position, ${playedWord} was the only winning resource.`;

      case 'best':
        return `Best move! ${playedWord} optimizes your pieces and keeps the advantage.`;

      case 'excellent':
        return `Excellent move. ${playedWord} keeps the pressure firmly on your opponent.`;

      case 'good':
        return `A solid move, though there was a slightly sharper line available.`;

      case 'book':
        if (openingName) {
          return `Book move. Standard opening theory in the ${openingName}.`;
        }
        return `Book move, following established opening theory.`;

      case 'inaccuracy':
        if (bestWord) {
          return `An inaccuracy. Better was ${bestWord}.`;
        }
        return `An inaccuracy. This lets your opponent equalize.`;

      case 'mistake':
        if (bestWord) {
          return `A mistake! You missed a tactical threat. Better was ${bestWord}.`;
        }
        return `A mistake! This surrenders the initiative.`;

      case 'blunder':
        if (bestWord) {
          return `A blunder! Oh no, this hangs material. Better was ${bestWord}.`;
        }
        return `A blunder! This altered the evaluation dramatically.`;

      case 'missed_win':
        if (bestWord) {
          return `You missed a win! You had a decisive winning move with ${bestWord}.`;
        }
        return `You missed a forced win in this position.`;

      default:
        if (explanation) return explanation;
        return `${playedWord} was played.`;
    }
  }

  /**
   * Formats calm, profound, master-level Viswanathan Anand Game Review commentary.
   */
  public buildAnandReviewText(params: {
    classification?: string;
    playedMoveSan?: string;
    bestMoveSan?: string;
    explanation?: string;
    openingName?: string;
  }): string {
    const { classification, playedMoveSan, bestMoveSan, openingName } = params;
    const cls = classification?.toLowerCase() || 'good';
    const playedWord = playedMoveSan ? this.sanToSpokenWords(playedMoveSan) : '';
    const bestWord = bestMoveSan ? this.sanToSpokenWords(bestMoveSan) : '';

    switch (cls) {
      case 'brilliant':
        return `Magnificent tactical vision! You sacrificed material with ${playedWord} to seize complete control. This is the caliber of calculation we see in classical World Championship play.`;

      case 'great':
        return `A brilliant find. ${playedWord} was the only winning continuation in a very sharp position. Splendid calculation under pressure.`;

      case 'best':
        return `Very precise. ${playedWord} is the strongest move on the board, coordinating your pieces and controlling the key squares.`;

      case 'excellent':
        return `An excellent choice. ${playedWord} maintains healthy pressure on your opponent without conceding any ground.`;

      case 'good':
        return `A solid, stable move. Looking deeper, there was an active try with ${bestWord}.`;

      case 'book':
        if (openingName) {
          return `Standard theoretical preparation in the ${openingName}. Following established grandmaster lines.`;
        }
        return `Standard opening book move, following classical master theory.`;

      case 'inaccuracy':
        if (bestWord) {
          return `A slight imprecision here. It releases some of the tension. More energetic was ${bestWord} to keep the initiative.`;
        }
        return `A slight imprecision, allowing your opponent counterplay.`;

      case 'mistake':
        if (bestWord) {
          return `A tactical mistake. In sharp positions, every tempo counts. The correct idea was ${bestWord}.`;
        }
        return `A mistake that hands the initiative to your opponent.`;

      case 'blunder':
        if (bestWord) {
          return `A serious oversight. This concedes significant material. You needed ${bestWord} to keep the position sound.`;
        }
        return `A critical blunder that heavily shifts the balance of the game.`;

      case 'missed_win':
        if (bestWord) {
          return `You let a decisive win slip away. Finding ${bestWord} would have sealed the victory immediately.`;
        }
        return `You missed a clear winning continuation in this position.`;

      default:
        return `${playedWord} was played.`;
    }
  }

  public buildSpokenReviewText(params: {
    classification?: string;
    playedMoveSan?: string;
    bestMoveSan?: string;
    explanation?: string;
    openingName?: string;
  }): string {
    if (this.activeCoach === 'anand') {
      return this.buildAnandReviewText(params);
    }
    if (this.activeCoach === 'spongebob') {
      return this.buildSpongeBobReviewText(params);
    }
    return this.buildCatReviewText(params);
  }

  /**
   * Speaks raw text or formatted commentary aloud.
   * Prioritizes ultra-realistic Neural TTS (en-IN-PrabhatNeural for Viswanathan Anand)
   * with seamless automatic fallback to HTML5 Web Speech API.
   */
  public speak(text: string, options?: SpeechOptions): void {
    if (!this.enabled || !text) return;
    if (typeof window === 'undefined') return;

    this.stop();

    // 1. Try real neural audio stream from server (authentic human-like voice)
    try {
      const cleanText = text.trim();
      const ttsUrl = `/api/engine/tts?text=${encodeURIComponent(cleanText)}&coach=${this.activeCoach}`;
      const audio = new Audio(ttsUrl);
      this.currentAudio = audio;

      let started = false;

      audio.onplay = () => {
        started = true;
        this.setSpeakingState(true);
        options?.onStart?.();
      };

      audio.onended = () => {
        this.setSpeakingState(false);
        this.currentAudio = null;
        options?.onEnd?.();
      };

      audio.onerror = () => {
        if (!started) {
          this.fallbackBrowserSpeak(cleanText, options);
        }
      };

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          if (!started) {
            this.fallbackBrowserSpeak(cleanText, options);
          }
        });
      }
      return;
    } catch {
      this.fallbackBrowserSpeak(text, options);
    }
  }

  /**
   * Client-side fallback using Web Speech API (SpeechSynthesis)
   */
  public fallbackBrowserSpeak(text: string, options?: SpeechOptions): void {
    if (!this.enabled || !text) return;
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    try {
      window.speechSynthesis.cancel();
      if (this.speakTimeoutId) {
        clearTimeout(this.speakTimeoutId);
        this.speakTimeoutId = null;
      }
      if (this.resumeIntervalId) {
        clearInterval(this.resumeIntervalId);
        this.resumeIntervalId = null;
      }

      // Chromium workaround: wait 60ms for the browser audio thread to process cancel
      this.speakTimeoutId = setTimeout(() => {
        if (!this.enabled) return;
        if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }

        if (!this.preferredVoice) {
          this.initVoices();
        }

        const utterance = new SpeechSynthesisUtterance(text);
        const coachVoice = this.getVoiceForCoach(this.activeCoach);
        if (coachVoice) {
          utterance.voice = coachVoice;
        } else if (this.preferredVoice) {
          utterance.voice = this.preferredVoice;
        }

        // Voice Profile Tuning based on Coach Personality
        if (this.activeCoach === 'spongebob') {
          utterance.pitch = 1.55; // Comedic, bright SpongeBob pitch
          utterance.rate = 1.18;  // Fast, energetic, optimistic tempo
        } else if (this.activeCoach === 'anand') {
          utterance.pitch = 0.98; // Calm, dignified, natural grandmaster pitch
          utterance.rate = 0.95;  // Relaxed, articulate, composed tempo (never over-tempo)
        } else {
          utterance.pitch = 1.05; // Friendly, warm Cat coach pitch
          utterance.rate = 1.02;  // Standard coaching tempo
        }
        utterance.volume = 1.0;

        utterance.onstart = () => {
          this.setSpeakingState(true);
          options?.onStart?.();

          // Watchdog timer to prevent pause bug
          if (this.resumeIntervalId) clearInterval(this.resumeIntervalId);
          this.resumeIntervalId = setInterval(() => {
            if (window.speechSynthesis.speaking && window.speechSynthesis.paused) {
              window.speechSynthesis.resume();
            }
          }, 4000);
        };

        utterance.onend = () => {
          this.setSpeakingState(false);
          this.currentUtterance = null;
          (window as any).__coachUtterance = null;
          if (this.resumeIntervalId) {
            clearInterval(this.resumeIntervalId);
            this.resumeIntervalId = null;
          }
          options?.onEnd?.();
        };

        utterance.onerror = (e) => {
          if (e.error !== 'interrupted' && e.error !== 'canceled') {
            console.warn('[CoachSpeech] Notice:', e.error);
          }
          this.setSpeakingState(false);
          this.currentUtterance = null;
          (window as any).__coachUtterance = null;
          if (this.resumeIntervalId) {
            clearInterval(this.resumeIntervalId);
            this.resumeIntervalId = null;
          }
        };

        this.currentUtterance = utterance;
        (window as any).__coachUtterance = utterance;

        window.speechSynthesis.speak(utterance);
      }, 60);
    } catch (err) {
      console.warn('[CoachSpeech] Speak failed:', err);
    }
  }

  /**
   * High-level method to speak a game review move directly.
   */
  public speakMoveReview(params: {
    classification?: string;
    playedMoveSan?: string;
    bestMoveSan?: string;
    explanation?: string;
    openingName?: string;
  }): void {
    if (!this.enabled) return;
    const text = this.buildSpokenReviewText(params);
    this.speak(text);
  }

  /**
   * Test voice preview with signature instructor greeting.
   */
  public testVoice(coach?: CoachPersonality): void {
    const target = coach || this.activeCoach;
    const oldCoach = this.activeCoach;
    this.activeCoach = target;

    let phrase = "Meow! I'm your Cat Coach, ready to analyze your chess game with Stockfish!";
    if (target === 'anand') {
      phrase = "Namaste! I am Viswanathan Anand. Let us examine the board with patience and tactical precision.";
    } else if (target === 'spongebob') {
      phrase = "I'm ready, I'm ready! I'm your SpongeBob Chess Instructor! Let's play some chess, ah-ha-ha-ha!";
    }

    this.speak(phrase, {
      onEnd: () => {
        this.activeCoach = oldCoach;
      }
    });
  }
}

export const catSpeechService = new CoachSpeechService();
export const coachSpeechService = catSpeechService;
