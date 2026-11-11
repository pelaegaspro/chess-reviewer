# AetherChess — Chess Analysis Application

A full-stack chess-analysis project combining a React interface, a Node.js API and Stockfish-based engine integration.

## Engineering overview

- **Client:** React 19, TypeScript, Vite, Tailwind CSS and `react-chessboard`
- **Server:** Node.js, Express, TypeScript and backend APIs
- **Chess logic:** `chess.js` for board/game logic and a Stockfish 18 package for analysis workflows
- **Data and integration:** PostgreSQL/PGlite packages, Firebase dependencies and JWT/bcrypt tooling
- **Testing:** Server-side Vitest configuration

The codebase demonstrates an interactive frontend paired with a separate engine/API service. This README describes dependencies visible in the repository, not a claim that every integration has been production-validated.

## Repository layout

```text
client/     # React/Vite user interface
server/     # Express API, engine integration and tests
services/   # Additional services
Dockerfile
docker-compose.yml
render.yaml
```

## Local development

Requires Node.js and npm.

```bash
git clone https://github.com/pelaegaspro/chess-reviewer.git
cd chess-reviewer

# Terminal 1
cd server
npm ci
npm run dev

# Terminal 2 (from the project root)
cd client
npm ci
npm run dev
```

Some capabilities may require environment variables, database configuration or external services; inspect server configuration before running the complete stack. Never commit secret keys or production credentials.

## Build and tests

```bash
# From the root, after dependencies are installed in client/ and server/
npm run build
npm test
```

## Technical challenges

Engine-driven analysis needs careful handling of CPU-intensive computation, request cancellation, client/server state, responsive board interactions and predictable API errors. These are relevant areas for continued hardening as the project evolves.

**Maintainer:** [Pelae Gaspro](https://github.com/pelaegaspro)
