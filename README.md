# ⏱️ Temporal AI Investigator (Video Analytics Studio)
> **Problem Statement PSI02 — Video Understanding & Spatio-Temporal Reasoning System**  
> *Upload Surveillance / Traffic Video → Predictive Object Tracking & Occlusion Recovery → Spatio-Temporal Memory Engine → High-Precision Natural Language Temporal QA → 1-Click Verified Evidence Playback*

---

## 📌 Executive Summary

Modern video question-answering systems often feed raw video frames directly into massive multimodal LLMs. This naive approach suffers from severe token limits, hallucinated event order, lack of physical spatial grounding, and zero deterministic time verification.

**Temporal AI Investigator** takes a principled, explainable approach:
1. **Computer Vision & Kinematics**: Detects objects, tracks physical trajectories at 12 FPS, computes chromatic paint/clothing signatures, and maintains identity continuity when objects pass behind trees, signboards, or pillars.
2. **Spatial Displacement & Motion Classification**: Dynamically separates parked/stationary obstacles from active vehicles in transit via physical screen displacement metrics ($\Delta d > 0.06$ vs $\Delta d \approx 0.001$).
3. **Geometric Event Engine**: Computes ray-casting point-in-polygon containment, transit zone entries, loitering alerts ($>10$s), and scene entry/exit events.
4. **Deterministic Spatio-Temporal Memory**: Stores every frame detection, track trajectory, and discrete event in an indexed SQLite database.
5. **Ordinal & Relational Query Engine**: Understands complex temporal semantics (e.g., *"when does the 2nd moving car enter the camera frame"*, *"who moved downward before the vehicle arrived"*) and returns verified, millisecond-accurate timestamps.
6. **Surveillance Studio UI**: Utilitarian operator interface with synchronous canvas overlays, motion trail rendering, multi-track timeline visualization, and 1-click evidence video clip jumping.

---

## 🏗️ System Architecture & Multi-Layer Pipeline

```text
 ┌────────────────────────────────────────────────────────────────────────────┐
 │                            1. VIDEO INGESTION                              │
 │  • Upload: MP4, AVI, MOV                                                   │
 │  • OpenCV VideoProcessor: Sampled at 12.0 FPS for surveillance precision   │
 └─────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
 ┌────────────────────────────────────────────────────────────────────────────┐
 │             2. DETECTION, TRACKING & OCCLUSION RECOVERY                    │
 │  • YOLOv8 Nano: Persons, Vehicles, Bicycles, Luggage (conf >= 0.35)       │
 │  • Intra-Frame Duplicate Suppression (NMS IoU > 0.35)                      │
 │  • Body Paint & Clothing Chromatic Clustering (License plate filtering)   │
 │  • Predictive Occlusion Re-Identification Engine:                          │
 │    - Holds occluded tracks in active memory for up to 4.5 seconds          │
 │    - Predicts trajectory via velocity extrapolation: p_pred = p_0 + v * dt │
 │    - Restores canonical Track ID when re-emerging from behind trees/signs  │
 └─────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
 ┌────────────────────────────────────────────────────────────────────────────┐
 │            3. KINEMATICS & SPATIAL GEOMETRY EVENT ENGINE                   │
 │  • Physical Displacement Calculation (disp = hypot(dx, dy))                │
 │  • Stationary vs Moving Classification (disp > 0.06 vs disp < 0.002)        │
 │  • Convex-Hull Adaptive Surveillance Zones (Roadways, Walkways, Perimeter) │
 │  • Ray-Casting Point-in-Polygon: Zone Entry, Dwell Time, Zone Exit         │
 │  • Directional Heading Vectors & Speed Anomalies (> 80 px/s)               │
 └─────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
 ┌────────────────────────────────────────────────────────────────────────────┐
 │               4. SPATIO-TEMPORAL MEMORY DATABASE (SQLite)                  │
 │  • videos, tracks, frame_detections, zones, events, query_history          │
 │  • Microsecond timestamp indexing & physical trajectory trails             │
 └─────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
 ┌────────────────────────────────────────────────────────────────────────────┐
 │            5. TEMPORAL QUERY ENGINE & VLM REASONER                         │
 │  • Natural Language Intent Classifier                                      │
 │  • Motion-Aware Ordinal Reasoning: 1st, 2nd, 3rd, last moving/exiting cars │
 │  • Relational Temporal Algebra: AFTER, BEFORE, BETWEEN, DURATION, COUNT    │
 │  • Deterministic verification with Gemini Flash reasoning grounding        │
 └─────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
 ┌────────────────────────────────────────────────────────────────────────────┐
 │                6. PROFESSIONAL SURVEILLANCE STUDIO UI                      │
 │  • HTML5 High-Performance Video Player with Canvas Overlay                 │
 │  • Non-Maximum Suppression for canvas bounding boxes & badges              │
 │  • Interactive Motion Trails & Zone Polygon toggles                        │
 │  • 1-Click Evidence Playback with Segment Looping                          │
 └────────────────────────────────────────────────────────────────────────────┘
```

