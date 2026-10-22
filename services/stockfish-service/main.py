import os
import shutil
import chess
import chess.engine
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

app = FastAPI(title="Stockfish Render Engine API", version="19.0.0")

API_KEY = os.getenv("STOCKFISH_API_KEY", "my_stockfish18_secret_key")
STOCKFISH_PATH = os.getenv("STOCKFISH_PATH", "/usr/local/bin/stockfish")

if not os.path.exists(STOCKFISH_PATH):
    system_sf = shutil.which("stockfish")
    if system_sf:
        STOCKFISH_PATH = system_sf

print(f"[Stockfish Render API] Using binary at: {STOCKFISH_PATH}")

def check_auth(x_api_key: str = Header(None)):
    if API_KEY and x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized: Invalid X-API-Key")

class EvalRequest(BaseModel):
    fen: str
    depth: int = 12

class AnalyzeRequest(BaseModel):
    fen: str
    depth: int = 14
    multiPv: int = 3

@app.get("/")
@app.get("/health")
def health():
    return {
        "status": "online",
        "engine": "Stockfish 19",
        "threads": int(os.getenv("STOCKFISH_THREADS", "2")),
        "hash_mb": int(os.getenv("STOCKFISH_HASH", "128"))
    }

@app.post("/evaluate")
async def evaluate_position(req: EvalRequest, x_api_key: str = Header(None)):
    check_auth(x_api_key)
    try:
        board = chess.Board(req.fen)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid FEN: {str(e)}")

    transport, engine = await chess.engine.popen_uci(STOCKFISH_PATH)
    try:
        limit = chess.engine.Limit(depth=req.depth)
        info = await engine.analyse(board, limit)
        score = info["score"].white()
        score_cp = score.score() if not score.is_mate() else None
        score_mate = score.mate() if score.is_mate() else None

        pv_moves = [m.uci() for m in info.get("pv", [])]
        best_uci = pv_moves[0] if pv_moves else None
        best_san = None

        if best_uci:
            try:
                move_obj = chess.Move.from_uci(best_uci)
                best_san = board.san(move_obj)
            except Exception:
                best_san = best_uci

        return {
            "bestMove": best_uci,
            "bestMoveSan": best_san,
            "scoreCp": score_cp if score_cp is not None else (10000 if (score_mate or 0) > 0 else -10000),
            "scoreMate": score_mate,
            "depth": info.get("depth", req.depth),
            "pv": pv_moves,
            "engine": "Stockfish 19"
        }
    finally:
        await engine.quit()

@app.post("/analyze")
async def analyze_position(req: AnalyzeRequest, x_api_key: str = Header(None)):
    check_auth(x_api_key)
    try:
        board = chess.Board(req.fen)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid FEN: {str(e)}")

    transport, engine = await chess.engine.popen_uci(STOCKFISH_PATH)
    try:
        limit = chess.engine.Limit(depth=req.depth)
        infos = await engine.analyse(board, limit, multipv=req.multiPv)

        if not isinstance(infos, list):
            infos = [infos]

        top_moves = []
        best_line_uci = []
        best_line_san = []

        for rank, line_info in enumerate(infos, start=1):
            score = line_info["score"].white()
            score_cp = score.score() if not score.is_mate() else (10000 if (score.mate() or 0) > 0 else -10000)
            score_mate = score.mate() if score.is_mate() else None

            pv_uci = [m.uci() for m in line_info.get("pv", [])]
            pv_san = []

            temp_board = board.copy()
            for u in pv_uci:
                try:
                    m = chess.Move.from_uci(u)
                    pv_san.append(temp_board.san(m))
                    temp_board.push(m)
                except Exception:
                    break

            move_uci = pv_uci[0] if pv_uci else ""
            move_san = pv_san[0] if pv_san else move_uci

            if rank == 1:
                best_line_uci = pv_uci
                best_line_san = pv_san

            top_moves.append({
                "rank": rank,
                "move": move_uci,
                "san": move_san,
                "scoreCp": score_cp,
                "scoreMate": score_mate,
                "depth": line_info.get("depth", req.depth),
                "pv": pv_uci,
                "pvSan": pv_san
            })

        best_move_uci = best_line_uci[0] if best_line_uci else ""
        best_move_san = best_line_san[0] if best_line_san else best_move_uci
        primary_eval = top_moves[0] if top_moves else None

        return {
            "fen": req.fen,
            "bestMove": best_move_uci,
            "bestMoveSan": best_move_san,
            "evaluation": {
                "scoreCp": primary_eval["scoreCp"] if primary_eval else 0,
                "scoreMate": primary_eval["scoreMate"] if primary_eval else None,
                "depth": primary_eval["depth"] if primary_eval else req.depth
            },
            "topMoves": top_moves,
            "bestLine": {
                "uci": best_line_uci,
                "san": best_line_san
            },
            "depth": req.depth,
            "engineName": "Stockfish 19"
        }
    finally:
        await engine.quit()

