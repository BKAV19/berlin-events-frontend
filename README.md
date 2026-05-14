# What's Happening, Berlin? — Frontend

React + Vite frontend for the Berlin events app.

## Setup

```bash
npm install
npm run dev
```

Opens at http://localhost:5173

## Build for production

```bash
npm run build
```

## Configuration

The API URL is hardcoded in `src/App.jsx`:

```js
const API_BASE_URL = "https://berlin-events-backend-production.up.railway.app";
```

Change it if your backend is at a different URL.

## Deploy to Vercel

1. Push this folder to a GitHub repo
2. Go to https://vercel.com and sign in with GitHub
3. Click "Add New" → "Project"
4. Select this repo
5. Click "Deploy"

Vercel auto-detects Vite and gives you a free URL like `whats-happening-berlin.vercel.app`.