---

## 🔄 End-to-End Workflow

### Step 1: Video Upload & Stream Ingestion
- Upload any surveillance or traffic video file through the web interface (`POST /api/videos/upload`).
- The system extracts metadata (resolution, native frame rate, frame count, total duration) and creates a persistent database record.

### Step 2: Automated Analysis Pipeline
- Trigger the complete pipeline via `POST /api/videos/{video_id}/process`:
  1. **Frame Sampling**: Extracts frames at a target 12 FPS sampling rate to capture small, fast-moving objects without unnecessary CPU overhead.
  2. **YOLOv8 Detection**: Detects persons, cars, trucks, buses, motorcycles, bicycles, backpacks, and suitcases. False-positive suppression ensures interior steering wheels or headrests are never misidentified as pedestrians.
  3. **Intra-Frame NMS**: Suppresses duplicate detections on the same physical vehicle ($\text{IoU} > 0.35$).
  4. **Paint & Clothing Color Extraction**: Samples the upper vehicle body (hood, roof, doors) and masks out bottom-center license plates, ensuring white vans and black SUVs with blue plates are not misidentified as "blue".
  5. **Predictive Occlusion Recovery**: When an object passes behind an obstacle (tree, signboard, pole), its velocity vector $(v_x, v_y)$ is preserved. When the object re-emerges within 4.5 seconds, it is seamlessly matched to its original Track ID.
  6. **Spatial Displacement Tracking**: Calculates total travel distance across the scene ($\Delta d = \sqrt{\Delta x^2 + \Delta y^2}$). Vehicles with $\Delta d > 0.06$ are marked `is_moving: True`; parked cars with $\Delta d < 0.002$ are marked `is_moving: False`.
  7. **Adaptive Zone Derivation**: Automatically generates polygonal surveillance zones (e.g., Transit Roadway, Pedestrian Walkway, Restricted Perimeter) using spatial density clustering.
  8. **Event Emission**: Records zone entries, exits, loitering alerts ($>10$s dwell time), speed anomalies, and scene entry/exit events.

### Step 3: Interactive Surveillance Exploration
- The UI displays the synchronized video player alongside timeline statistics:
  - **Boxes**: Real-time bounding boxes with class, color description, and track ID.
  - **Trails**: Historical motion path trails showing where objects have traveled.
  - **Zones**: Transparent polygonal zone boundaries overlaid directly on the video.
  - **Object Filter**: Dropdown to inspect all tracks or isolate individual objects.
  - **Frame Stepper**: `< FR` and `FR >` buttons for frame-by-frame analysis.

### Step 4: Natural Language Temporal Question Answering
- Users can type any natural language temporal question or select auto-generated suggestions:
  - **Ordinal queries**: *"When does the 2nd moving car enter the camera frame?"*
  - **Departure queries**: *"When does the 2nd car exit the frame?"*
  - **Relational queries**: *"Who entered the restricted zone after the car arrived?"*
  - **Duration queries**: *"How long was the vehicle active in the scene?"*
  - **Counting queries**: *"How many people were tracked in this video?"*
  - **Interval queries**: *"What happened between 00:03 and 00:09?"*

