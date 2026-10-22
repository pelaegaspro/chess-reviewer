import { Communicate } from 'edge-tts-universal';

// In-memory cache for synthesized audio buffers
const audioCache = new Map<string, Buffer>();
const MAX_CACHE_ITEMS = 600;

export interface TTSOptions {
  text: string;
  coach?: 'anand' | 'spongebob' | 'cat';
}

export class TTSService {
  /**
   * Synthesizes text to high-fidelity neural MP3 audio.
   * For 'anand': Uses Microsoft Azure Neural Indian English 'en-IN-PrabhatNeural'
   * calibrated for calm, unhurried, scholarly grandmaster cadence and pronunciation.
   * For 'spongebob': Uses 'en-US-GuyNeural' with bright, fast, animated pitch.
   * For 'cat': Uses 'en-US-JennyNeural' with warm, articulate tone.
   */
  async synthesize(options: TTSOptions): Promise<Buffer> {
    const text = (options.text || '').trim();
    if (!text) {
      throw new Error('Text is required for TTS synthesis');
    }

    const coach = options.coach || 'anand';
    const cacheKey = `${coach}:${text}`;
    if (audioCache.has(cacheKey)) {
      return audioCache.get(cacheKey)!;
    }

    let voice = 'en-IN-PrabhatNeural';
    let rate = '-4%';
    let pitch = '-2Hz';

    if (coach === 'spongebob') {
      voice = 'en-US-GuyNeural';
      rate = '+15%';
      pitch = '+10Hz';
    } else if (coach === 'cat') {
      voice = 'en-US-JennyNeural';
      rate = '+3%';
      pitch = '+4Hz';
    }

    const comm = new Communicate(text, {
      voice,
      rate,
      pitch
    });

    const chunks: Buffer[] = [];
    for await (const chunk of comm.stream()) {
      if (chunk.type === 'audio' && chunk.data) {
        chunks.push(chunk.data as Buffer);
      }
    }

    const totalBuffer = Buffer.concat(chunks);

    // Save in cache
    if (audioCache.size >= MAX_CACHE_ITEMS) {
      const firstKey = audioCache.keys().next().value;
      if (firstKey) audioCache.delete(firstKey);
    }
    audioCache.set(cacheKey, totalBuffer);

    return totalBuffer;
  }
}

export const ttsService = new TTSService();

