FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    stockfish \
    curl \
    ca-certificates \
    tar \
    && (curl -sL https://github.com/official-stockfish/Stockfish/releases/latest/download/stockfish-ubuntu-x86-64-universal.tar -o /tmp/sf.tar \
        && tar -xf /tmp/sf.tar -C /tmp \
        && mv /tmp/stockfish/stockfish-ubuntu-x86-64-universal /usr/local/bin/stockfish \
        && chmod +x /usr/local/bin/stockfish \
        && rm -rf /tmp/sf* || true) \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

ENV PORT=8000
ENV STOCKFISH_PATH=/usr/local/bin/stockfish
ENV STOCKFISH_THREADS=2
ENV STOCKFISH_HASH=128

EXPOSE 8000

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]

