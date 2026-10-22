import React, { useState, useEffect, useCallback } from 'react';
import { MoveAnalysis, ExplanationLevel } from '../types';
import { ClassificationBadge } from './ClassificationBadge';
import { parsePieceFigurine, getDynamicCommentary } from '../utils/chessText';
import { catSpeechService, CoachPersonality } from '../services/catSpeechService';
import { 
  Lightbulb, ArrowRight, ChevronRight, ChevronLeft, Compass, 
  Bookmark, ExternalLink, Sparkles, Check, Volume2, VolumeX, RotateCcw 
} from 'lucide-react';

interface CatCoachBubbleProps {
  currentMove?: MoveAnalysis;
  openingName?: string;
  showExplain: boolean;
  onToggleExplain: () => void;
  onNext: () => void;
  hasNext: boolean;
  onPrevious?: () => void;
  hasPrevious?: boolean;
  showBest?: boolean;
  onToggleBest?: () => void;
  isSummary?: boolean;
  summaryQuote?: string;
  explanationLevel?: ExplanationLevel;
  onChangeExplanationLevel?: (lvl: ExplanationLevel) => void;
  onOpenInChessHelper?: () => void;
  onBookmark?: () => void;
  isBookmarked?: boolean;
  customExplanation?: string | null;
  isLoadingExplanation?: boolean;
}

