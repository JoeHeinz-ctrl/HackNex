import os
import math
import cv2
import numpy as np
from collections import Counter, defaultdict
from typing import List, Dict, Any, Optional

SURVEILLANCE_CLASSES = {
    0: "person",
    1: "bicycle",
    2: "car",
    3: "motorcycle",
    5: "bus",
    7: "truck",
    24: "backpack",
    26: "handbag",
    28: "suitcase"
}

def compute_iou(boxA, boxB):
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])
    interArea = max(0, xB - xA) * max(0, yB - yA)
    boxAArea = (boxA[2] - boxA[0]) * (boxA[3] - boxA[1])
    boxBArea = (boxB[2] - boxB[0]) * (boxB[3] - boxB[1])
    iou = interArea / float(boxAArea + boxBArea - interArea + 1e-6)
    return iou

def extract_dominant_color(crop: np.ndarray, is_person: bool = False) -> str:
    """
    Robust RGB channel comparison for true vehicle paint and clothing color.
    Excludes bottom bumper license plates to prevent false blue/yellow classifications.
    """
    if crop is None or crop.size == 0:
        return ""
    h, w = crop.shape[:2]
    if h < 8 or w < 8:
        return ""

    if is_person:
        y1, y2 = int(h * 0.18), max(int(h * 0.18) + 2, int(h * 0.55))
        x1, x2 = int(w * 0.20), max(int(w * 0.20) + 2, int(w * 0.80))
        sample = crop[y1:y2, x1:x2]
    else:
        # For vehicle: Sample hood, roof, and main body, avoiding bottom-center license plate
        sample = crop[int(h * 0.10):int(h * 0.65), int(w * 0.10):int(w * 0.90)]
        if sample.size == 0:
            sample = crop

    if sample.size == 0:
        sample = crop

    b_ch = sample[:, :, 0].astype(float)
    g_ch = sample[:, :, 1].astype(float)
    r_ch = sample[:, :, 2].astype(float)

    valid = (r_ch + g_ch + b_ch > 40) & (r_ch + g_ch + b_ch < 700)
    if not np.any(valid):
        valid = np.ones_like(r_ch, dtype=bool)

    # 1. Chromatic paint ratios
    red_mask = valid & (r_ch > g_ch * 1.15) & (r_ch > b_ch * 1.15) & (r_ch > 45)
    red_ratio = float(np.mean(red_mask))

    # True blue paint: require stronger ratio on the body so a license plate doesn't trigger it
    blue_mask = valid & (b_ch > r_ch * 1.25) & (b_ch > g_ch * 1.15) & (b_ch > 50)
    blue_ratio = float(np.mean(blue_mask))

    green_mask = valid & (g_ch > r_ch * 1.15) & (g_ch > b_ch * 1.15) & (g_ch > 45)
    green_ratio = float(np.mean(green_mask))

    yellow_mask = valid & (r_ch > 105) & (g_ch > 100) & (b_ch < np.minimum(r_ch, g_ch) * 0.70)
    yellow_ratio = float(np.mean(yellow_mask))

    if red_ratio > 0.06:
        return "red"
    if blue_ratio > 0.12:
        return "blue"
    if green_ratio > 0.08:
        return "green"
    if yellow_ratio > 0.06:
        return "yellow"

    # 2. Achromatic luminance
    bright = float(np.median((r_ch[valid] + g_ch[valid] + b_ch[valid]) / 3.0))
    if bright < 65:
        return "black"
    if bright > 165:
        return "white"
    return "dark gray" if bright < 105 else "silver/gray"