### Step 5: Verified Evidence Playback
- Every answer returns a verified time interval: `evidence_start` and `evidence_end`.
- Clicking the **▶ Play Clip** button jumps the video player directly to the exact seconds where the event occurred and loops the segment for operator review.

---

## 🎬 Real Demonstration & Case Studies

### Case Study: Traffic & Intersection Video (`joy cars.mp4`, 16.0s)

#### Scene Overview
* **Car #1**: Dark gray Suzuki parked on the left from 00:00 to 15.9s ($\Delta d = 0.001$, `is_moving: False`).
* **Car #2**: Red Nissan parked behind Car #1 from 00:00 to 15.9s ($\Delta d = 0.001$, `is_moving: False`).
* **Car #4 (Moving Car 1)**: Silver/white van enters from top-right at **00:02 (1.9s)**, travels down the roadway ($\Delta d = 1.12$, `is_moving: True`), and exits the frame at **00:10 (9.7s)**.
* **Car #17 (Moving Car 2)**: Dark SUV enters from top-right at **00:10 (9.8s)**, travels down the roadway ($\Delta d = 0.98$, `is_moving: True`), and exits the frame at **00:15 (14.8s)**.
* **Pedestrians**: Pedestrian walking on the sidewalk behind tree trunks. Occlusion re-identification maintains track identity across obstacles.

#### Query Demonstrations

| User Query | Generated Answer | Evidence Clip |
| :--- | :--- | :--- |
| **"When does the 2nd moving car enter the camera frame?"** | *"The 2nd moving car (Car #17) entered the camera frame at timestamp 00:10 (9.8s). (The 1st moving car, Car #4, entered at 00:02)."* | **`00:08 – 00:12`** |
| **"When does the 2nd car exit the frame?"** | *"The 2nd car to exit the frame (Car #17) exited camera view at timestamp 00:15 (14.8s). (Other recorded exits: Car #4 at 00:10)."* | **`00:12 – 00:16`** |
| **"When does the 1st moving car enter the camera frame?"** | *"The 1st moving car (Car #4) entered the camera frame at timestamp 00:02 (1.9s)."* | **`00:00 – 00:04`** |
| **"When does the 1st moving car exit the frame?"** | *"The 1st moving car (Car #4) exited camera view at timestamp 00:10 (9.7s)."* | **`00:07 – 00:11`** |
| **"How long was Car #1 active in the scene?"** | *"Car #1 was tracked for 15.9s (stationary from 00:00 to 00:15)."* | **`00:00 – 00:15`** |
| **"How many people were tracked in this video?"** | *"A total of 3 individual person(s) were tracked in the video."* | Multi-track timeline |

---

## 🔬 Algorithmic Details

### 1. Predictive Occlusion Re-Identification
When an object disappears in the frame interior ($0.06 < c_x < 0.94, 0.06 < c_y < 0.94$), it is marked as `occluded`:
$$\vec{p}_{\text{pred}} = \vec{p}_{\text{last}} + \vec{v} \cdot \Delta t$$
When a candidate appears within $\Delta t \le 4.5\text{s}$:
$$d_{\text{effective}} = \min(||\vec{p}_{\text{candidate}} - \vec{p}_{\text{pred}}||, ||\vec{p}_{\text{candidate}} - \vec{p}_{\text{last}}||)$$
The match threshold scales dynamically with elapsed occlusion time:
$$d_{\text{max}} = 0.16 + (0.08 \cdot \Delta t)$$
If $d_{\text{effective}} < d_{\text{max}}$, class family matches, and paint chromaticity is compatible, the candidate is mapped to the existing canonical track ID.

### 2. Paint Chromaticity & License Plate Filtering
Color sampling avoids bottom-center bumper regions where bright Chinese blue or yellow license plates typically reside:
$$\text{Sample Region} = \text{Crop}[0.10 \cdot h : 0.65 \cdot h, \; 0.10 \cdot w : 0.90 \cdot w]$$
Chromatic paint ratios:
$$\text{Red} \iff r > 1.15 \cdot g \land r > 1.15 \cdot b \land \text{ratio} > 0.06$$
$$\text{Blue} \iff b > 1.25 \cdot r \land b > 1.15 \cdot g \land \text{ratio} > 0.12$$
$$\text{Black/Gray/White} \iff \text{Achromatic median brightness } < 65 \implies \text{Black}, > 165 \implies \text{White}$$

