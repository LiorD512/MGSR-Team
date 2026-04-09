# MGSR Backend — Transfermarkt Proxy

Proxy service for Transfermarkt data (avoids CORS when calling from the web app).

## Run locally

```bash
cd mgsr-backend
npm install
npm run dev
```

Server runs at http://localhost:8080

## Endpoints

- `GET /health` — Health check
- `GET /api/transfermarkt/search?q=...` — Search players by name
- `GET /api/transfermarkt/player?url=...` — Get player details by Transfermarkt URL
- `GET /api/transfermarkt/releases?min=0&max=5000000&page=1` — Latest free agent transfers
