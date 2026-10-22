import React, { useState } from 'react';
import { audioManager, AudioSettings } from '../services/audioManager';
import { catSpeechService } from '../services/catSpeechService';
import { Volume2, VolumeX, X, Sliders, Check } from 'lucide-react';

interface SoundSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsChange?: () => void;
}

export const SoundSettingsModal: React.FC<SoundSettingsModalProps> = ({
  isOpen,
  onClose,
  onSettingsChange
}) => {
  const [settings, setSettings] = useState<AudioSettings>(() => audioManager.getSettings());
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(() => catSpeechService.isVoiceEnabled());

  if (!isOpen) return null;

  const updateSetting = <K extends keyof AudioSettings>(key: K, val: AudioSettings[K]) => {
    const updated = { ...settings, [key]: val };
    setSettings(updated);
    audioManager.saveSettings({ [key]: val });
    if (onSettingsChange) onSettingsChange();

    // Play a preview sound if unmuting or changing volume
    if (key === 'volume' || (key === 'masterEnabled' && val === true)) {
      audioManager.play('move');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div 
        className="w-full max-w-md bg-[#16181D] border border-[#2A303C] rounded-2xl shadow-2xl p-6 text-white font-sans space-y-5"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[#2A303C] pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#222733] border border-[#2E3646] flex items-center justify-center text-[#6CFF93]">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black tracking-wide uppercase">Sound & Audio Settings</h3>
              <p className="text-xs text-zinc-400">Authentic Chess.com audio & Cat Coach speech</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-[#222733] transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Master Sound Switch */}
        <div className="flex items-center justify-between p-3.5 bg-[#1F232B] border border-[#2E3646] rounded-xl">
          <div className="flex items-center gap-3">
            {settings.masterEnabled ? (
              <Volume2 className="w-5 h-5 text-[#6CFF93]" />
            ) : (
              <VolumeX className="w-5 h-5 text-rose-400" />
            )}
            <div>
              <div className="text-xs font-black">Master Audio</div>
              <div className="text-[11px] text-zinc-400">
                {settings.masterEnabled ? 'Authentic Chess.com sounds active' : 'All audio muted'}
              </div>
            </div>
          </div>

          <button
            onClick={() => updateSetting('masterEnabled', !settings.masterEnabled)}
            className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
              settings.masterEnabled
                ? 'bg-[#6CFF93] text-black shadow-sm font-black'
                : 'bg-zinc-800 text-zinc-400'
            }`}
          >
            {settings.masterEnabled ? 'ON' : 'OFF'}
          </button>
        </div>

        {/* Instructor Personality Selection */}
        <div className="space-y-2.5 p-3.5 bg-[#1F232B] border border-[#2E3646] rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-300">Chess Instructor</span>
            <span className="text-[10px] font-bold text-amber-400">Stockfish 18 Voice Commentary</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {/* Viswanathan Anand Option */}
            <button
              type="button"
              onClick={() => {
                catSpeechService.setCoach('anand');
                setSettings(prev => ({ ...prev }));
                catSpeechService.testVoice('anand');
              }}
              className={`p-2.5 rounded-xl border text-left transition-all flex items-center gap-2.5 ${
                catSpeechService.getCoach() === 'anand'
                  ? 'bg-amber-950/50 border-amber-400 text-white shadow-sm ring-1 ring-amber-400/50'
                  : 'bg-[#181B22] border-[#2A303C] text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <div className="w-9 h-9 rounded-full overflow-hidden bg-amber-500/20 border border-amber-400 flex items-center justify-center shrink-0">
                <img src="/anand-coach.png" alt="Viswanathan Anand" className="w-full h-full object-cover" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-black truncate text-amber-300">🇮🇳 Vishy Anand</div>
                <div className="text-[10px] text-zinc-400 truncate">World Champion</div>
              </div>
            </button>

            {/* SpongeBob Option */}
            <button
              type="button"
              onClick={() => {
                catSpeechService.setCoach('spongebob');
                setSettings(prev => ({ ...prev }));
                catSpeechService.testVoice('spongebob');
              }}
              className={`p-2.5 rounded-xl border text-left transition-all flex items-center gap-2.5 ${
                catSpeechService.getCoach() === 'spongebob'
                  ? 'bg-amber-950/40 border-amber-400 text-white shadow-sm'
                  : 'bg-[#181B22] border-[#2A303C] text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <div className="w-9 h-9 rounded-full overflow-hidden bg-amber-400/20 border border-amber-400 flex items-center justify-center shrink-0">
                <img src="/spongebob-coach.png" alt="SpongeBob" className="w-full h-full object-contain" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-black truncate text-amber-300">🧽 SpongeBob</div>
                <div className="text-[10px] text-zinc-400 truncate">I'm ready!</div>
              </div>
            </button>

            {/* Cat Coach Option */}
            <button
              type="button"
              onClick={() => {
                catSpeechService.setCoach('cat');
                setSettings(prev => ({ ...prev }));
                catSpeechService.testVoice('cat');
              }}
              className={`p-2.5 rounded-xl border text-left transition-all flex items-center gap-2.5 ${
                catSpeechService.getCoach() === 'cat'
                  ? 'bg-emerald-950/40 border-[#6CFF93] text-white shadow-sm'
                  : 'bg-[#181B22] border-[#2A303C] text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <div className="w-9 h-9 rounded-full overflow-hidden bg-emerald-500/20 border border-[#6CFF93] flex items-center justify-center shrink-0">
                <img src="/cat-coach.png" alt="Cat Coach" className="w-full h-full object-contain translate-y-0.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-black truncate text-[#6CFF93]">🐱 Cat Coach</div>
                <div className="text-[10px] text-zinc-400 truncate">Mittens</div>
              </div>
            </button>
          </div>
        </div>

        {/* Spoken Voice Commentary Toggle */}
        <div className="flex items-center justify-between p-3.5 bg-[#1F232B] border border-[#2E3646] rounded-xl">
          <div>
            <div className="text-xs font-black flex items-center gap-1.5">
              <span>Instructor Voice Speech</span>
              <span className="px-1.5 py-0.5 rounded text-[9px] bg-[#6CFF93]/20 text-[#6CFF93] font-bold border border-[#6CFF93]/40">Aloud</span>
            </div>
            <div className="text-[11px] text-zinc-400">
              Speaks move classifications and tactical coaching aloud
            </div>
          </div>
          <div className="flex items-center gap-2">
            {voiceEnabled && (
              <button
                type="button"
                onClick={() => catSpeechService.testVoice()}
                className="px-2 py-1 rounded-lg text-[10px] font-bold bg-[#262C38] hover:bg-[#2E3646] text-zinc-300 transition-colors"
                title="Preview instructor voice"
              >
                Test Voice
              </button>
            )}
            <button
              onClick={() => {
                const next = catSpeechService.toggleVoice();
                setVoiceEnabled(next);
              }}
              className={`w-10 h-5 flex items-center rounded-full p-0.5 transition-colors duration-200 ${
                voiceEnabled ? 'bg-[#6CFF93] justify-end' : 'bg-zinc-700 justify-start'
              }`}
            >
              <span className={`w-4 h-4 rounded-full transition-transform ${
                voiceEnabled ? 'bg-black' : 'bg-zinc-400'
              }`} />
            </button>
          </div>
        </div>

        {/* Volume Slider */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-zinc-300">Volume</span>
            <span className="font-mono text-zinc-400">{Math.round(settings.volume * 100)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={settings.volume}
            disabled={!settings.masterEnabled}
            onChange={e => updateSetting('volume', parseFloat(e.target.value))}
            className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-[#6CFF93] disabled:opacity-30"
          />
        </div>

        {/* Event Sound Toggles */}
        <div className="space-y-2 pt-2 border-t border-[#2A303C]">
          <span className="text-[11px] font-black uppercase text-zinc-400 tracking-wider">Sound Events</span>

          <div className="space-y-1.5">
            {[
              { key: 'moveSounds', label: 'Move Sounds', desc: 'Piece clicks and board taps' },
              { key: 'captureSounds', label: 'Capture & Castle', desc: 'Piece impacts and castling' },
              { key: 'checkSounds', label: 'Check & Checkmate', desc: 'Alert bells and checkmate chords' },
              { key: 'reviewSounds', label: 'Review Classification', desc: 'Brilliant, Blunder, Best, Inaccuracy' },
              { key: 'resultSounds', label: 'Game Outcomes', desc: 'Win, Loss, Draw chords' }
            ].map(item => {
              const enabled = settings[item.key as keyof AudioSettings] as boolean;
              return (
                <div
                  key={item.key}
                  className="flex items-center justify-between py-2 px-3 rounded-xl bg-[#1B1E26] border border-[#262C38]/70"
                >
                  <div>
                    <div className="text-xs font-bold text-zinc-200">{item.label}</div>
                    <div className="text-[10px] text-zinc-400">{item.desc}</div>
                  </div>
                  <button
                    disabled={!settings.masterEnabled}
                    onClick={() => updateSetting(item.key as keyof AudioSettings, !enabled)}
                    className={`w-10 h-5 flex items-center rounded-full p-0.5 transition-colors duration-200 ${
                      enabled && settings.masterEnabled ? 'bg-[#6CFF93] justify-end' : 'bg-zinc-700 justify-start'
                    } disabled:opacity-30`}
                  >
                    <span className={`w-4 h-4 rounded-full transition-transform ${
                      enabled && settings.masterEnabled ? 'bg-black' : 'bg-zinc-400'
                    }`} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sound Theme Selection */}
        <div className="space-y-2 pt-2 border-t border-[#2A303C]">
          <span className="text-[11px] font-black uppercase text-zinc-400 tracking-wider">Sound Theme</span>
          <div className="grid grid-cols-3 gap-2">
            {(['classic', 'wood', 'minimal'] as const).map(theme => (
              <button
                key={theme}
                onClick={() => {
                  updateSetting('theme', theme);
                  audioManager.play('move');
                }}
                className={`py-2 px-3 rounded-xl text-xs font-bold capitalize border transition-all flex items-center justify-center gap-1.5 ${
                  settings.theme === theme
                    ? 'bg-[#6CFF93] text-black border-[#6CFF93] font-black'
                    : 'bg-[#1F232B] text-zinc-300 border-[#2E3646] hover:border-zinc-500'
                }`}
              >
                {settings.theme === theme && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                <span>{theme}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Footer Done */}
        <div className="pt-2 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-[#222733] hover:bg-[#2C3342] text-white text-xs font-bold border border-[#2E3646] transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

