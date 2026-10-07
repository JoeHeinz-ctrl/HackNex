import sqlite3
import json
import os
import uuid
from datetime import datetime
from typing import List, Dict, Any, Optional

DB_PATH = os.path.join(os.path.dirname(__file__), "storage", "temporal_memory.db")

def get_db_connection():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=60.0, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS videos (
            id TEXT PRIMARY KEY,
            filename TEXT NOT NULL,
            filepath TEXT NOT NULL,
            duration REAL NOT NULL,
            fps REAL NOT NULL,
            total_frames INTEGER NOT NULL,
            width INTEGER NOT NULL,
            height INTEGER NOT NULL,
            status TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        """)

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS zones (
            id TEXT PRIMARY KEY,
            video_id TEXT NOT NULL,
            name TEXT NOT NULL,
            zone_type TEXT NOT NULL,
            polygon_json TEXT NOT NULL,
            color TEXT NOT NULL,
            FOREIGN KEY (video_id) REFERENCES videos (id)
        )
        """)

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS tracks (
            id TEXT PRIMARY KEY,
            video_id TEXT NOT NULL,
            track_id INTEGER NOT NULL,
            class_name TEXT NOT NULL,
            first_seen REAL NOT NULL,
            last_seen REAL NOT NULL,
            duration REAL NOT NULL,
            confidence REAL NOT NULL,
            is_moving INTEGER DEFAULT 0,
            max_speed REAL DEFAULT 0.0,
            displacement REAL DEFAULT 0.0,
            FOREIGN KEY (video_id) REFERENCES videos (id)
        )
        """)

        # Migration for existing databases
        cursor.execute("PRAGMA table_info(tracks)")
        track_cols = [r[1] for r in cursor.fetchall()]
        if "is_moving" not in track_cols:
            cursor.execute("ALTER TABLE tracks ADD COLUMN is_moving INTEGER DEFAULT 0")
        if "max_speed" not in track_cols:
            cursor.execute("ALTER TABLE tracks ADD COLUMN max_speed REAL DEFAULT 0.0")
        if "displacement" not in track_cols:
            cursor.execute("ALTER TABLE tracks ADD COLUMN displacement REAL DEFAULT 0.0")

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS events (
            id TEXT PRIMARY KEY,
            video_id TEXT NOT NULL,
            timestamp REAL NOT NULL,
            end_timestamp REAL,
            event_type TEXT NOT NULL,
            object_id INTEGER,
            object_label TEXT,
            zone_name TEXT,
            description TEXT NOT NULL,
            confidence REAL NOT NULL,
            evidence_start REAL NOT NULL,
            evidence_end REAL NOT NULL,
            metadata_json TEXT,
            FOREIGN KEY (video_id) REFERENCES videos (id)
        )
        """)

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS query_history (
            id TEXT PRIMARY KEY,
            video_id TEXT NOT NULL,
            question TEXT NOT NULL,
            parsed_intent TEXT,
            answer TEXT NOT NULL,
            evidence_start REAL,
            evidence_end REAL,
            explanation TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (video_id) REFERENCES videos (id)
        )
        """)

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS frame_detections (
            id TEXT PRIMARY KEY,
            video_id TEXT NOT NULL,
            frame_idx INTEGER NOT NULL,
            timestamp REAL NOT NULL,
            track_id INTEGER NOT NULL,
            class_name TEXT NOT NULL,
            color_desc TEXT,
            confidence REAL NOT NULL,
            bbox_norm_json TEXT NOT NULL,
            bbox_pixel_json TEXT,
            speed REAL,
            action TEXT,
            zone_name TEXT,
            FOREIGN KEY (video_id) REFERENCES videos (id)
        )
        """)

        cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_detections_vid_time ON frame_detections (video_id, timestamp)
        """)

        conn.commit()
    finally:
        conn.close()

def save_video(video_dict: Dict[str, Any]):
    conn = get_db_connection()
    try:
        c = conn.cursor()
        c.execute("""
            INSERT OR REPLACE INTO videos (id, filename, filepath, duration, fps, total_frames, width, height, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            video_dict["id"],
            video_dict["filename"],
            video_dict["filepath"],
            video_dict["duration"],
            video_dict["fps"],
            video_dict["total_frames"],
            video_dict["width"],
            video_dict["height"],
            video_dict.get("status", "ready"),
            datetime.utcnow().isoformat()
        ))
        conn.commit()
    finally:
        conn.close()

