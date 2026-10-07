# 🖥️ Temporal AI Investigator — Frontend (White Theme)

This is the interactive React + TypeScript + Tailwind CSS web interface for **Temporal AI Investigator** (PSI02 — Video Understanding & Temporal Reasoning).

## Features
- **White Theme (Light Mode)**: Clean, high-readability design system with slate-50/white cards, modern typography, and refined shadows.
- **Real Video Ingestion**: Users can upload any custom MP4/AVI/MOV video.
- **Dynamic Reasoning**: Questions and answers are computed from real detected tracks and events, with zero hardcoding.
- **Interactive Video Player**: HTML5 playback with SVG zone boundary overlays and evidence range scrubbing.
- **Gantt Temporal Memory Timeline**: Synchronized playback needle linked to object lifespan bars.
- **Verified Timestamp Evidence**: Click **▶ Play Evidence Clip** to seek straight to the ground-truth video segment.

---

## 🚀 Running the Frontend

Ensure the FastAPI backend is running on `http://127.0.0.1:8000`.

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Vite Dev Server
```bash
npm run dev
```

Open `http://localhost:5173/` in your browser.

### 3. Build for Production
```bash
npm run build
```