class DetectorTracker:
    def __init__(self, model_name: str = "yolov8n.pt", tracker_type: str = "bytetrack.yaml"):
        self.model_name = model_name
        self.tracker_type = tracker_type
        self.model = None

        # Track consensus records
        self.track_class_votes: Dict[int, Counter] = defaultdict(Counter)
        self.track_color_samples: Dict[int, List[str]] = defaultdict(list)
        self.trails: Dict[int, List[List[float]]] = defaultdict(list)
        self.prev_positions: Dict[int, Tuple[float, float, float]] = {}

        # Occlusion re-identification memory
        self.raw_to_canonical: Dict[int, int] = {}
        self.track_records: Dict[int, Dict[str, Any]] = {}

        self._init_model()

    def _init_model(self):
        try:
            from ultralytics import YOLO
            self.model = YOLO(self.model_name)
        except Exception as e:
            print(f"[DetectorTracker] Warning: YOLO init failed ({e})")
            self.model = None

    def _get_consensus_class(self, track_id: int, current_class: str) -> str:
        votes = self.track_class_votes[track_id]
        if not votes:
            return current_class

        vehicle_classes = {"car", "truck", "bus"}
        if any(c in votes for c in vehicle_classes):
            car_cnt = votes["car"]
            truck_cnt = votes["truck"]
            bus_cnt = votes["bus"]
            total = car_cnt + truck_cnt + bus_cnt
            # Standard passenger cars/SUVs often get misclassified as trucks: enforce car
            if car_cnt > 0 and (car_cnt >= truck_cnt or (car_cnt / max(1, total)) >= 0.25):
                return "car"
            elif bus_cnt > total * 0.65:
                return "bus"
            elif truck_cnt > total * 0.75:
                return "truck"
            else:
                return "car"

        if votes["person"] > 0:
            return "person"

        return votes.most_common(1)[0][0]

    def _get_consensus_color(self, track_id: int, class_name: str) -> str:
        samples = self.track_color_samples[track_id]
        if not samples:
            return ""
        cnt = Counter(samples)
        non_generic = [c for c, _ in cnt.most_common() if c not in ["", "gray", "dark gray"]]
        best_c = non_generic[0] if non_generic else cnt.most_common(1)[0][0]
        if not best_c:
            return ""
        return f" wearing {best_c}" if class_name == "person" else f" ({best_c})"

    def track_frame(self, frame_bgr: np.ndarray, frame_idx: int, timestamp: float) -> List[Dict[str, Any]]:
        """
        Runs clean, production-grade tracking with realistic confidence (0.35)
        and predictive occlusion recovery for objects passing behind trees or signboards.
        """
        if frame_bgr is None or self.model is None:
            return []

        h_frame, w_frame = frame_bgr.shape[:2]

        try:
            # Clean confidence threshold (0.35) eliminates phantom steering wheel persons
            results = self.model.track(
                source=frame_bgr,
                persist=True,
                tracker=self.tracker_type,
                conf=0.35,
                iou=0.45,
                verbose=False,
                classes=list(SURVEILLANCE_CLASSES.keys())
            )

            if not results or len(results) == 0 or results[0].boxes is None:
                return []

            boxes = results[0].boxes
            raw_dets = []
            vehicle_bboxes = []

            for i in range(len(boxes)):
                conf = float(boxes.conf[i].cpu().item())
                cls_id = int(boxes.cls[i].cpu().item())
                cname = SURVEILLANCE_CLASSES.get(cls_id, self.model.names.get(cls_id, "object"))
                xyxy = boxes.xyxy[i].cpu().numpy().tolist()

                px1, py1, px2, py2 = xyxy
                pw = px2 - px1
                ph = py2 - py1

                # Discard tiny artifacts (< 400 pixels total area)
                if pw * ph < 400:
                    continue

                nx1 = round(max(0.0, min(1.0, px1 / w_frame)), 4)
                ny1 = round(max(0.0, min(1.0, py1 / h_frame)), 4)
                nx2 = round(max(0.0, min(1.0, px2 / w_frame)), 4)
                ny2 = round(max(0.0, min(1.0, py2 / h_frame)), 4)

                track_id = int(boxes.id[i].cpu().item()) if boxes.id is not None and boxes.id[i] is not None else i + 1

                if cname in ["car", "truck", "bus"]:
                    vehicle_bboxes.append((nx1, ny1, nx2, ny2))

                raw_dets.append({
                    "i": i,
                    "raw_id": track_id,
                    "class_name": cname,
                    "conf": conf,
                    "xyxy": xyxy,
                    "norm": [nx1, ny1, nx2, ny2],
                    "pw": pw,
                    "ph": ph,
                    "cx": (nx1 + nx2) / 2.0,
                    "cy": (ny1 + ny2) / 2.0,
                    "w": nx2 - nx1,
                    "h": ny2 - ny1
                })

            # Sort by confidence descending
            raw_dets.sort(key=lambda x: -x["conf"])

            # 1. Intra-frame NMS & Spatial Filtering
            filtered_dets = []
            for d in raw_dets:
                cname = d["class_name"]

                # Spatial filter: A person CANNOT be inside the windshield/body of a car
                if cname == "person":
                    if d["ph"] < d["pw"] * 0.85:
                        continue
                    is_inside_car = False
                    for vx1, vy1, vx2, vy2 in vehicle_bboxes:
                        if vx1 + 0.05 < d["cx"] < vx2 - 0.05 and vy1 + 0.05 < d["cy"] < vy2 - 0.05:
                            is_inside_car = True
                            break
                    if is_inside_car:
                        continue

                # Duplicate vehicle suppression: reject overlapping boxes on the same car
                if cname in ["car", "truck", "bus"]:
                    is_dup = False
                    for existing in filtered_dets:
                        if existing["class_name"] in ["car", "truck", "bus"]:
                            if compute_iou(d["norm"], existing["norm"]) > 0.35:
                                is_dup = True
                                break
                    if is_dup:
                        continue

                filtered_dets.append(d)

            # 2. Occlusion Re-Identification Matching
            valid_dets = []
            frame_assigned_canonical = set()

            for d in filtered_dets:
                raw_id = d["raw_id"]
                cname = d["class_name"]
                cls_family = "vehicle" if cname in ["car", "truck", "bus", "motorcycle", "bicycle"] else "person"
                cx, cy = d["cx"], d["cy"]
                w, h = d["w"], d["h"]

                # Extract crop color early for matching
                px1, py1, px2, py2 = d["xyxy"]
                ix1, iy1 = max(0, int(px1)), max(0, int(py1))
                ix2, iy2 = min(w_frame, int(px2)), min(h_frame, int(py2))
                crop = frame_bgr[iy1:iy2, ix1:ix2]
                color = extract_dominant_color(crop, is_person=(cls_family == "person"))

                if raw_id in self.raw_to_canonical and self.raw_to_canonical[raw_id] not in frame_assigned_canonical:
                    canonical_id = self.raw_to_canonical[raw_id]
                else:
                    # Check against occluded / dormant tracks
                    best_match_id = None
                    best_score = float('inf')

                    for old_cid, trk in self.track_records.items():
                        if old_cid in frame_assigned_canonical:
                            continue
                        if trk["class_family"] != cls_family:
                            continue
                        dt = timestamp - trk["last_timestamp"]
                        if dt < 0.08 or dt > 4.5:
                            continue

                        # Project position along trajectory
                        vx, vy = trk["velocity"]
                        pred_cx = max(0.0, min(1.0, trk["last_center"][0] + vx * dt))
                        pred_cy = max(0.0, min(1.0, trk["last_center"][1] + vy * dt))

                        dist_pred = math.hypot(cx - pred_cx, cy - pred_cy)
                        dist_last = math.hypot(cx - trk["last_center"][0], cy - trk["last_center"][1])
                        eff_dist = min(dist_pred, dist_last)

                        # Color compatibility check
                        trk_color = trk.get("dominant_color", "")
                        chromatics = {"red", "blue", "green", "yellow"}
                        if color in chromatics and trk_color in chromatics and color != trk_color:
                            continue

                        # Size compatibility check
                        last_w, last_h = trk["last_dims"]
                        area_ratio = min(w * h, last_w * last_h) / max(1e-5, max(w * h, last_w * last_h))
                        if area_ratio < 0.20:
                            continue

                        # Distance threshold grows with occlusion time
                        max_allowed = 0.16 + (0.08 * dt)
                        if eff_dist < max_allowed and eff_dist < best_score:
                            best_score = eff_dist
                            best_match_id = old_cid

                    if best_match_id is not None:
                        canonical_id = best_match_id
                        self.raw_to_canonical[raw_id] = canonical_id
                    else:
                        canonical_id = raw_id
                        self.raw_to_canonical[raw_id] = canonical_id

                frame_assigned_canonical.add(canonical_id)

                # Update track records
                if canonical_id in self.track_records:
                    prev = self.track_records[canonical_id]
                    dt = max(0.02, timestamp - prev["last_timestamp"])
                    inst_vx = (cx - prev["last_center"][0]) / dt
                    inst_vy = (cy - prev["last_center"][1]) / dt
                    old_vx, old_vy = prev["velocity"]
                    prev["velocity"] = (round(old_vx * 0.6 + inst_vx * 0.4, 4), round(old_vy * 0.6 + inst_vy * 0.4, 4))
                    prev["last_center"] = (cx, cy)
                    prev["last_dims"] = (w, h)
                    prev["last_timestamp"] = timestamp
                    prev["total_detections"] += 1
                    if color:
                        prev["dominant_color"] = color
                else:
                    self.track_records[canonical_id] = {
                        "canonical_id": canonical_id,
                        "class_family": cls_family,
                        "class_name": cname,
                        "last_center": (cx, cy),
                        "last_dims": (w, h),
                        "velocity": (0.0, 0.0),
                        "last_timestamp": timestamp,
                        "total_detections": 1,
                        "dominant_color": color
                    }

                tid = canonical_id
                self.track_class_votes[tid][cname] += 1
                canonical_class = self._get_consensus_class(tid, cname)

                if color:
                    self.track_color_samples[tid].append(color)
                canonical_color = self._get_consensus_color(tid, canonical_class)

                # Motion and kinematics
                speed_px_sec = 0.0
                action = "stationary"
                if tid in self.prev_positions:
                    prev_cx, prev_cy, prev_t = self.prev_positions[tid]
                    dt = max(0.01, timestamp - prev_t)
                    dist = math.sqrt(((cx - prev_cx) * w_frame)**2 + ((cy - prev_cy) * h_frame)**2)
                    speed_px_sec = round(dist / dt, 1)

                    if canonical_class == "person":
                        action = "walking" if speed_px_sec > 12 else "stationary"
                    elif canonical_class in ["car", "truck", "bus"]:
                        action = "cruising" if speed_px_sec > 20 else "stationary"

                self.prev_positions[tid] = (cx, cy, timestamp)

                # Trajectory trail
                ncx = round(cx, 4)
                ncy = round(cy, 4)
                self.trails[tid].append([ncx, ncy])
                if len(self.trails[tid]) > 15:
                    self.trails[tid].pop(0)

                nx1, ny1, nx2, ny2 = d["norm"]
                valid_dets.append({
                    "track_id": tid,
                    "class_name": canonical_class,
                    "color_desc": canonical_color,
                    "confidence": round(d["conf"], 3),
                    "bbox": [round(c, 1) for c in d["xyxy"]],
                    "bbox_pixel": [round(c, 1) for c in d["xyxy"]],
                    "bbox_norm": [nx1, ny1, nx2, ny2],
                    "speed": speed_px_sec,
                    "action": action,
                    "heading": "",
                    "trail": list(self.trails[tid]),
                    "frame_idx": frame_idx,
                    "timestamp": round(timestamp, 2)
                })

            return valid_dets

        except Exception as ex:
            print(f"[DetectorTracker] Track error: {ex}")
            return []
