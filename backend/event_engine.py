import math
from typing import List, Dict, Any, Tuple, Optional
from collections import Counter
from zone_geometry import MultiZoneTracker, get_default_zones

class EventEngine:
    def __init__(self, zones: Optional[List[Dict[str, Any]]] = None):
        self.zones = zones or get_default_zones()
        self.zone_tracker = MultiZoneTracker(self.zones)
        # Track histories: track_id -> list of detection records
        self.track_histories: Dict[int, List[Dict[str, Any]]] = {}
        # Track class names: track_id -> most frequent class
        self.track_classes: Dict[int, str] = {}
        # Events accumulated
        self.events: List[Dict[str, Any]] = []
        # Debounce tracking for anomaly events: (track_id, event_type) -> last_emitted_time
        self.emitted_anomalies: Dict[Tuple[int, str], float] = {}

    def process_frame_detections(self, detections: List[Dict[str, Any]], timestamp: float) -> List[Dict[str, Any]]:
        new_events = []

        for d in detections:
            tid = d["track_id"]
            cname = d["class_name"]
            color_desc = d.get("color_desc", "")
            full_name = (cname + color_desc).strip()
            bbox_norm = d.get("bbox_norm") or [0, 0, 1, 1]
            speed = d.get("speed", 0.0)
            action = d.get("action", "stationary")
            heading = d.get("heading", "")

            # Tag detection with active surveillance zone
            zone_name = self.zone_tracker.get_zone_for_bbox(bbox_norm)
            d["zone_name"] = zone_name

            # Update latest track class name
            self.track_classes[tid] = full_name

            if tid not in self.track_histories:
                self.track_histories[tid] = []
                # Scene Entry Event
                ev = {
                    "event_type": "scene_entry",
                    "timestamp": round(timestamp, 2),
                    "object_id": tid,
                    "object_label": f"{full_name.capitalize()} #{tid}",
                    "zone_name": zone_name,
                    "description": f"{full_name.capitalize()} #{tid} entered camera view" + (f" in {zone_name}" if zone_name else ""),
                    "confidence": d["confidence"],
                    "evidence_start": max(0.0, timestamp - 1.5),
                    "evidence_end": timestamp + 4.0
                }
                new_events.append(ev)
                self.events.append(ev)

                # Special arrival event for vehicles
                if cname in ["car", "truck", "bus", "motorcycle", "bicycle"]:
                    ev_veh = {
                        "event_type": f"{cname}_arrived",
                        "timestamp": round(timestamp, 2),
                        "object_id": tid,
                        "object_label": f"{full_name.capitalize()} #{tid}",
                        "zone_name": zone_name,
                        "description": f"{full_name.capitalize()} #{tid} arrived in scene",
                        "confidence": d["confidence"],
                        "evidence_start": max(0.0, timestamp - 1.5),
                        "evidence_end": timestamp + 6.0
                    }
                    new_events.append(ev_veh)
                    self.events.append(ev_veh)

            self.track_histories[tid].append(d)

            # Spatial Zone updates (entry, exit, loitering)
            z_events = self.zone_tracker.update(tid, bbox_norm, timestamp, f"{full_name.capitalize()} #{tid}")
            for ze in z_events:
                new_events.append(ze)
                self.events.append(ze)

            # Speed & Kinematic Anomaly Detection
            if action in ["running", "speeding"] and speed > 80:
                anomaly_key = (tid, action)
                last_time = self.emitted_anomalies.get(anomaly_key, -999.0)
                if timestamp - last_time > 8.0:
                    self.emitted_anomalies[anomaly_key] = timestamp
                    heading_str = f" heading {heading}" if heading else ""
                    ev_anomaly = {
                        "event_type": f"high_speed_{action}",
                        "timestamp": round(timestamp, 2),
                        "object_id": tid,
                        "object_label": f"{full_name.capitalize()} #{tid}",
                        "zone_name": zone_name,
                        "description": f"{full_name.capitalize()} #{tid} observed {action} ({int(speed)} px/s){heading_str}",
                        "confidence": 0.92,
                        "evidence_start": max(0.0, timestamp - 2.0),
                        "evidence_end": timestamp + 3.0
                    }
                    new_events.append(ev_anomaly)
                    self.events.append(ev_anomaly)

            # Directional Motion Tracking
            history = self.track_histories[tid]
            if len(history) % 12 == 0 and len(history) >= 12:
                first = history[-12]
                last = history[-1]
                b1 = first.get("bbox_norm", [0, 0, 0, 0])
                b2 = last.get("bbox_norm", [0, 0, 0, 0])
                dnx = (b2[0] + b2[2]) / 2 - (b1[0] + b1[2]) / 2
                dny = (b2[1] + b2[3]) / 2 - (b1[1] + b1[3]) / 2

                if abs(dnx) > 0.04 or abs(dny) > 0.04:
                    x_dir = "right" if dnx > 0.04 else "left" if dnx < -0.04 else ""
                    y_dir = "downward" if dny > 0.04 else "upward" if dny < -0.04 else ""
                    direction = f"{y_dir} {x_dir}".strip()
                    if direction:
                        ev_dir = {
                            "event_type": f"moving_{direction.replace(' ', '_')}",
                            "timestamp": round(timestamp, 2),
                            "object_id": tid,
                            "object_label": f"{full_name.capitalize()} #{tid}",
                            "zone_name": zone_name,
                            "description": f"{full_name.capitalize()} #{tid} moving {direction}",
                            "confidence": 0.89,
                            "evidence_start": max(0.0, timestamp - 2.0),
                            "evidence_end": timestamp + 2.0
                        }
                        if not any(e["event_type"] == ev_dir["event_type"] and e["object_id"] == tid for e in self.events):
                            new_events.append(ev_dir)
                            self.events.append(ev_dir)

        # Multi-Object Interactions
        for i in range(len(detections)):
            for j in range(i + 1, len(detections)):
                d1, d2 = detections[i], detections[j]
                c1, c2 = d1["class_name"], d2["class_name"]
                fn1 = self.track_classes.get(d1["track_id"], c1)
                fn2 = self.track_classes.get(d2["track_id"], c2)

                bn1, bn2 = d1.get("bbox_norm", [0, 0, 0, 0]), d2.get("bbox_norm", [0, 0, 0, 0])
                nc1 = ((bn1[0] + bn1[2]) / 2, (bn1[1] + bn1[3]) / 2)
                nc2 = ((bn2[0] + bn2[2]) / 2, (bn2[1] + bn2[3]) / 2)
                norm_dist = ((nc1[0] - nc2[0])**2 + (nc1[1] - nc2[1])**2)**0.5

                # 1. Person with Bag/Luggage
                if norm_dist < 0.12 and (
                    ("person" in c1 and c2 in ["backpack", "handbag", "suitcase"]) or
                    ("person" in c2 and c1 in ["backpack", "handbag", "suitcase"])
                ):
                    inter_key = (min(d1["track_id"], d2["track_id"]), "luggage_proximity")
                    last_time = self.emitted_anomalies.get(inter_key, -999.0)
                    if timestamp - last_time > 6.0:
                        self.emitted_anomalies[inter_key] = timestamp
                        inter_ev = {
                            "event_type": "object_interaction",
                            "timestamp": round(timestamp, 2),
                            "object_id": d1["track_id"],
                            "object_label": f"{fn1.capitalize()} #{d1['track_id']}",
                            "description": f"{fn1.capitalize()} #{d1['track_id']} carrying {fn2.capitalize()} #{d2['track_id']}",
                            "confidence": 0.88,
                            "evidence_start": max(0.0, timestamp - 2.0),
                            "evidence_end": timestamp + 4.0
                        }
                        new_events.append(inter_ev)
                        self.events.append(inter_ev)

                # 2. Person approaching Vehicle
                elif norm_dist < 0.18 and (
                    ("person" in c1 and c2 in ["car", "truck", "bus"]) or
                    ("person" in c2 and c1 in ["car", "truck", "bus"])
                ):
                    veh_label = fn2 if "person" in c1 else fn1
                    ped_label = fn1 if "person" in c1 else fn2
                    veh_id = d2["track_id"] if "person" in c1 else d1["track_id"]
                    inter_key = (veh_id, "vehicle_approach")
                    last_time = self.emitted_anomalies.get(inter_key, -999.0)
                    if timestamp - last_time > 8.0:
                        self.emitted_anomalies[inter_key] = timestamp
                        approach_ev = {
                            "event_type": "vehicle_approach",
                            "timestamp": round(timestamp, 2),
                            "object_id": veh_id,
                            "object_label": f"{ped_label.capitalize()}",
                            "description": f"{ped_label.capitalize()} near {veh_label.capitalize()}",
                            "confidence": 0.87,
                            "evidence_start": max(0.0, timestamp - 2.0),
                            "evidence_end": timestamp + 4.0
                        }
                        new_events.append(approach_ev)
                        self.events.append(approach_ev)

        return new_events

    def finalize(self, total_duration: float) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        tracks_summary = []
        for tid, history in self.track_histories.items():
            if not history or len(history) < 3:
                continue
            first_t = history[0]["timestamp"]
            last_t = history[-1]["timestamp"]
            duration = max(0.0, last_t - first_t)

            # Consensus class and color from the latest refined detection
            last_d = history[-1]
            cname = last_d.get("class_name", "object")
            color_desc = last_d.get("color_desc", "")
            final_label = f"{cname}{color_desc}".strip()
            self.track_classes[tid] = final_label

            max_speed = max([h.get("speed", 0.0) for h in history], default=0.0)
            primary_zone = None
            zones_seen = [h.get("zone_name") for h in history if h.get("zone_name")]
            if zones_seen:
                primary_zone = max(set(zones_seen), key=zones_seen.count)

            first_norm = history[0].get("bbox_norm", [0, 0, 0, 0])
            last_norm = history[-1].get("bbox_norm", [0, 0, 0, 0])
            c1 = ((first_norm[0] + first_norm[2]) / 2, (first_norm[1] + first_norm[3]) / 2)
            c2 = ((last_norm[0] + last_norm[2]) / 2, (last_norm[1] + last_norm[3]) / 2)
            displacement = math.hypot(c2[0] - c1[0], c2[1] - c1[1])
            is_moving = displacement > 0.06 and max_speed > 30.0

            tracks_summary.append({
                "track_id": tid,
                "class_name": final_label,
                "first_seen": round(first_t, 2),
                "last_seen": round(last_t, 2),
                "duration": round(duration, 2),
                "confidence": max(h["confidence"] for h in history),
                "max_speed": round(max_speed, 1),
                "displacement": round(displacement, 3),
                "is_moving": is_moving,
                "primary_zone": primary_zone
            })

            # If track vanished before video end, emit scene_exit event
            if total_duration - last_t > 0.4:
                ev = {
                    "event_type": "scene_exit",
                    "timestamp": round(last_t, 2),
                    "object_id": tid,
                    "object_label": f"{final_label.capitalize()} #{tid}",
                    "zone_name": primary_zone,
                    "description": f"{final_label.capitalize()} #{tid} exited camera view",
                    "confidence": 0.90,
                    "evidence_start": max(0.0, last_t - 2.5),
                    "evidence_end": min(total_duration, last_t + 1.5)
                }
                self.events.append(ev)

        valid_tids = set(t["track_id"] for t in tracks_summary)
        # Filter out events belonging to suppressed micro-tracks
        self.events = [e for e in self.events if e.get("object_id") is None or e.get("object_id") in valid_tids]

        # Backfill all events with their final consensus object labels
        for ev in self.events:
            oid = ev.get("object_id")
            if oid in self.track_classes:
                canonical = self.track_classes[oid]
                ev["object_label"] = f"{canonical.capitalize()} #{oid}"

        self.events.sort(key=lambda x: x["timestamp"])
        return self.events, tracks_summary
