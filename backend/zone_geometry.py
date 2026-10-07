from typing import List, Tuple, Dict, Any, Optional
import numpy as np
from shapely.geometry import Point, Polygon, MultiPoint

def get_default_zones() -> List[Dict[str, Any]]:
    """
    Returns realistic surveillance zones in normalized coordinates [0.0 - 1.0].
    """
    return [
        {
            "name": "Transit Roadway",
            "zone_type": "traffic",
            "polygon": [
                [0.15, 0.40],
                [0.85, 0.40],
                [0.95, 0.95],
                [0.05, 0.95]
            ],
            "color": "#3b82f6"  # Blue
        },
        {
            "name": "Pedestrian Walkway",
            "zone_type": "pedestrian",
            "polygon": [
                [0.55, 0.35],
                [0.98, 0.35],
                [0.98, 0.85],
                [0.65, 0.85]
            ],
            "color": "#10b981"  # Emerald
        },
        {
            "name": "Restricted Perimeter",
            "zone_type": "restricted",
            "polygon": [
                [0.02, 0.05],
                [0.98, 0.05],
                [0.98, 0.30],
                [0.02, 0.30]
            ],
            "color": "#f59e0b"  # Amber
        }
    ]

def generate_adaptive_zones(detections: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Analyzes accumulated object trajectory points across the entire video
    and computes authentic polygonal zones matching the actual movement areas.
    """
    if not detections:
        return get_default_zones()

    vehicle_pts = []
    pedestrian_pts = []

    for d in detections:
        cname = d.get("class_name", "").lower()
        bn = d.get("bbox_norm")
        if not bn or len(bn) < 4:
            continue
        nx1, ny1, nx2, ny2 = bn
        cx = (nx1 + nx2) / 2.0
        # Bottom center is best spatial indicator of road / sidewalk footprint
        cy = ny2

        if cname in ["car", "truck", "bus", "motorcycle"]:
            vehicle_pts.append((cx, cy))
        elif cname == "person":
            pedestrian_pts.append((cx, cy))

    zones = []

    # 1. Compute Roadway / Transit Lane from vehicle footprints
    if len(vehicle_pts) >= 4:
        try:
            mp = MultiPoint(vehicle_pts)
            hull = mp.convex_hull
            # Add small buffer padding (0.04 in normalized space)
            padded = hull.buffer(0.04)
            coords = list(padded.exterior.coords)
            # Simplify polygon to clean 4-8 vertex boundary
            poly = Polygon(coords).simplify(0.02, preserve_topology=True)
            norm_coords = [[round(max(0.0, min(1.0, pt[0])), 3), round(max(0.0, min(1.0, pt[1])), 3)] for pt in poly.exterior.coords[:-1]]
            if len(norm_coords) >= 3:
                zones.append({
                    "name": "Transit Roadway",
                    "zone_type": "traffic",
                    "polygon": norm_coords,
                    "color": "#3b82f6"
                })
        except Exception as e:
            print(f"[ZoneGeometry] Roadway polygon extraction failed: {e}")

    # 2. Compute Pedestrian Walkway from pedestrian footprints
    if len(pedestrian_pts) >= 4:
        try:
            mp = MultiPoint(pedestrian_pts)
            hull = mp.convex_hull
            padded = hull.buffer(0.03)
            poly = Polygon(padded.exterior.coords).simplify(0.02, preserve_topology=True)
            norm_coords = [[round(max(0.0, min(1.0, pt[0])), 3), round(max(0.0, min(1.0, pt[1])), 3)] for pt in poly.exterior.coords[:-1]]
            if len(norm_coords) >= 3:
                zones.append({
                    "name": "Pedestrian Walkway",
                    "zone_type": "pedestrian",
                    "polygon": norm_coords,
                    "color": "#10b981"
                })
        except Exception as e:
            print(f"[ZoneGeometry] Pedestrian walkway extraction failed: {e}")

    # Fallback if motion was sparse
    if not zones:
        return get_default_zones()

    # Always ensure a Restricted / Security zone exists for perimeter monitoring
    has_restricted = any(z["zone_type"] == "restricted" for z in zones)
    if not has_restricted:
        zones.append({
            "name": "Restricted Perimeter",
            "zone_type": "restricted",
            "polygon": [
                [0.02, 0.05],
                [0.98, 0.05],
                [0.98, 0.28],
                [0.02, 0.28]
            ],
            "color": "#f59e0b"
        })

    return zones


class ZoneGeometry:
    def __init__(self, name: str, polygon_coords: List[List[float]], zone_type: str = "restricted", color: str = "#3b82f6"):
        self.name = name
        self.zone_type = zone_type
        self.color = color
        self.coords = polygon_coords
        clean_coords = [tuple(p) for p in polygon_coords]
        if len(clean_coords) < 3:
            # Fallback trivial polygon
            clean_coords = [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0)]
        self.polygon = Polygon(clean_coords)

    def is_inside(self, x: float, y: float) -> bool:
        """Check if point (x, y) is inside the polygon."""
        try:
            point = Point(x, y)
            return self.polygon.contains(point) or self.polygon.touches(point)
        except Exception:
            return False

    def bbox_inside_ratio(self, bbox: List[float]) -> float:
        """
        bbox: [x1, y1, x2, y2]
        Checks if bottom center (ground position) or geometric center is inside zone.
        """
        if not bbox or len(bbox) < 4:
            return 0.0
        x1, y1, x2, y2 = bbox
        bottom_center_x = (x1 + x2) / 2.0
        bottom_center_y = y2
        if self.is_inside(bottom_center_x, bottom_center_y):
            return 1.0

        center_x = (x1 + x2) / 2.0
        center_y = (y1 + y2) / 2.0
        if self.is_inside(center_x, center_y):
            return 0.8

        return 0.0


class MultiZoneTracker:
    def __init__(self, zones: Optional[List[Dict[str, Any]]] = None):
        if not zones:
            zones = get_default_zones()
        self.zones = [
            ZoneGeometry(z["name"], z["polygon"], z.get("zone_type", "restricted"), z.get("color", "#3b82f6"))
            for z in zones
        ]
        # track_id -> zone_name -> bool (is_inside_last_frame)
        self.state: Dict[int, Dict[str, bool]] = {}
        # track_id -> zone_name -> enter_timestamp
        self.entry_times: Dict[int, Dict[str, float]] = {}
        # track_id -> set of zone names where loiter event already emitted
        self.loiter_emitted: Dict[int, set] = {}

    def get_zone_for_bbox(self, bbox: List[float]) -> Optional[str]:
        """Finds primary zone for a given normalized bounding box."""
        for zone in self.zones:
            if zone.bbox_inside_ratio(bbox) >= 0.5:
                return zone.name
        return None

    def update(self, track_id: int, bbox: List[float], timestamp: float, object_label: str = "") -> List[Dict[str, Any]]:
        """
        Updates zone states for an object track and returns newly triggered spatial events.
        """
        triggered_events = []
        if track_id not in self.state:
            self.state[track_id] = {z.name: False for z in self.zones}
            self.entry_times[track_id] = {}
            self.loiter_emitted[track_id] = set()

        for zone in self.zones:
            zname = zone.name
            inside = zone.bbox_inside_ratio(bbox) >= 0.5
            was_inside = self.state[track_id].get(zname, False)

            if inside and not was_inside:
                # ZONE ENTRY EVENT
                self.state[track_id][zname] = True
                self.entry_times[track_id][zname] = timestamp

                ev_type = "zone_entry"
                if zone.zone_type == "restricted":
                    ev_type = "security_perimeter_breach"
                elif zone.zone_type == "pedestrian":
                    ev_type = "pedestrian_walkway_entry"
                elif zone.zone_type == "traffic":
                    ev_type = "roadway_entry"

                triggered_events.append({
                    "event_type": ev_type,
                    "timestamp": round(timestamp, 2),
                    "object_id": track_id,
                    "object_label": object_label,
                    "zone_name": zname,
                    "description": f"{object_label} entered {zname}",
                    "confidence": 0.94,
                    "evidence_start": max(0.0, timestamp - 1.5),
                    "evidence_end": timestamp + 4.0
                })

            elif not inside and was_inside:
                # ZONE EXIT EVENT
                self.state[track_id][zname] = False
                dwell_time = timestamp - self.entry_times[track_id].get(zname, timestamp)
                triggered_events.append({
                    "event_type": "zone_exit",
                    "timestamp": round(timestamp, 2),
                    "object_id": track_id,
                    "object_label": object_label,
                    "zone_name": zname,
                    "description": f"{object_label} exited {zname} (dwell: {round(dwell_time, 1)}s)",
                    "confidence": 0.91,
                    "evidence_start": max(0.0, timestamp - 2.0),
                    "evidence_end": timestamp + 2.0
                })

            elif inside and was_inside:
                # LOITERING CHECK (dwell > 10.0 seconds in sensitive/pedestrian zones)
                enter_t = self.entry_times[track_id].get(zname, timestamp)
                dwell = timestamp - enter_t
                if dwell >= 10.0 and zname not in self.loiter_emitted[track_id]:
                    self.loiter_emitted[track_id].add(zname)
                    triggered_events.append({
                        "event_type": "loitering_alert",
                        "timestamp": round(timestamp, 2),
                        "object_id": track_id,
                        "object_label": object_label,
                        "zone_name": zname,
                        "description": f"{object_label} lingering in {zname} for over {int(dwell)}s",
                        "confidence": 0.90,
                        "evidence_start": max(0.0, enter_t),
                        "evidence_end": timestamp + 4.0
                    })

        return triggered_events