def save_zones(video_id: str, zones: List[Dict[str, Any]]):
    conn = get_db_connection()
    try:
        c = conn.cursor()
        c.execute("DELETE FROM zones WHERE video_id = ?", (video_id,))
        for z in zones:
            c.execute("""
                INSERT INTO zones (id, video_id, name, zone_type, polygon_json, color)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (
                z.get("id", f"{video_id}_{z['name']}"),
                video_id,
                z["name"],
                z.get("zone_type", "restricted"),
                json.dumps(z["polygon"]),
                z.get("color", "#dc2626")
            ))
        conn.commit()
    finally:
        conn.close()

def get_zones(video_id: str) -> List[Dict[str, Any]]:
    conn = get_db_connection()
    try:
        c = conn.cursor()
        c.execute("SELECT * FROM zones WHERE video_id = ?", (video_id,))
        rows = c.fetchall()
        return [{
            "id": r["id"],
            "video_id": r["video_id"],
            "name": r["name"],
            "zone_type": r["zone_type"],
            "polygon": json.loads(r["polygon_json"]),
            "color": r["color"]
        } for r in rows]
    finally:
        conn.close()

def save_events(video_id: str, events: List[Dict[str, Any]]):
    conn = get_db_connection()
    try:
        c = conn.cursor()
        c.execute("DELETE FROM events WHERE video_id = ?", (video_id,))
        for idx, ev in enumerate(events):
            event_id = ev.get("id") or f"ev_{video_id}_{idx}_{uuid.uuid4().hex[:6]}"
            c.execute("""
                INSERT INTO events (
                    id, video_id, timestamp, end_timestamp, event_type,
                    object_id, object_label, zone_name, description,
                    confidence, evidence_start, evidence_end, metadata_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                event_id,
                video_id,
                ev["timestamp"],
                ev.get("end_timestamp"),
                ev["event_type"],
                ev.get("object_id"),
                ev.get("object_label", f"Object #{ev.get('object_id', '?')}"),
                ev.get("zone_name"),
                ev["description"],
                ev.get("confidence", 0.95),
                ev.get("evidence_start", max(0.0, ev["timestamp"] - 5.0)),
                ev.get("evidence_end", ev.get("end_timestamp", ev["timestamp"] + 10.0)),
                json.dumps(ev.get("metadata", {}))
            ))
        conn.commit()
    finally:
        conn.close()

def get_events(video_id: str) -> List[Dict[str, Any]]:
    conn = get_db_connection()
    try:
        c = conn.cursor()
        c.execute("SELECT * FROM events WHERE video_id = ? ORDER BY timestamp ASC", (video_id,))
        rows = c.fetchall()
        return [{
            "id": r["id"],
            "video_id": r["video_id"],
            "timestamp": r["timestamp"],
            "end_timestamp": r["end_timestamp"],
            "event_type": r["event_type"],
            "object_id": r["object_id"],
            "object_label": r["object_label"],
            "zone_name": r["zone_name"],
            "description": r["description"],
            "confidence": r["confidence"],
            "evidence_start": r["evidence_start"],
            "evidence_end": r["evidence_end"],
            "metadata": json.loads(r["metadata_json"] or "{}")
        } for r in rows]
    finally:
        conn.close()