### 3. Canvas Non-Maximum Suppression (NMS)
To prevent stacked visual badges (e.g. overlapping `#6 #10 #11` labels when two detections momentarily overlap), the frontend renderer performs an on-the-fly geometric IoU check ($\text{IoU} > 0.40$), prioritizing higher confidence detections.

---

## 🛠️ API Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/system/status` | Returns pipeline health and engine operational status. |
| `GET` | `/api/videos` | Lists all videos stored in the database. |
| `GET` | `/api/videos/{video_id}` | Returns metadata, fps, frame count, and processing status. |
| `GET` | `/api/videos/{video_id}/stream` | Streams video binary with HTTP 206 range-request support. |
| `POST` | `/api/videos/upload` | Uploads a video file (multipart form data). |
| `POST` | `/api/videos/{video_id}/process` | Runs YOLOv8 detection, occlusion tracking, zone generation, and SQLite indexing. |
| `POST` | `/api/videos/{video_id}/query` | Evaluates natural language temporal questions, returns answer and evidence timestamps. |
| `GET` | `/api/videos/{video_id}/zones` | Returns active surveillance polygon zones. |
| `GET` | `/api/videos/{video_id}/detections` | Returns time-indexed bounding boxes and tracking records. |
| `GET` | `/api/videos/{video_id}/questions` | Returns dynamic question suggestions derived from detected events. |

---

## 💻 Installation & Setup

### Prerequisites
- **Python**: Version 3.10 or higher
- **Node.js**: Version 18.0 or higher
- **npm**: Version 9.0 or higher

---

### Step 1: Clone & Configure Backend

```powershell
# Navigate to backend directory
cd backend

# Create virtual environment (optional but recommended)
python -m venv venv
.\venv\Scripts\activate

# Install dependencies
pip install fastapi uvicorn opencv-python ultralytics numpy python-dotenv google-generativeai

# Ensure .env contains Gemini API key (optional for LLM reasoning layer)
# GEMINI_API_KEY=your_key_here
```

Start the FastAPI backend:
```powershell
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```
* Backend API: **`http://127.0.0.1:8000`**
* Interactive Swagger Docs: **`http://127.0.0.1:8000/docs`**

---

### Step 2: Configure & Start Frontend

```powershell
# Navigate to frontend directory
cd ..\frontend

# Install dependencies
npm install

# Start Vite dev server
npm run dev
```
* Frontend Application: **`http://localhost:5173`**

---

## 🧪 Testing & Validation

```powershell
# Run production TypeScript build test
cd frontend
npm run build

# Query API via PowerShell
Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/videos/vid_370aadd2/query" `
  -Method Post `
  -ContentType "application/json" `
  -Body '{"question": "when does the 2nd moving car enter the camera frame"}'
```

---

## 👥 Hackathon Team Division

| Member | Focus Area | Responsibilities |
| :--- | :--- | :--- |
| **Member 1** | **Computer Vision & Tracking** | YOLOv8 pipeline, ByteTrack integration, predictive occlusion recovery, dominant paint/clothing chromatic clustering. |
| **Member 2** | **Spatial Kinematics & Geometry** | Ray-casting point-in-polygon containment, spatial displacement tracking, loitering state machine, SQLite temporal schema. |
| **Member 3** | **Temporal Reasoning & LLM Grounding** | Temporal algebra operators (AFTER, BEFORE, BETWEEN, DURATION, COUNT), ordinal motion parsing, Gemini reasoning integration. |
| **Member 4** | **Full-Stack Interface & UX** | Surveillance Studio UI, canvas overlay rendering, canvas NMS suppression, video stream buffering, interactive timeline controls. |

---

## 📄 License
MIT License. Built for competition problem statement PSI02.