export const CatCoachBubble: React.FC<CatCoachBubbleProps> = ({
  currentMove,
  openingName,
  showExplain,
  onToggleExplain,
  onNext,
  hasNext,
  onPrevious,
  hasPrevious,
  showBest,
  onToggleBest,
  isSummary = false,
  summaryQuote,
  explanationLevel = 'intermediate',
  onChangeExplanationLevel,
  onOpenInChessHelper,
  onBookmark,
  isBookmarked = false,
  customExplanation,
  isLoadingExplanation = false,
}) => {
  const commentary = getDynamicCommentary(currentMove, openingName);
  const { cleanSan } = parsePieceFigurine(currentMove?.played_move_san || '');
  const bestFigurine = parsePieceFigurine(currentMove?.best_move_san || '');

  // Numerical Stockfish evaluation
  let evalFormatted = '+0.00';
  if (currentMove) {
    const cp = currentMove.evaluation_after;
    const pawns = (cp / 100).toFixed(2);
    evalFormatted = cp > 0 ? `+${pawns}` : pawns;
  }

  // Voice & Coach Personality Integration
  const [activeCoach, setActiveCoach] = useState<CoachPersonality>(() => catSpeechService.getCoach());
  const [isVoiceEnabled, setIsVoiceEnabled] = useState<boolean>(() => catSpeechService.isVoiceEnabled());
  const [isCatSpeaking, setIsCatSpeaking] = useState<boolean>(false);

  useEffect(() => {
    const unsubSpeaking = catSpeechService.subscribeSpeaking(speaking => {
      setIsCatSpeaking(speaking);
    });
    const unsubCoach = catSpeechService.subscribeCoach(coach => {
      setActiveCoach(coach);
    });
    return () => {
      unsubSpeaking();
      unsubCoach();
    };
  }, []);

  const handleSwitchCoach = (coach: CoachPersonality) => {
    catSpeechService.setCoach(coach);
    setActiveCoach(coach);
    // Give immediate greeting / test voice
    setTimeout(() => {
      handleSpeakCurrent();
    }, 50);
  };

  const handleSpeakCurrent = useCallback(() => {
    if (!catSpeechService.isVoiceEnabled()) return;

    if (isSummary) {
      const greeting = activeCoach === 'anand'
        ? "Namaste and welcome. I am Viswanathan Anand. Let's analyze your game step by step to uncover the key strategic turning points."
        : activeCoach === 'spongebob'
        ? "I'm ready, I'm ready! Welcome to the Bikini Bottom Game Review! Let's see what we can learn from your game, ah-ha-ha-ha!"
        : (summaryQuote || "Review complete! Let's see what we can learn from your game.");
      catSpeechService.speak(greeting);
      return;
    }

    if (currentMove) {
      catSpeechService.speakMoveReview({
        classification: currentMove.classification,
        playedMoveSan: currentMove.played_move_san,
        bestMoveSan: currentMove.best_move_san,
        explanation: customExplanation || commentary.analysisText,
        openingName
      });
    }
  }, [activeCoach, isSummary, summaryQuote, currentMove, customExplanation, commentary.analysisText, openingName]);

  useEffect(() => {
    handleSpeakCurrent();
  }, [currentMove?.ply, currentMove?.played_move_san, isSummary, summaryQuote, handleSpeakCurrent]);

  const getMoveSummaryText = () => {
    if (!currentMove) return 'Start review to analyze the game.';
    const move = currentMove.played_move_san || cleanSan;
    const cls = currentMove.classification;

    if (activeCoach === 'anand') {
      switch (cls) {
        case 'book':
          return `${move} is a book move`;
        case 'best':
          return `${move} is the best move`;
        case 'brilliant':
          return `Magnificent! ${move} is brilliant!!`;
        case 'great':
          return `${move} is a great move!`;
        case 'excellent':
          return `${move} is an excellent move`;
        case 'good':
          return `${move} is a solid move`;
        case 'inaccuracy':
          return `${move} is an inaccuracy`;
        case 'mistake':
          return `${move} is a tactical mistake`;
        case 'blunder':
          return `${move} is a blunder`;
        case 'missed_win':
          return `${move} missed a forced win`;
        default:
          return `${move} was played`;
      }
    }

    if (activeCoach === 'spongebob') {
      switch (cls) {
        case 'book':
          return `Order up! ${move} is a book move!`;
        case 'best':
          return `I'm ready! ${move} is the best move!`;
        case 'brilliant':
          return `Holy Krabby Patties! ${move} is brilliant!!`;
        case 'great':
          return `Sweet mother of pearl! ${move} is great!`;
        case 'excellent':
          return `Aye-aye Captain! ${move} is excellent!`;
        case 'good':
          return `${move} is a solid move! Patrick approved.`;
        case 'inaccuracy':
          return `Barnacles! ${move} is an inaccuracy!`;
        case 'mistake':
          return `Tartar sauce! ${move} is a mistake!`;
        case 'blunder':
          return `ME HOY MINOY! ${move} is a blunder!`;
        case 'missed_win':
          return `Sweet mother of Pearl, ${move} missed a win!`;
        default:
          return `${move} was played!`;
      }
    }

    switch (cls) {
      case 'book':
        return `${move} is a book move`;
      case 'best':
        return `${move} is the best move`;
      case 'brilliant':
        return `${move} is brilliant!!`;
      case 'great':
        return `${move} is a great move!`;
      case 'excellent':
        return `${move} is an excellent move`;
      case 'good':
        return `${move} is a good move`;
      case 'inaccuracy':
        return `${move} is an inaccuracy`;
      case 'mistake':
        return `${move} is a mistake`;
      case 'blunder':
        return `${move} is a blunder`;
      case 'missed_win':
        return `${move} is a missed win`;
      default:
        return `${move} was played`;
    }
  };

  const getAnalysisDisplayNarrative = () => {
    if (activeCoach === 'anand' && currentMove) {
      return catSpeechService.buildAnandReviewText({
        classification: currentMove.classification,
        playedMoveSan: currentMove.played_move_san,
        bestMoveSan: currentMove.best_move_san,
        openingName
      });
    }
    if (activeCoach === 'spongebob' && currentMove) {
      return catSpeechService.buildSpongeBobReviewText({
        classification: currentMove.classification,
        playedMoveSan: currentMove.played_move_san,
        bestMoveSan: currentMove.best_move_san,
        openingName
      });
    }
    return customExplanation || commentary.analysisText;
  };

  const isAnand = activeCoach === 'anand';
  const isSpongeBob = activeCoach === 'spongebob';
  let coachAvatarSrc = '/anand-coach.png';
  let coachDisplayName = '🇮🇳 Vishy Anand';
  if (activeCoach === 'spongebob') {
    coachAvatarSrc = '/spongebob-coach.png';
    coachDisplayName = '🧽 SpongeBob';
  } else if (activeCoach === 'cat') {
    coachAvatarSrc = '/cat-coach.png';
    coachDisplayName = '🐱 Cat Coach';
  }

  return (
    <div className="w-full flex flex-col gap-2.5">
      {/* Coach Avatar + Speech Bubble Row */}
      <div className="flex items-start gap-3">
        {/* Interactive Coach Avatar with Speaking Halo Animation */}
        <div
          onClick={handleSpeakCurrent}
          title={`Click to hear ${coachDisplayName} speak aloud`}
          className="relative flex-shrink-0 cursor-pointer group"
        >
          <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full overflow-hidden bg-[#2d2a27] border-2 shadow-lg flex items-center justify-center transition-all duration-200 group-hover:scale-105 ${
            isCatSpeaking
              ? isAnand
                ? 'border-amber-400 ring-4 ring-amber-400/40 scale-105'
                : isSpongeBob
                ? 'border-amber-400 ring-4 ring-amber-300/50 scale-105'
                : 'border-[#6CFF93] ring-4 ring-[#6CFF93]/35 scale-105'
              : isAnand
                ? 'border-amber-500/80 group-hover:border-amber-400'
                : isSpongeBob
                ? 'border-amber-400/80 group-hover:border-amber-300'
                : 'border-[#3d3835] group-hover:border-[#81b64c]'
          }`}>
            <img
              src={coachAvatarSrc}
              alt={coachDisplayName}
              className={`w-full h-full object-cover transform transition-transform duration-200 ${
                isAnand ? 'scale-105' : isSpongeBob ? 'scale-110' : 'scale-110 translate-y-1'
              } ${isCatSpeaking ? 'scale-115' : 'group-hover:scale-110'}`}
            />
          </div>
          {/* Online status indicator dot with animated ping when speaking */}
          <span className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-[#21201d] ${
            isCatSpeaking
              ? isAnand ? 'bg-amber-400 animate-ping' : isSpongeBob ? 'bg-amber-400 animate-ping' : 'bg-[#6CFF93] animate-ping'
              : isAnand ? 'bg-amber-400' : isSpongeBob ? 'bg-amber-400' : 'bg-[#81b64c]'
          }`} />
          {isCatSpeaking && (
            <span className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-[#21201d] ${
              isAnand ? 'bg-amber-400' : isSpongeBob ? 'bg-amber-400' : 'bg-[#6CFF93]'
            }`} />
          )}
        </div>

        {/* Speech Bubble */}
        <div className="relative flex-1 bg-white text-[#21201d] rounded-2xl p-3.5 shadow-md">
          {/* Triangular Tail on Left */}
          <div
            className="absolute -left-2 top-4 w-0 h-0 border-t-[8px] border-t-transparent border-b-[8px] border-b-transparent border-r-[10px] border-r-white"
            aria-hidden="true"
          />

          {isSummary ? (
            /* Summary Intro Mode */
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-zinc-100 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-black uppercase tracking-wider ${
                    isAnand ? 'text-amber-700' : isSpongeBob ? 'text-amber-600' : 'text-[#0A8A36]'
                  }`}>
                    {coachDisplayName}
                  </span>
                  {isCatSpeaking && (
                    <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold border animate-pulse ${
                      isAnand
                        ? 'bg-amber-50 text-amber-900 border-amber-300'
                        : isSpongeBob 
                        ? 'bg-amber-50 text-amber-800 border-amber-200' 
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full animate-ping ${
                        isAnand ? 'bg-amber-500' : isSpongeBob ? 'bg-amber-500' : 'bg-emerald-500'
                      }`}></span>
                      Speaking
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  {/* Instructor Switcher Pills */}
                  <div className="inline-flex items-center bg-zinc-100 p-0.5 rounded-full border border-zinc-200 text-[10px]">
                    <button
                      type="button"
                      onClick={() => handleSwitchCoach('anand')}
                      className={`px-2 py-0.5 rounded-full font-bold transition-all flex items-center gap-1 ${
                        isAnand
                          ? 'bg-amber-500 text-slate-950 shadow-sm'
                          : 'text-zinc-600 hover:text-zinc-900'
                      }`}
                      title="Switch to Viswanathan Anand (5-time World Champion)"
                    >
                      <span>🇮🇳</span>
                      <span>Anand</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSwitchCoach('spongebob')}
                      className={`px-2 py-0.5 rounded-full font-bold transition-all flex items-center gap-1 ${
                        isSpongeBob
                          ? 'bg-amber-400 text-amber-950 shadow-sm'
                          : 'text-zinc-500 hover:text-zinc-800'
                      }`}
                      title="Switch to SpongeBob SquarePants"
                    >
                      <span>🧽</span>
                      <span className="hidden sm:inline">SpongeBob</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSwitchCoach('cat')}
                      className={`px-2 py-0.5 rounded-full font-bold transition-all flex items-center gap-1 ${
                        activeCoach === 'cat'
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'text-zinc-500 hover:text-zinc-800'
                      }`}
                      title="Switch to Cat Coach"
                    >
                      <span>🐱</span>
                      <span className="hidden sm:inline">Cat</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const enabled = catSpeechService.toggleVoice();
                      setIsVoiceEnabled(enabled);
                      if (enabled) handleSpeakCurrent();
                    }}
                    className={`p-1.5 rounded-lg border transition-colors flex items-center gap-1 text-xs font-bold ${
                      isVoiceEnabled
                        ? isSpongeBob ? 'bg-amber-50 text-amber-700 border-amber-300' : 'bg-emerald-50 text-emerald-700 border-emerald-300'
                        : 'bg-zinc-100 text-zinc-400 border-zinc-200'
                    }`}
                    title={isVoiceEnabled ? 'Mute Voice' : 'Enable Voice'}
                  >
                    {isVoiceEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                    <span className="text-[10px] hidden sm:inline">{isVoiceEnabled ? 'Voice On' : 'Muted'}</span>
                  </button>
                  {isVoiceEnabled && (
                    <button
                      type="button"
                      onClick={handleSpeakCurrent}
                      className="p-1.5 rounded-lg border border-zinc-200 hover:bg-zinc-50 text-zinc-600 text-xs font-medium"
                      title="Replay Voice"
                    >
                      <RotateCcw className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
              <div className="text-sm font-medium leading-snug text-[#262421]">
                {isSpongeBob
                  ? "I'm ready, I'm ready! Welcome to the Bikini Bottom Game Review! Let's see what we can learn from your game, ah-ha-ha-ha!"
                  : (summaryQuote || "Okay, let's see what we can learn from your game then.")}
              </div>
            </div>
          ) : (
            /* Move-by-Move Mode */
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                {/* Left: Classification Icon + Move Description */}
                <div className="flex items-center gap-2 font-sans min-w-0">
                  {currentMove?.classification && (
                    <ClassificationBadge classification={currentMove.classification} size="md" />
                  )}
                  <span className="text-sm font-bold text-[#1f1e1b] tracking-tight truncate">
                    {getMoveSummaryText()}
                  </span>
                </div>

                {/* Right: Instructor Switcher + Sound & Voice Controls + Eval Score Pill */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {/* Instructor Switcher Pills */}
                  <div className="inline-flex items-center bg-zinc-100 p-0.5 rounded-full border border-zinc-200 text-[10px]">
                    <button
                      type="button"
                      onClick={() => handleSwitchCoach('anand')}
                      className={`px-1.5 py-0.5 rounded-full font-bold transition-all flex items-center gap-0.5 ${
                        isAnand
                          ? 'bg-amber-500 text-slate-950 shadow-sm'
                          : 'text-zinc-600 hover:text-zinc-900'
                      }`}
                      title="Switch to Viswanathan Anand (5-time World Champion)"
                    >
                      <span>🇮🇳</span>
                      <span className="hidden md:inline">Anand</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSwitchCoach('spongebob')}
                      className={`px-1.5 py-0.5 rounded-full font-bold transition-all flex items-center gap-0.5 ${
                        isSpongeBob
                          ? 'bg-amber-400 text-amber-950 shadow-sm'
                          : 'text-zinc-500 hover:text-zinc-800'
                      }`}
                      title="Switch to SpongeBob SquarePants"
                    >
                      <span>🧽</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSwitchCoach('cat')}
                      className={`px-1.5 py-0.5 rounded-full font-bold transition-all flex items-center gap-0.5 ${
                        activeCoach === 'cat'
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'text-zinc-500 hover:text-zinc-800'
                      }`}
                      title="Switch to Cat Coach"
                    >
                      <span>🐱</span>
                    </button>
                  </div>

                  {/* Speaking animated indicator waves */}
                  {isCatSpeaking && (
                    <div className={`hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold border animate-pulse ${
                      isSpongeBob 
                        ? 'bg-amber-50 text-amber-800 border-amber-300'
                        : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    }`}>
                      <span className={`w-1 h-2.5 rounded-full animate-bounce [animation-delay:-0.3s] ${isSpongeBob ? 'bg-amber-500' : 'bg-emerald-600'}`}></span>
                      <span className={`w-1 h-2.5 rounded-full animate-bounce [animation-delay:-0.15s] ${isSpongeBob ? 'bg-amber-500' : 'bg-emerald-600'}`}></span>
                      <span className={`w-1 h-2.5 rounded-full animate-bounce ${isSpongeBob ? 'bg-amber-500' : 'bg-emerald-600'}`}></span>
                    </div>
                  )}

                  {/* Voice Replay Button */}
                  {isVoiceEnabled && (
                    <button
                      type="button"
                      onClick={handleSpeakCurrent}
                      className="p-1.5 rounded-lg border border-zinc-200 hover:bg-zinc-100 text-zinc-500 hover:text-zinc-800 transition-colors"
                      title={`Replay ${isSpongeBob ? 'SpongeBob' : 'Cat Coach'} Voice`}
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Voice Toggle Button */}
                  <button
                    type="button"
                    onClick={() => {
                      const enabled = catSpeechService.toggleVoice();
                      setIsVoiceEnabled(enabled);
                      if (enabled) handleSpeakCurrent();
                    }}
                    className={`p-1.5 rounded-lg border transition-colors ${
                      isVoiceEnabled
                        ? isSpongeBob
                          ? 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                        : 'bg-zinc-100 text-zinc-400 border-zinc-200 hover:text-zinc-600'
                    }`}
                    title={isVoiceEnabled ? 'Voice Commentary: ON (click to mute)' : 'Voice Commentary: MUTED (click to enable)'}
                  >
                    {isVoiceEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                  </button>

                  {/* Subtle Eval Score Pill */}
                  {currentMove && (
                    <span className="font-mono text-xs font-bold text-zinc-600 bg-zinc-100 border border-zinc-200 px-2 py-0.5 rounded-full flex-shrink-0">
                      {evalFormatted}
                    </span>
                  )}
                </div>
              </div>

              {/* Move Spoken Commentary Body */}
              <div className="text-sm font-medium leading-snug text-[#262421] pt-0.5">
                {getAnalysisDisplayNarrative()}
              </div>

              {/* Expanded Coaching Explanation */}
              {showExplain && (
                <div className="pt-2 border-t border-zinc-200/80 text-xs text-zinc-700 leading-relaxed space-y-2 animate-in fade-in duration-200">
                  {/* Explanation Level Pills */}
                  {onChangeExplanationLevel && (
                    <div className="flex items-center justify-between gap-1 pb-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Depth</span>
                      <div className="inline-flex bg-zinc-100 p-0.5 rounded-lg border border-zinc-200 text-[10px]">
                        {(['beginner', 'intermediate', 'advanced'] as ExplanationLevel[]).map(lvl => (
                          <button
                            key={lvl}
                            type="button"
                            onClick={() => onChangeExplanationLevel(lvl)}
                            className={`px-2 py-0.5 rounded-md font-semibold capitalize transition-all ${
                              explanationLevel === lvl
                                ? 'bg-white text-zinc-900 shadow-sm font-bold'
                                : 'text-zinc-500 hover:text-zinc-800'
                            }`}
                          >
                            {lvl}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {isLoadingExplanation ? (
                    <div className="py-2 text-center text-zinc-400 font-medium animate-pulse text-xs">
                      Consulting Stockfish 18 & {isAnand ? 'Vishy Anand' : isSpongeBob ? 'SpongeBob' : 'Cat Coach'}...
                    </div>
                  ) : (
                    <p className="font-normal text-zinc-800 leading-relaxed">
                      {getAnalysisDisplayNarrative()}
                    </p>
                  )}

                  {currentMove?.best_move_san && currentMove.best_move_san !== currentMove.played_move_san && (
                    <div className={`flex items-center gap-1.5 font-medium px-2.5 py-1 rounded-lg border ${
                      isAnand
                        ? 'text-amber-900 bg-amber-50/80 border-amber-300'
                        : isSpongeBob
                        ? 'text-amber-800 bg-amber-50 border-amber-200'
                        : 'text-emerald-700 bg-emerald-50 border-emerald-200'
                    }`}>
                      <span className="font-bold">
                        {isAnand ? 'Anand recommends:' : isSpongeBob ? 'SpongeBob recommends:' : 'Better was:'}
                      </span>
                      <span className="font-extrabold">{bestFigurine.cleanSan || currentMove.best_move_san}</span>
                    </div>
                  )}

                  {/* Action row inside bubble */}
                  <div className="flex items-center justify-between pt-2 border-t border-zinc-100 text-[11px]">
                    {onOpenInChessHelper && (
                      <button
                        type="button"
                        onClick={onOpenInChessHelper}
                        className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-800 font-bold hover:underline"
                        title="Analyze this exact position in Chess Helper"
                      >
                        <Sparkles className="w-3 h-3 text-emerald-600" />
                        <span>Open in Chess Helper</span>
                      </button>
                    )}

                    {onBookmark && (
                      <button
                        type="button"
                        onClick={onBookmark}
                        className={`inline-flex items-center gap-1 font-semibold px-2 py-0.5 rounded border transition-colors ${
                          isBookmarked
                            ? 'bg-amber-100 text-amber-800 border-amber-300'
                            : 'bg-zinc-50 text-zinc-600 hover:text-zinc-900 border-zinc-200'
                        }`}
                        title="Bookmark position to Saved Positions"
                      >
                        {isBookmarked ? <Check className="w-3 h-3 text-amber-600" /> : <Bookmark className="w-3 h-3" />}
                        <span>{isBookmarked ? 'Saved' : 'Save Position'}</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons Under Speech Bubble */}
      {!isSummary && (
        <div className="flex items-center gap-2 pl-1 sm:pl-2">
          {/* Explain Button (Chess.com Charcoal Pill) */}
          <button
            type="button"
            onClick={onToggleExplain}
            className={`flex-1 py-2 px-3 rounded-full text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-98 ${
              showExplain
                ? 'bg-[#45423e] text-white border border-zinc-500'
                : 'bg-[#363431] hover:bg-[#45423e] text-zinc-200 border border-[#484541]'
            }`}
          >
            <Lightbulb className="w-3.5 h-3.5 text-amber-300" />
            <span>Explain</span>
          </button>

          {/* Toggle Best Move Arrow */}
          {onToggleBest && (
            <button
              type="button"
              onClick={onToggleBest}
              className={`py-2 px-3 rounded-full text-xs font-bold transition-all flex items-center justify-center gap-1 border shadow-sm ${
                showBest
                  ? 'bg-cyan-950/80 border-cyan-500 text-cyan-300'
                  : 'bg-[#363431] hover:bg-[#45423e] text-zinc-300 border-[#484541]'
              }`}
              title="Show best move arrow"
            >
              <Compass className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Best</span>
            </button>
          )}

          {/* Previous Move Button */}
          {onPrevious && (
            <button
              type="button"
              onClick={onPrevious}
              disabled={!hasPrevious}
              className="py-2 px-3 rounded-full text-xs font-bold bg-[#363431] hover:bg-[#45423e] disabled:opacity-30 disabled:cursor-not-allowed text-zinc-300 border border-[#484541] transition-all flex items-center justify-center gap-1"
              title="Previous move"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}

          {/* Next Move Button (Chess.com Vibrant Green Pill) */}
          <button
            type="button"
            onClick={onNext}
            disabled={!hasNext}
            className="flex-1 py-2 px-4 rounded-full text-xs font-black bg-[#81b64c] hover:bg-[#95c85b] disabled:opacity-30 disabled:cursor-not-allowed text-white transition-all flex items-center justify-center gap-1.5 shadow-md active:scale-98"
          >
            <span>Next</span>
            <ArrowRight className="w-4 h-4 stroke-[3]" />
          </button>
        </div>
      )}
    </div>
  );
};
