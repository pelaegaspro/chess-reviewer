import { describe, it, expect } from 'vitest';
import { classifier, cpToWinProb } from '../src/engine/classification.js';
import { coach } from '../src/engine/coach.js';

describe('Chess Analysis Engine & Classification', () => {
  it('should calculate accurate win probabilities from centipawns', () => {
    // 0 cp should equal 50% win probability
    const equalWinProb = cpToWinProb(0);
    expect(equalWinProb).toBeCloseTo(0.5, 2);

    // +300 cp (winning advantage) should be ~85% win probability
    const winningWinProb = cpToWinProb(300);
    expect(winningWinProb).toBeGreaterThan(0.8);

    // -300 cp should be ~15% win probability
    const losingWinProb = cpToWinProb(-300);
    expect(losingWinProb).toBeLessThan(0.2);
  });

  it('should correctly classify Best Move when cp loss is 0', () => {
    const res = classifier.classifyMove({
      moveNumber: 5,
      ply: 9,
      color: 'w',
      playedMoveUci: 'e2e4',
      playedMoveSan: 'e4',
      bestMoveUci: 'e2e4',
      bestMoveSan: 'e4',
      evalBeforeCp: 20,
      evalAfterCp: 25
    });

    expect(res.classification).toBe('best');
    expect(res.centipawnLoss).toBe(0);
    expect(res.accuracy).toBe(100);
  });

  it('should classify Inaccuracy when cp loss is moderate', () => {
    const res = classifier.classifyMove({
      moveNumber: 15,
      ply: 29,
      color: 'w',
      playedMoveUci: 'd2d4',
      playedMoveSan: 'd4',
      bestMoveUci: 'c2c4',
      bestMoveSan: 'c4',
      evalBeforeCp: 50,
      evalAfterCp: -40 // loss of 90 cp
    });

    expect(res.classification).toBe('inaccuracy');
    expect(res.centipawnLoss).toBe(90);
    expect(res.accuracy).toBeLessThan(95);
    expect(res.accuracy).toBeGreaterThan(0);
  });

  it('should classify Blunder when huge evaluation swing occurs', () => {
    const res = classifier.classifyMove({
      moveNumber: 24,
      ply: 47,
      color: 'w',
      playedMoveUci: 'd1h5',
      playedMoveSan: 'Qh5',
      bestMoveUci: 'f1f7',
      bestMoveSan: 'Rxf7',
      evalBeforeCp: 150,
      evalAfterCp: -350 // swing of 500 cp
    });

    expect(res.classification).toBe('blunder');
    expect(res.centipawnLoss).toBe(500);
    expect(res.accuracy).toBeLessThan(10);
  });

  it('should generate grounded coaching explanations for blunders', () => {
    const explanation = coach.generateExplanation({
      moveNumber: 24,
      color: 'b',
      playedMoveUci: 'd8h4',
      playedMoveSan: 'Qh4',
      bestMoveUci: 'f8f7',
      bestMoveSan: 'Rxf7',
      classification: 'blunder',
      centipawnLoss: 450,
      evalBeforeCp: -50,
      evalAfterCp: 400,
      pv: ['f8f7', 'e1e8'],
      fenBefore: 'r1b2rk1/pp3ppp/2n1p3/3p4/3P3q/2NB4/PPP2PPP/R2QR1K1 b - - 1 24',
      fenAfter: 'r1b2rk1/pp3ppp/2n1p3/3p4/3P4/2NB3q/PPP2PPP/R2QR1K1 w - - 2 25'
    });

    expect(explanation).toBeDefined();
    expect(explanation).toContain('Qh4');
    expect(explanation).toContain('Rxf7');
  });

  it('should calculate overall game accuracy correctly', () => {
    const accuracies = [100, 95, 90, 85, 80];
    const avg = classifier.calculateGameAccuracy(accuracies);
    expect(avg).toBe(90);
  });
});
