import { describe, it, expect } from 'vitest';
import { chessComClient } from '../src/services/chesscom.js';

describe('Chess.com Importer & PGN Parser', () => {
  it('should parse PGN headers accurately', () => {
    const pgn = `[Event "Live Chess"]
[Site "Chess.com"]
[Date "2024.03.15"]
[Round "-"]
[White "magnuscarlsen"]
[Black "hikaru"]
[Result "1-0"]
[ECO "B01"]
[ECOUrl "https://www.chess.com/openings/Scandinavian-Defense"]
[WhiteElo "2830"]
[BlackElo "2820"]

1. e4 d5 2. exd5 Qxd5 3. Nc3 Qa5 1-0`;

    const parsed = chessComClient.parsePgnHeaders(pgn);
    expect(parsed.eco).toBe('B01');
    expect(parsed.opening).toBe('Scandinavian Defense');
    expect(parsed.result).toBe('1-0');
  });

  it('should extract external game ID properly', () => {
    const liveUrl = 'https://www.chess.com/game/live/10482910482';
    const dailyUrl = 'https://www.chess.com/game/daily/987654321';

    expect(chessComClient.extractGameId(liveUrl)).toBe('live_10482910482');
    expect(chessComClient.extractGameId(dailyUrl)).toBe('daily_987654321');
  });
});