def save_tracks(video_id: str, tracks: List[Dict[str, Any]]):
    conn = get_db_connection()
    try:
        c = conn.cursor()
        c.execute("DELETE FROM tracks WHERE video_id = ?", (video_id,))
        for trk in tracks:
            c.execute("""
                INSERT INTO tracks (id, video_id, track_id, class_name, first_seen, last_seen, duration, confidence, is_moving, max_speed, displacement)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                f"trk_{video_id}_{trk['track_id']}",
                video_id,
                trk["track_id"],
                trk["class_name"],
                trk["first_seen"],
                trk["last_seen"],
                trk["duration"],
                trk.get("confidence", 0.9),
                1 if trk.get("is_moving") else 0,
                float(trk.get("max_speed", 0.0)),
                float(trk.get("displacement", 0.0))
            ))
        conn.commit()
    finally:
        conn.close()

def get_tracks(video_id: str) -> List[Dict[str, Any]]:
    conn = get_db_connection()
    try:
        c = conn.cursor()
        c.execute("SELECT * FROM tracks WHERE video_id = ? ORDER BY first_seen ASC", (video_id,))
        rows = c.fetchall()
        return [{
            "id": r["id"],
            "video_id": r["video_id"],
            "track_id": r["track_id"],
            "class_name": r["class_name"],
            "first_seen": r["first_seen"],
            "last_seen": r["last_seen"],
            "duration": r["duration"],
            "confidence": r["confidence"],
            "is_moving": bool(r["is_moving"]) if "is_moving" in r.keys() else False,
            "max_speed": float(r["max_speed"]) if "max_speed" in r.keys() else 0.0,
            "displacement": float(r["displacement"]) if "displacement" in r.keys() else 0.0
        } for r in rows]
    finally:
        conn.close()

def get_video(video_id: str) -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    try:
        c = conn.cursor()
        c.execute("SELECT * FROM videos WHERE id = ?", (video_id,))
        row = c.fetchone()
        if not row:
            return None
        return dict(row)
    finally:
        conn.close()

def get_all_videos() -> List[Dict[str, Any]]:
    conn = get_db_connection()
    try:
        c = conn.cursor()
        c.execute("SELECT * FROM videos ORDER BY created_at DESC")
        rows = c.fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()

def save_frame_detections(video_id: str, detections: List[Dict[str, Any]]):
    conn = get_db_connection()
    try:
        c = conn.cursor()
        c.execute("DELETE FROM frame_detections WHERE video_id = ?", (video_id,))
        records = []
        for idx, d in enumerate(detections):
            det_id = f"det_{video_id}_{idx}_{uuid.uuid4().hex[:6]}"
            bbox_norm = d.get("bbox_norm") or d.get("bbox", [0, 0, 0, 0])
            bbox_pixel = d.get("bbox_pixel") or d.get("bbox", [0, 0, 0, 0])
            records.append((
                det_id,
                video_id,
                d.get("frame_idx", 0),
                round(float(d.get("timestamp", 0.0)), 2),
                int(d.get("track_id", 0)),
                str(d.get("class_name", "object")),
                str(d.get("color_desc", "")),
                round(float(d.get("confidence", 0.9)), 3),
                json.dumps(bbox_norm),
                json.dumps(bbox_pixel),
                round(float(d.get("speed", 0.0)), 2) if d.get("speed") is not None else None,
                d.get("action", "idle"),
                d.get("zone_name")
            ))
        c.executemany("""
            INSERT INTO frame_detections (
                id, video_id, frame_idx, timestamp, track_id, class_name,
                color_desc, confidence, bbox_norm_json, bbox_pixel_json,
                speed, action, zone_name
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, records)
        conn.commit()
    finally:
        conn.close()

def get_frame_detections(video_id: str) -> List[Dict[str, Any]]:
    conn = get_db_connection()
    try:
        c = conn.cursor()
        c.execute("""
            SELECT id, frame_idx, timestamp, track_id, class_name,
                   color_desc, confidence, bbox_norm_json, bbox_pixel_json,
                   speed, action, zone_name
            FROM frame_detections
            WHERE video_id = ?
            ORDER BY timestamp ASC, track_id ASC
        """, (video_id,))
        rows = c.fetchall()
        return [{
            "id": r["id"],
            "frame_idx": r["frame_idx"],
            "timestamp": r["timestamp"],
            "track_id": r["track_id"],
            "class_name": r["class_name"],
            "color_desc": r["color_desc"],
            "confidence": r["confidence"],
            "bbox_norm": json.loads(r["bbox_norm_json"]),
            "bbox_pixel": json.loads(r["bbox_pixel_json"]) if r["bbox_pixel_json"] else None,
            "speed": r["speed"],
            "action": r["action"],
            "zone_name": r["zone_name"]
        } for r in rows]
    finally:
        conn.close()

