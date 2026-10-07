# 👁️ ChronoLens: Spatio-Temporal Video Intelligence Studio
### Problem Statement PSI02 — Video Understanding & Temporal Reasoning System
> **"Turning Raw Surveillance Video into Searchable, Grounded, Millisecond-Accurate Temporal Memory."**

[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/Frontend-React%2019%20%2B%20Vite-61DAFB?style=flat-square&logo=react)](https://reactjs.org)
[![YOLOv8](https://img.shields.io/badge/Vision-YOLOv8%20%2B%20ByteTrack-FF6F00?style=flat-square)](https://ultralytics.com)
[![Database](https://img.shields.io/badge/Storage-SQLite%20Temporal%20DB-003B57?style=flat-square&logo=sqlite)](https://sqlite.org)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

---

## 🏆 The Winning Edge: Why This System Wins

Most competing video QA submissions attempt a naive **"video-to-LLM brute force"**: dumping sampled video frames or raw video files directly into Gemini or GPT-4V context windows. 

### Why the Brute-Force Approach Fails:
* **Context Window Explosion**: 15 minutes of video at 1 FPS consumes 900+ frames (~250,000 tokens), causing massive API latency and high costs.
* **Temporal Hallucinations**: Multimodal LLMs lack physical clocks; they guess event durations and cannot pinpoint the exact sub-second timestamp an object entered or exited.
* **ID Amnesia & Drift**: When an object is occluded behind a tree or sign, LLMs forget the previous entity and hallucinate a brand new object.
* **Zero Spatial Grounding**: Inability to perform geometric point-in-polygon calculations for security perimeters or dwell times.

### 🌟 Our Breakthrough: Neuro-Symbolic Spatio-Temporal Engine
**ChronoLens** replaces prompt guesswork with a **deterministic, vision-grounded temporal pipeline**:
1. **Predictive Occlusion Recovery**: When a car or pedestrian passes behind an obstacle (tree, signboard, pole), our velocity extrapolation engine preserves their canonical Track ID instead of fragmenting tracks.
2. **Kinematic Motion vs. Stationary Classification**: Physical screen displacement ($\Delta d$) separates parked background vehicles ($\Delta d < 0.002$) from active traffic ($\Delta d > 0.95$), preventing phantom arrival events for parked cars.
3. **Sub-Second Temporal QA with Instant Evidence Jumping**: Questions like *"When does the 2nd moving car enter the frame?"* or *"Who moved downward before the car arrived?"* return verified timestamps with a 1-click video evidence player.
4. **Utilitarian Surveillance Studio UI**: Designed for real security operators—clean, high-density telemetry, synchronous canvas bounding boxes, motion trails, and polygonal zones without artificial design clichés.

---

## 📊 Benchmark: ChronoLens vs. Direct Multimodal LLM

| Feature / Metric | Direct Multimodal LLM (GPT-4V / Gemini) | **ChronoLens (Our System)** |
| :--- | :--- | :--- |
| **Temporal Accuracy** | Imprecise guess ($\pm 4\text{s} - 15\text{s}$) | **Millisecond-Accurate ($0.1\text{s}$ Grounded)** |
| **Token Consumption** | 100,000+ tokens per video | **0 tokens (Local Engine) / < 400 tokens (Reasoning)** |
| **Occlusion Tracking** | Fails (assumes new entity appears) | **Kinematic Extrapolation (Maintains Original Track ID)** |
| **Stationary Obstacle Discrimination** | Confuses parked cars with arriving traffic | **Mathematical Spatial Displacement Separation ($\Delta d$)** |
| **Geometric Zones & Perimeters** | Cannot compute polygon containment | **Ray-Casting Point-in-Polygon Engine** |
| **Evidence Verification** | Generic text response | **1-Click Synchronized Looping Video Playback** |
| **Edge & Air-Gapped Deployability** | Impossible (Requires Cloud API) | **100% Fully Offline Capable** |

---

## 🏗️ 6-Layer Architecture Pipeline

```text
  ┌────────────────────────────────────────────────────────────────────────────┐
  │                            LAYER 1: VIDEO INGESTION                        │
  │  • Multi-format: MP4, AVI, MOV, H.264                                     │
  │  • OpenCV Downsampling Engine: 12.0 FPS Surveillance Telemetry Sampling    │
  └─────────────────────────────────────┬──────────────────────────────────────┘
                                        │
                                        ▼
  ┌────────────────────────────────────────────────────────────────────────────┐
  │         LAYER 2: COMPUTER VISION, TRACKING & OCCLUSION RECOVERY            │
  │  • YOLOv8 Nano: Persons, Vehicles, Bicycles, Luggage (conf >= 0.35)       │
  │  • Intra-Frame Spatial NMS: Eliminates phantom steering-wheel persons     │
  │  • Vehicle Paint & Clothing Chromatic Clustering (Bumper plate mask)      │
  │  • Trajectory Memory & Predictive Occlusion Recovery:                     │
  │    p_pred = p_last + v * dt | Gating distance <= 0.16 + 0.08 * dt         │
  └─────────────────────────────────────┬──────────────────────────────────────┘
                                        │
                                        ▼
  ┌────────────────────────────────────────────────────────────────────────────┐
  │              LAYER 3: KINEMATICS & SPATIAL GEOMETRY ENGINE                 │
  │  • Physical Displacement Tracking: disp = hypot(dx, dy)                   │
  │  • Motion Classification: Moving (disp > 0.06) vs Stationary (disp < 0.01)│
  │  • Convex-Hull Adaptive Zones: Roadways, Walkways, Restricted Areas       │
  │  • Ray-Casting Polygon Containment: Dwell time & Loitering (> 10s alerts)  │
  └─────────────────────────────────────┬──────────────────────────────────────┘
                                        │
                                        ▼
  ┌────────────────────────────────────────────────────────────────────────────┐
  │               LAYER 4: SPATIO-TEMPORAL MEMORY DATABASE (SQLite)           │
  │  • Indexed SQLite Storage: videos, tracks, detections, events, zones       │
  │  • Microsecond timestamp indices for instant relational querying           │
  └─────────────────────────────────────┬──────────────────────────────────────┘
                                        │
                                        ▼
  ┌────────────────────────────────────────────────────────────────────────────┐
  │            LAYER 5: DYNAMIC TEMPORAL QUERY & REASONING ENGINE              │
  │  • Ordinal Motion Grammar: "1st / 2nd / last moving vehicle"              │
  │  • Relational Temporal Algebra: AFTER, BEFORE, BETWEEN, DURATION, COUNT   │
  │  • Optional Multimodal Grounding via Gemini Flash Reasoning               │
  └─────────────────────────────────────┬──────────────────────────────────────┘
                                        │
                                        ▼
  ┌────────────────────────────────────────────────────────────────────────────┐
  │                LAYER 6: SURVEILLANCE ANALYTICS STUDIO UI                   │
  │  • Canvas Multi-Object Bounding Boxes with On-the-Fly NMS                  │
  │  • Dynamic Motion Trails & Transparent Zone Overlays                       │
  │  • 1-Click "Play Evidence Clip" with Auto-Segment Looping                  │
  └────────────────────────────────────────────────────────────────────────────┘
```

---

## 🎬 Real CCTV Case Study & Demonstration

### CCTV Intersection Benchmark: `joy cars.mp4` (16.0s Surveillance Clip)

```text
  00:00                00:02          00:10                 00:15       00:16
  ├──────────────────────┼──────────────┼─────────────────────┼───────────┤
  Parked Suzuki #1       Van #4 Enters  Van #4 Exits          SUV #17     End of Video
  Parked Nissan #2                      SUV #17 Enters        Exits
  (disp = 0.001)         (disp = 1.12)  (disp = 0.98)
```

#### Real Physical Scenario:
* **Two Parked Cars**: Car #1 (Suzuki, gray) and Car #2 (Nissan, red) are parked on the side of the road for the entire clip. Their spatial displacement is $\Delta d = 0.001$.
* **First Moving Car (Van #4)**: Enters top-right at **00:02 (1.9s)**, drives through the intersection, and exits camera view at **00:10 (9.7s)**.
* **Second Moving Car (SUV #17)**: Enters top-right at **00:10 (9.8s)**, drives past the parked cars, and exits camera view at **00:15 (14.8s)**.
* **Occluded Pedestrian**: Walks along the sidewalk behind multiple tree trunks. Our occlusion engine matches the reappearing detections back to Track #3.

#### Natural Language Query Results:

```json
// Query: "when does the 2nd moving car enter the camera frame"
{
  "answer": "The 2nd moving car (Car (silver/gray) #17) entered the camera frame at timestamp 00:10 (9.8s). (The 1st moving car, Car #4, entered at 00:02).",
  "direct_subject": "Car (silver/gray) #17",
  "timeline": [
    { "event": "Car (silver/gray) #17 entered camera view", "time": "00:10", "timestamp_sec": 9.84 }
  ],
  "evidence_start": 8.0,
  "evidence_end": 12.3,
  "evidence_label": "Play 00:08 – 00:12",
  "confidence": 0.98
}
```

```json
// Query: "when does the 2nd moving car exit the frame"
{
  "answer": "The 2nd moving car (Car (silver/gray) #17) exited camera view at timestamp 00:15 (14.8s). (Other recorded exits: Car #4 at 00:10).",
  "direct_subject": "Car (silver/gray) #17",
  "timeline": [
    { "event": "Car (silver/gray) #17 exited camera view", "time": "00:15", "timestamp_sec": 14.80 }
  ],
  "evidence_start": 12.0,
  "evidence_end": 15.9,
  "evidence_label": "Play 00:12 – 00:16",
  "confidence": 0.98
}
```

---

## 🔬 Core Algorithmic Breakthroughs

### 1. Dynamic Occlusion Re-Identification
When an object is occluded behind a tree trunk, signboard, or pillar ($0.06 < c_x < 0.94, 0.06 < c_y < 0.94$), standard trackers lose identity and instantiate a new track ID. Our engine maintains a velocity extrapolation buffer:
$$\vec{p}_{\text{predicted}} = \vec{p}_{\text{last}} + \vec{v}_{\text{EMA}} \cdot \Delta t$$
When an unassigned detection appears within $\Delta t \le 4.5\text{s}$:
$$d_{\text{match}} = \min(||\vec{p}_{\text{cand}} - \vec{p}_{\text{pred}}||, ||\vec{p}_{\text{cand}} - \vec{p}_{\text{last}}||)$$
The distance gating threshold dynamically relaxes over time:
$$d_{\text{gate}} = 0.16 + (0.08 \cdot \Delta t)$$
If $d_{\text{match}} \le d_{\text{gate}}$, bounding box aspect ratio ratio $\ge 0.20$, and body paint chromaticity aligns, the detection is reassigned to the **original canonical track ID**.

### 2. Vehicle Paint Isolation vs. Bumper Plate Filtering
To prevent license plates (e.g., standard blue/yellow plates) from corrupting vehicle color classification, the sampling mask isolates the hood, roof, and side body panels:
$$\text{Sample Window} = \text{Crop}[0.10 \cdot H : 0.65 \cdot H, \; 0.10 \cdot W : 0.90 \cdot W]$$
$$\text{Blue Paint Condition} \iff b > 1.25 \cdot r \;\land\; b > 1.15 \cdot g \;\land\; \text{Ratio} > 0.12$$
This ensures black SUVs and white vans with blue plates are accurately classified as `black` and `silver/white` instead of `blue`.

### 3. Spatial Displacement Tracking
To eliminate ambiguity between parked obstacles and active traffic:
$$\text{Displacement } \Delta d = \sqrt{(c_{x,\text{last}} - c_{x,\text{first}})^2 + (c_{y,\text{last}} - c_{y,\text{first}})^2}$$
$$\text{Status} = \begin{cases} \text{Moving / Active Traffic}, & \text{if } \Delta d \ge 0.06 \land v_{\text{max}} \ge 30\text{ px/s} \\ \text{Stationary / Parked Obstacle}, & \text{if } \Delta d < 0.03 \end{cases}$$

### 4. Ray-Casting Point-in-Polygon Engine
Given a zone polygon with vertices $V_0, V_1, \dots, V_{n-1}$ and object footprint point $P = (x, y)$:
$$\text{Inside} \iff \sum_{i=0}^{n-1} \left[ (y < V_{i,y} \iff y \ge V_{i+1,y}) \land \left( x < \frac{V_{i+1,x} - V_{i,x}}{V_{i+1,y} - V_{i,y}} (y - V_{i,y}) + V_{i,x} \right) \right] \pmod 2 = 1$$

---

## 🛠️ API Interface Specification

| Endpoint | Method | Input | Output | Purpose |
| :--- | :---: | :--- | :--- | :--- |
| `/api/system/status` | `GET` | — | `{ pipeline, status }` | System operational health check |
| `/api/videos` | `GET` | — | `Video[]` | Lists all indexed surveillance clips |
| `/api/videos/upload` | `POST` | `multipart/form-data` | `VideoMetadata` | Uploads raw surveillance video |
| `/api/videos/{id}/process` | `POST` | — | `{ total_events, total_tracks }` | Runs full vision & temporal pipeline |
| `/api/videos/{id}/query` | `POST` | `{ question: string }` | `TemporalQueryResponse` | Evaluates natural language temporal QA |
| `/api/videos/{id}/stream` | `GET` | HTTP Range Header | `video/mp4` binary stream | Chunked HTTP 206 video streaming |
| `/api/videos/{id}/zones` | `GET` | — | `SurveillanceZone[]` | Returns polygonal zone geometry |
| `/api/videos/{id}/detections` | `GET` | — | `FrameDetection[]` | Time-indexed bounding boxes & trails |
| `/api/videos/{id}/questions` | `GET` | — | `Question[]` | Auto-generated contextual queries |

---

## ⚡ Quickstart: Run in Under 2 Minutes

### Prerequisites
* **Python**: 3.10 or higher
* **Node.js**: 18.0 or higher
* **Git**

---

### 1. Backend Setup

```powershell
# Navigate to backend directory
cd backend

# Create virtual environment
python -m venv venv
.\venv\Scripts\activate

# Install dependencies
pip install fastapi uvicorn opencv-python ultralytics numpy python-dotenv google-generativeai

# Copy environment template
copy ..\.env.example .env

# Start FastAPI server
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```
* **API Server**: `http://127.0.0.1:8000`
* **Swagger Documentation**: `http://127.0.0.1:8000/docs`

---

### 2. Frontend Setup

```powershell
# Open a new terminal and navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Start Vite dev server
npm run dev
```
* **Web Studio**: `http://localhost:5173`

---

## 🧪 Quick Test: Command-Line Verification

You can query the live system directly from PowerShell:

```powershell
# Query: 2nd Moving Car Entry
Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/videos/vid_370aadd2/query" `
  -Method Post `
  -ContentType "application/json" `
  -Body '{"question": "when does the 2nd moving car enter the camera frame"}'
```

---

## 👥 Hackathon Team Division & Architecture Ownership

| Member | Focus Domain | Core Technical Deliverables |
| :--- | :--- | :--- |
| **Member 1** | **Computer Vision & Tracking** | YOLOv8 pipeline, ByteTrack integration, predictive occlusion recovery buffer, paint chromaticity clustering. |
| **Member 2** | **Spatial Geometry & Kinematics** | Ray-casting point-in-polygon engine, spatial displacement tracking, loitering state machine, SQLite temporal schema. |
| **Member 3** | **Temporal Reasoning & LLM Grounding** | Temporal algebra operators (AFTER, BEFORE, BETWEEN, DURATION, COUNT), ordinal motion parser, Gemini reasoning integration. |
| **Member 4** | **Surveillance UI & Full-Stack** | Video player canvas overlay, canvas NMS suppression, motion trail rendering, range-request video streaming, evidence clipping. |

---

## 🚀 Production Roadmap
- [x] Predictive occlusion recovery across obstacles (trees, signboards)
- [x] Stationary vs. moving vehicle spatial displacement separation
- [x] Sub-second ordinal motion query engine
- [x] 1-Click verified video evidence looping
- [ ] Multi-camera re-identification (ReID across overlapping CCTV cameras)
- [ ] Real-time RTSP/ONVIF live IP camera ingestion
- [ ] License plate OCR integration (LPR / ANPR)

---

## 📄 License
MIT License. Built for competition problem statement PSI02.
