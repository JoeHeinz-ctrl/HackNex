import os
import shutil
import uuid
import re
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from collections import defaultdict
from pydantic import BaseModel

from database import (
    init_db, save_video, get_video, get_all_videos,
    save_events, get_events,
    save_tracks, get_tracks,
    save_zones, get_zones,
    save_frame_detections, get_frame_detections
)
from zone_geometry import get_default_zones, generate_adaptive_zones
from video_processor import VideoProcessor
from detector_tracker import DetectorTracker
from event_engine import EventEngine
from temporal_query_engine import TemporalQueryEngine
from vlm_llm_reasoner import TemporalReasoner

app = FastAPI(title="Temporal AI Investigator Backend", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

VIDEOS_DIR = os.path.join(os.path.dirname(__file__), "storage", "videos")
FRAMES_DIR = os.path.join(os.path.dirname(__file__), "storage", "frames")
os.makedirs(VIDEOS_DIR, exist_ok=True)
os.makedirs(FRAMES_DIR, exist_ok=True)

# App startup: Initialize DB
@app.on_event("startup")
def startup_event():
    init_db()

class QueryRequest(BaseModel):
    question: str



@app.get("/api/system/status")
def system_status():
    return {
        "status": "online",
        "pipeline": {
            "opencv": True,
            "yolo_tracker": True,
            "temporal_memory": "SQLite",
            "query_engine": "Dynamic Temporal Logic"
        }
    }

@app.get("/api/videos")
def list_videos():
    return get_all_videos()

@app.get("/api/videos/{video_id}")
def get_video_details(video_id: str):
    v = get_video(video_id)
    if not v:
        raise HTTPException(status_code=404, detail="Video not found")
    return v

def stream_file_range(filepath: str, start: int, end: int, chunk_size: int = 1024 * 512):
    with open(filepath, "rb") as f:
        f.seek(start)
        remaining = end - start + 1
        while remaining > 0:
            read_size = min(chunk_size, remaining)
            data = f.read(read_size)
            if not data:
                break
            remaining -= len(data)
            yield data

@app.get("/api/videos/{video_id}/stream")
def stream_video(video_id: str, request: Request):
    v = get_video(video_id)
    if not v:
        raise HTTPException(status_code=404, detail="Video not found")
    filepath = v["filepath"]
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Video file missing on disk")

    file_size = os.path.getsize(filepath)
    range_header = request.headers.get("Range")

    if not range_header:
        headers = {
            "Content-Length": str(file_size),
            "Accept-Ranges": "bytes",
            "Content-Type": "video/mp4",
            "Cache-Control": "public, max-age=86400",
        }
        return StreamingResponse(
            stream_file_range(filepath, 0, file_size - 1),
            headers=headers,
            media_type="video/mp4"
        )

    try:
        range_val = range_header.replace("bytes=", "").strip()
        parts = range_val.split("-")
        start = int(parts[0]) if parts[0] else 0
        end = int(parts[1]) if len(parts) > 1 and parts[1] else file_size - 1

        if start >= file_size or start < 0:
            raise HTTPException(status_code=416, detail="Requested Range Not Satisfiable")

        end = min(end, file_size - 1)
        content_length = end - start + 1

        headers = {
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Accept-Ranges": "bytes",
            "Content-Length": str(content_length),
            "Content-Type": "video/mp4",
            "Cache-Control": "public, max-age=86400",
        }
        return StreamingResponse(
            stream_file_range(filepath, start, end),
            status_code=206,
            headers=headers,
            media_type="video/mp4"
        )
    except HTTPException:
        raise
    except Exception:
        return FileResponse(filepath, media_type="video/mp4")

@app.get("/api/videos/{video_id}/detections")
def get_video_detections(video_id: str):
    dets = get_frame_detections(video_id)
    return {
        "video_id": video_id,
        "total_detections": len(dets),
        "detections": dets
    }

@app.get("/api/videos/{video_id}/zones")
def get_video_zones(video_id: str):
    zones = get_zones(video_id)
    if not zones:
        zones = get_default_zones()
    return zones

@app.post("/api/videos/{video_id}/zones")
def update_video_zones(video_id: str, zones: List[Dict[str, Any]]):
    save_zones(video_id, zones)
    return {"status": "success", "video_id": video_id, "zones": zones}

@app.post("/api/videos/{video_id}/zones/autodetect")
def autodetect_video_zones(video_id: str):
    dets = get_frame_detections(video_id)
    new_zones = generate_adaptive_zones(dets)
    save_zones(video_id, new_zones)
    return {"status": "success", "video_id": video_id, "zones": new_zones}

@app.get("/api/videos/{video_id}/timeline")
def get_timeline(video_id: str):
    events = get_events(video_id)
    tracks = get_tracks(video_id)
    zones = get_zones(video_id) or get_default_zones()
    return {
        "video_id": video_id,
        "events": events,
        "tracks": tracks,
        "zones": zones
    }

@app.get("/api/videos/{video_id}/questions/preset")
def get_preset_questions(video_id: str):
    events = get_events(video_id)
    tracks = get_tracks(video_id)
    # Dynamically generate questions based on actual detected events
    questions = []
    q_id = 1

    # Check for movement
    moves = [e for e in events if "moving_" in e["event_type"]]
    if moves:
        direction = moves[0]["event_type"].split("_")[1]
        questions.append({"id": q_id, "text": f"Who moved {direction}?"})
        q_id += 1

    # Check for vehicles or multiple tracks
    vehicles = [e for e in events if "arrived" in e["event_type"] or "truck" in e["event_type"] or "car" in e["event_type"]]
    if vehicles:
        veh_name = vehicles[0]["object_label"]
        questions.append({"id": q_id, "text": f"What happened after the {veh_name} arrived?"})
        q_id += 1

    # Check for duration questions
    if tracks:
        cand_track = tracks[0]
        questions.append({"id": q_id, "text": f"How long was {cand_track['class_name'].capitalize()} #{cand_track['track_id']} active in the scene?"})
        q_id += 1

    # Temporal order questions
    if len(events) >= 2:
        e1, e2 = events[0], events[-1]
        questions.append({"id": q_id, "text": f"What happened immediately after {e1['description'].lower()}?"})
        q_id += 1
        questions.append({"id": q_id, "text": f"What happened before {e2['description'].lower()}?"})
        q_id += 1

    # Counting question
    questions.append({"id": q_id, "text": "How many people were tracked in this video?"})
    q_id += 1

    # Interaction / sequence
    if len(events) >= 3:
        questions.append({"id": q_id, "text": f"What happened between {events[0]['description'].lower()} and {events[-1]['description'].lower()}?"})
        q_id += 1

    if not questions:
        questions = [
            {"id": 1, "text": "What are the first events detected in this video?"},
            {"id": 2, "text": "How many objects were tracked?"},
            {"id": 3, "text": "How long was the longest tracked object in view?"}
        ]

    return questions

@app.post("/api/videos/{video_id}/query")
def query_video(video_id: str, req: QueryRequest):
    events = get_events(video_id)
    tracks = get_tracks(video_id)
    if not events and not tracks:
        return {
            "answer": "This video has not yet been processed through the temporal pipeline. Click 'Process Video' to extract real tracks and events.",
            "timeline": [],
            "confidence": 0.0
        }

    engine = TemporalQueryEngine(events, tracks)
    engine_result = engine.query(req.question)

    reasoner = TemporalReasoner()
    final_output = reasoner.reason(req.question, engine_result, events, tracks)

    return final_output


@app.post("/api/videos/upload")
async def upload_video(file: UploadFile = File(...)):
    video_id = f"vid_{uuid.uuid4().hex[:8]}"
    filename = file.filename
    ext = os.path.splitext(filename)[1] or ".mp4"
    dest_path = os.path.join(VIDEOS_DIR, f"{video_id}{ext}")

    with open(dest_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Read basic metadata using OpenCV
    vp = VideoProcessor()
    meta = vp.get_metadata(dest_path)

    video_dict = {
        "id": video_id,
        "filename": filename,
        "filepath": dest_path,
        "duration": meta["duration"],
        "fps": meta["fps"],
        "total_frames": meta["total_frames"],
        "width": meta["width"],
        "height": meta["height"],
        "status": "uploaded"
    }
    save_video(video_dict)



    return video_dict

@app.post("/api/videos/{video_id}/process")
def process_video_pipeline(video_id: str):
    v = get_video(video_id)
    if not v:
        raise HTTPException(status_code=404, detail="Video not found")

    filepath = v["filepath"]
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Video file missing on disk")

    # Target 12 FPS sampling for high-precision surveillance tracking without missing small objects
    vp = VideoProcessor(target_fps=12.0)
    zones = get_zones(video_id) or get_default_zones()

    event_engine = EventEngine(zones=zones)
    detector = DetectorTracker()

    video_frames_dir = os.path.join(FRAMES_DIR, video_id)
    meta = vp.get_metadata(filepath)

    all_detections = []

    # Frame extraction & detection loop
    for frame_idx, timestamp, frame in vp.extract_sampled_frames(filepath, video_frames_dir):
        detections = detector.track_frame(frame, frame_idx, timestamp)
        event_engine.process_frame_detections(detections, timestamp)
        all_detections.extend(detections)

    # Automatically derive authentic polygonal scene zones based on actual vehicle & pedestrian paths
    adaptive_zones = generate_adaptive_zones(all_detections)
    save_zones(video_id, adaptive_zones)

    # Finalize tracks & event summaries with consensus labels
    events, tracks = event_engine.finalize(meta["duration"])

    save_events(video_id, events)
    save_tracks(video_id, tracks)
    save_frame_detections(video_id, all_detections)

    # Update video status
    v["status"] = "processed"
    save_video(v)

    return {
        "status": "completed",
        "video_id": video_id,
        "total_events": len(events),
        "total_tracks": len(tracks),
        "total_detections": len(all_detections)
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
