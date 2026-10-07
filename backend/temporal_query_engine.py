import re
from typing import List, Dict, Any, Optional

def format_ts(seconds: float) -> str:
    total_secs = int(round(seconds))
    mins = total_secs // 60
    secs = total_secs % 60
    return f"{mins:02d}:{secs:02d}"

class TemporalQueryEngine:
    def __init__(self, events: List[Dict[str, Any]], tracks: List[Dict[str, Any]]):
        self.events = sorted(events, key=lambda x: x["timestamp"])
        self.tracks = tracks

    def query(self, raw_question: str) -> Dict[str, Any]:
        if not self.events and not self.tracks:
            return {
                "answer": "No detected events or tracked objects found for this video. Please upload and process a video first.",
                "timeline": [],
                "confidence": 0.0
            }

        q = raw_question.strip().lower()

        # Dynamic intent classification:
        # 0. Precise Ordinal queries: "when does the 2nd car exit the frame", "when did the 1st car enter", etc.
        ord_res = self._handle_dynamic_ordinal(q)
        if ord_res:
            return ord_res

        # 1. Relational 'after' queries
        if "after" in q and ("who" in q or "which" in q or "what" in q or "did" in q):
            return self._handle_dynamic_after(q)

        # 2. Relational 'before' queries
        if "before" in q and ("who" in q or "which" in q or "what" in q or "did" in q):
            return self._handle_dynamic_before(q)

        # 3. Between queries
        if "between" in q and "and" in q:
            return self._handle_dynamic_between(q)

        # 4. Duration queries
        if "how long" in q or "duration" in q or "stay" in q or "remain" in q:
            return self._handle_dynamic_duration(q)

        # 5. Count queries
        if "how many" in q or "count" in q or "number of" in q:
            return self._handle_dynamic_count(q)

        # 6. Entity localization: "When did X enter / arrive?"
        if "when did" in q or "what time" in q or "when was" in q or "when does" in q:
            return self._handle_dynamic_when(q)

        # 7. Direction queries
        if "moving" in q or "went" in q or "direction" in q:
            return self._handle_dynamic_direction(q)

        # 8. Fallback: Semantic dynamic matcher across actual detected events
        return self._handle_dynamic_fallback(q)

    def _is_track_moving(self, t: Dict[str, Any]) -> bool:
        """Determines whether a track was actively in motion vs parked/stationary."""
        disp = t.get("displacement", 0.0)
        if disp > 0.06:
            return True
        if disp > 0 and disp < 0.03:
            return False
        if t.get("is_moving") is False:
            return False
        if t.get("is_moving") is True and disp > 0.04:
            return True
        tid = t["track_id"]
        for e in self.events:
            if e.get("object_id") == tid:
                etype = e.get("event_type", "")
                if "moving_" in etype or "zone_exit" in etype or "high_speed" in etype or "scene_exit" in etype:
                    return True
        return t.get("first_seen", 0) > 0.1

    def _handle_dynamic_ordinal(self, q: str) -> Optional[Dict[str, Any]]:
        """
        Handles precise ordinal queries such as:
        - "when does the 2nd moving car enter the camera frame"
        - "when does the 2nd car exit the frame"
        - "when did the first moving car enter"
        - "when does the last car exit"
        """
        ordinal_map = {
            "1st": 1, "first": 1, "one": 1,
            "2nd": 2, "second": 2, "two": 2,
            "3rd": 3, "third": 3, "three": 3,
            "4th": 4, "fourth": 4, "four": 4,
            "5th": 5, "fifth": 5, "five": 5,
            "last": -1, "final": -1
        }

        ord_num = None
        for word, val in ordinal_map.items():
            if re.search(rf"\b{word}\b", q):
                ord_num = val
                break

        if ord_num is None:
            return None

        # Target class
        target_class = "object"
        if any(w in q for w in ["car", "cars"]):
            target_class = "car"
        elif any(w in q for w in ["vehicle", "vehicles", "truck", "bus", "van", "suv"]):
            target_class = "vehicle"
        elif any(w in q for w in ["person", "people", "pedestrian", "man", "woman"]):
            target_class = "person"

        # Check motion qualification
        is_moving_requested = any(w in q for w in ["moving", "moved", "driving", "drives", "cruising", "motion", "transit", "passing", "traveling"])

        # Action: exit / leave vs enter / arrive
        is_exit = any(w in q for w in ["exit", "exits", "exited", "leave", "leaves", "left", "out of", "depart", "disappear"])
        is_entry = any(w in q for w in ["enter", "enters", "entered", "arrive", "arrives", "arrived", "appear", "appears", "come in", "came in"])

        if not is_exit and not is_entry:
            if "when" in q:
                is_exit = "out" in q or "off" in q or "away" in q
                if not is_exit:
                    is_entry = True

        # Filter candidate tracks
        c_tracks = []
        for t in self.tracks:
            cname = t["class_name"].lower()
            if t["duration"] < 0.25:
                continue
            if target_class == "car" and ("car" in cname or "suv" in cname or "van" in cname):
                c_tracks.append(t)
            elif target_class == "vehicle" and any(v in cname for v in ["car", "truck", "bus", "motorcycle", "vehicle", "van", "suv"]):
                c_tracks.append(t)
            elif target_class == "person" and "person" in cname:
                c_tracks.append(t)
            elif target_class == "object":
                c_tracks.append(t)

        if not c_tracks:
            c_tracks = [t for t in self.tracks if t["duration"] >= 0.25]

        if not c_tracks:
            return {
                "answer": f"No tracks matching '{target_class}' were identified in this video.",
                "timeline": [],
                "confidence": 0.0
            }

        max_t = max((t["last_seen"] for t in self.tracks), default=100.0)

        moving_tracks = [t for t in c_tracks if self._is_track_moving(t)]
        stationary_tracks = [t for t in c_tracks if not self._is_track_moving(t) and t.get("first_seen", 0) <= 0.1]

        ord_display = "last" if ord_num == -1 else f"{ord_num}nd" if ord_num == 2 else f"{ord_num}rd" if ord_num == 3 else f"{ord_num}th" if ord_num > 3 else "1st"

        if is_exit:
            pool = sorted([t for t in moving_tracks if max_t - t["last_seen"] > 0.4], key=lambda t: t["last_seen"])
            if not pool:
                pool = sorted(c_tracks, key=lambda t: t["last_seen"])

            selected_track = pool[-1] if ord_num == -1 else pool[min(ord_num - 1, len(pool) - 1)]
            exit_time = selected_track["last_seen"]
            tid = selected_track["track_id"]
            lbl = selected_track["class_name"].capitalize()
            ev_start = max(0.0, exit_time - 2.8)
            ev_end = min(max_t, exit_time + 1.2)

            subj = f"The {ord_display} moving {target_class}" if is_moving_requested else f"The {ord_display} {target_class} to exit the frame"
            ans = f"{subj} ({lbl} #{tid}) exited camera view at timestamp {format_ts(exit_time)} ({exit_time:.1f}s)."
            if len(pool) > 1:
                other_exits = [f"{t['class_name']} #{t['track_id']} at {format_ts(t['last_seen'])}" for t in pool if t['track_id'] != tid]
                ans += f" (Other recorded exits: {', '.join(other_exits)})."

            timeline = [
                {"event": f"{lbl} #{tid} entered camera view", "time": format_ts(selected_track['first_seen']), "timestamp_sec": selected_track['first_seen']},
                {"event": f"{lbl} #{tid} exited camera view", "time": format_ts(exit_time), "timestamp_sec": exit_time}
            ]

            return {
                "answer": ans,
                "direct_subject": f"{lbl} #{tid}",
                "timeline": timeline,
                "evidence_start": round(ev_start, 1),
                "evidence_end": round(ev_end, 1),
                "evidence_label": f"Play {format_ts(ev_start)} – {format_ts(ev_end)}",
                "confidence": 0.98,
                "is_ordinal": True
            }

        # Handle ENTRY query
        if is_moving_requested or len(moving_tracks) >= (ord_num if ord_num > 0 else 1):
            pool = sorted(moving_tracks, key=lambda t: t["first_seen"])
            selected_track = pool[-1] if ord_num == -1 else pool[min(ord_num - 1, len(pool) - 1)]
            entry_time = selected_track["first_seen"]
            tid = selected_track["track_id"]
            lbl = selected_track["class_name"].capitalize()
            ev_start = max(0.0, entry_time - 1.8)
            ev_end = min(max_t, entry_time + 2.5)

            subj = f"The {ord_display} moving {target_class}" if is_moving_requested else f"The {ord_display} {target_class} to enter the camera frame"
            ans = f"{subj} ({lbl} #{tid}) entered the camera frame at timestamp {format_ts(entry_time)} ({entry_time:.1f}s)."
            if len(pool) > 1 and ord_num == 2:
                ans += f" (The 1st moving car, {pool[0]['class_name']} #{pool[0]['track_id']}, entered at {format_ts(pool[0]['first_seen'])})."
            if not is_moving_requested and stationary_tracks:
                ans += f" (Note: Parked vehicle {stationary_tracks[0]['class_name']} #{stationary_tracks[0]['track_id']} was already stationary from 00:00)."

            timeline = [
                {"event": f"{lbl} #{tid} entered camera view", "time": format_ts(entry_time), "timestamp_sec": entry_time}
            ]

            return {
                "answer": ans,
                "direct_subject": f"{lbl} #{tid}",
                "timeline": timeline,
                "evidence_start": round(ev_start, 1),
                "evidence_end": round(ev_end, 1),
                "evidence_label": f"Play {format_ts(ev_start)} – {format_ts(ev_end)}",
                "confidence": 0.98,
                "is_ordinal": True
            }

        # Fallback to general entry list
        tracks_by_entry = sorted(c_tracks, key=lambda t: t["first_seen"])
        selected_track = tracks_by_entry[-1] if ord_num == -1 else tracks_by_entry[min(ord_num - 1, len(tracks_by_entry) - 1)]
        entry_time = selected_track["first_seen"]
        tid = selected_track["track_id"]
        lbl = selected_track["class_name"].capitalize()
        ev_start = max(0.0, entry_time - 1.5)
        ev_end = min(max_t, entry_time + 3.0)

        ans = f"The {ord_display} {target_class} ({lbl} #{tid}) arrived in camera view at timestamp {format_ts(entry_time)} ({entry_time:.1f}s)."
        timeline = [
            {"event": f"{lbl} #{tid} arrived in scene", "time": format_ts(entry_time), "timestamp_sec": entry_time}
        ]

        return {
            "answer": ans,
            "direct_subject": f"{lbl} #{tid}",
            "timeline": timeline,
            "evidence_start": round(ev_start, 1),
            "evidence_end": round(ev_end, 1),
            "evidence_label": f"Play {format_ts(ev_start)} – {format_ts(ev_end)}",
            "confidence": 0.98,
            "is_ordinal": True
        }

    def _find_matching_event(self, text: str) -> Optional[Dict[str, Any]]:
        """Finds the best matching event from real detected events based on query terms."""
        best_ev = None
        best_score = 0
        words = set(re.findall(r'\b\w+\b', text.lower()))

        for ev in self.events:
            desc = ev["description"].lower()
            etype = ev["event_type"].lower()
            score = 0
            for w in words:
                if len(w) > 2 and (w in desc or w in etype):
                    score += 1
            if score > best_score:
                best_score = score
                best_ev = ev

        return best_ev

    def _handle_dynamic_after(self, q: str) -> Dict[str, Any]:
        # Split by 'after'
        parts = q.split("after", 1)
        target_clause = parts[0]
        reference_clause = parts[1] if len(parts) > 1 else ""

        ref_event = self._find_matching_event(reference_clause)
        if not ref_event:
            # Pick first significant event as anchor
            ref_event = self.events[0] if self.events else None

        if not ref_event:
            return {"answer": "No reference event could be matched in the detected timeline.", "timeline": []}

        ref_time = ref_event["timestamp"]
        ref_label = ref_event["description"]

        # Search events happening AFTER ref_time
        candidates = [e for e in self.events if e["timestamp"] > ref_time]

        # Further filter by target clause words if any
        target_words = [w for w in re.findall(r'\b\w+\b', target_clause.lower()) if len(w) > 2 and w not in {"who", "what", "which", "entered", "did"}]
        filtered = []
        if target_words:
            for c in candidates:
                if any(w in c["description"].lower() or w in c["event_type"].lower() for w in target_words):
                    filtered.append(c)

        selected = filtered[0] if filtered else (candidates[0] if candidates else None)

        if selected:
            delta = selected["timestamp"] - ref_time
            subj = selected.get("object_label") or f"Object #{selected.get('object_id', '?')}"
            ans = f"{subj} occurred at {format_ts(selected['timestamp'])}, exactly {int(round(delta))} seconds after {ref_label.lower()}."
            timeline = [
                {"event": ref_label, "time": format_ts(ref_time), "timestamp_sec": ref_time},
                {"event": selected["description"], "time": format_ts(selected["timestamp"]), "timestamp_sec": selected["timestamp"]}
            ]
            ev_start = max(0.0, ref_time - 2.0)
            ev_end = selected["timestamp"] + 8.0

            return {
                "answer": ans,
                "direct_subject": subj,
                "timeline": timeline,
                "time_difference": f"{int(round(delta))} seconds",
                "evidence_start": round(ev_start, 1),
                "evidence_end": round(ev_end, 1),
                "evidence_label": f"Play {format_ts(ev_start)} – {format_ts(ev_end)}",
                "confidence": 0.94,
                "logic": {
                    "operator": "AFTER",
                    "reference": ref_label,
                    "target": selected["description"],
                    "delta_seconds": round(delta, 1)
                }
            }

        return {
            "answer": f"No subsequent events were detected after {ref_label} (at {format_ts(ref_time)}).",
            "timeline": [{"event": ref_label, "time": format_ts(ref_time), "timestamp_sec": ref_time}],
            "evidence_start": ref_time,
            "evidence_end": ref_time + 10.0,
            "confidence": 0.85
        }

    def _handle_dynamic_before(self, q: str) -> Dict[str, Any]:
        parts = q.split("before", 1)
        ref_clause = parts[1] if len(parts) > 1 else q
        ref_event = self._find_matching_event(ref_clause) or (self.events[-1] if self.events else None)

        if not ref_event:
            return {"answer": "No reference event located in detected timeline.", "timeline": []}

        ref_time = ref_event["timestamp"]
        priors = [e for e in self.events if e["timestamp"] < ref_time]

        if priors:
            selected = priors[-1]
            delta = ref_time - selected["timestamp"]
            subj = selected.get("object_label") or f"Object #{selected.get('object_id', '?')}"
            ans = f"{selected['description']} occurred at {format_ts(selected['timestamp'])}, {int(round(delta))} seconds before {ref_event['description'].lower()}."
            timeline = [
                {"event": selected["description"], "time": format_ts(selected["timestamp"]), "timestamp_sec": selected["timestamp"]},
                {"event": ref_event["description"], "time": format_ts(ref_time), "timestamp_sec": ref_time}
            ]
            return {
                "answer": ans,
                "direct_subject": subj,
                "timeline": timeline,
                "time_difference": f"{int(round(delta))} seconds",
                "evidence_start": max(0.0, selected["timestamp"] - 3.0),
                "evidence_end": ref_time + 4.0,
                "evidence_label": f"Play {format_ts(max(0.0, selected['timestamp'] - 3.0))} – {format_ts(ref_time + 4.0)}",
                "confidence": 0.93
            }

        return {
            "answer": f"No events recorded prior to {ref_event['description']} at {format_ts(ref_time)}.",
            "timeline": [{"event": ref_event["description"], "time": format_ts(ref_time), "timestamp_sec": ref_time}],
            "confidence": 0.80
        }

    def _handle_dynamic_between(self, q: str) -> Dict[str, Any]:
        match = re.search(r'between\s+(.*?)\s+and\s+(.*)', q)
        if match:
            clause1, clause2 = match.group(1), match.group(2)
            ev1 = self._find_matching_event(clause1) or (self.events[0] if self.events else None)
            ev2 = self._find_matching_event(clause2) or (self.events[-1] if self.events else None)

            if ev1 and ev2:
                t1, t2 = min(ev1["timestamp"], ev2["timestamp"]), max(ev1["timestamp"], ev2["timestamp"])
                middle = [e for e in self.events if t1 < e["timestamp"] < t2]
                tl = [{"event": ev1["description"], "time": format_ts(t1), "timestamp_sec": t1}]
                tl.extend([{"event": e["description"], "time": format_ts(e["timestamp"]), "timestamp_sec": e["timestamp"]} for e in middle])
                tl.append({"event": ev2["description"], "time": format_ts(t2), "timestamp_sec": t2})

                event_str = "; ".join([f"{e['description']} ({format_ts(e['timestamp'])})" for e in middle]) if middle else "no intermediate events"
                ans = f"Between {format_ts(t1)} and {format_ts(t2)}, the following occurred: {event_str}."
                return {
                    "answer": ans,
                    "timeline": tl,
                    "evidence_start": t1,
                    "evidence_end": t2,
                    "evidence_label": f"Play {format_ts(t1)} – {format_ts(t2)}",
                    "confidence": 0.95
                }

        return self._handle_dynamic_fallback(q)

    def _handle_dynamic_duration(self, q: str) -> Dict[str, Any]:
        # Check zone entries and exits
        zone_entries = [e for e in self.events if "entry" in e["event_type"] or "entered" in e["description"].lower()]
        zone_exits = [e for e in self.events if "exit" in e["event_type"] or "exited" in e["description"].lower() or "left" in e["description"].lower()]

        if zone_entries and zone_exits:
            entry = zone_entries[0]
            # Match exit with same object_id if possible
            matching_exits = [x for x in zone_exits if x.get("object_id") == entry.get("object_id") and x["timestamp"] > entry["timestamp"]]
            exit_ev = matching_exits[0] if matching_exits else zone_exits[0]

            dur = max(0.0, exit_ev["timestamp"] - entry["timestamp"])
            mins = int(dur // 60)
            secs = int(round(dur % 60))
            dur_str = f"{mins}m {secs}s" if mins > 0 else f"{secs} seconds"
            lbl = entry.get("object_label") or f"Object #{entry.get('object_id', '?')}"

            ans = f"{lbl} remained active/inside for {dur_str} (entered at {format_ts(entry['timestamp'])}, exited at {format_ts(exit_ev['timestamp'])})."
            timeline = [
                {"event": entry["description"], "time": format_ts(entry["timestamp"]), "timestamp_sec": entry["timestamp"]},
                {"event": exit_ev["description"], "time": format_ts(exit_ev["timestamp"]), "timestamp_sec": exit_ev["timestamp"]}
            ]
            return {
                "answer": ans,
                "direct_subject": lbl,
                "duration": dur_str,
                "timeline": timeline,
                "time_difference": dur_str,
                "evidence_start": max(0.0, entry["timestamp"] - 2.0),
                "evidence_end": exit_ev["timestamp"] + 4.0,
                "evidence_label": f"Play {format_ts(max(0.0, entry['timestamp'] - 2.0))} – {format_ts(exit_ev['timestamp'] + 4.0)}",
                "confidence": 0.94
            }

        # Check track durations
        if self.tracks:
            longest = max(self.tracks, key=lambda t: t["duration"])
            dur_str = f"{longest['duration']:.1f}s"
            ans = f"Track #{longest['track_id']} ({longest['class_name']}) was tracked for {dur_str} (from {format_ts(longest['first_seen'])} to {format_ts(longest['last_seen'])})."
            return {
                "answer": ans,
                "duration": dur_str,
                "timeline": [
                    {"event": "First detected", "time": format_ts(longest['first_seen']), "timestamp_sec": longest['first_seen']},
                    {"event": "Last detected", "time": format_ts(longest['last_seen']), "timestamp_sec": longest['last_seen']}
                ],
                "evidence_start": longest["first_seen"],
                "evidence_end": longest["last_seen"],
                "confidence": 0.90
            }

        return {"answer": "Duration could not be determined from tracking data.", "timeline": []}

    def _handle_dynamic_count(self, q: str) -> Dict[str, Any]:
        target_class = None
        for cls in ["person", "car", "truck", "bus", "motorcycle", "bicycle", "backpack", "bottle"]:
            if cls in q or (cls == "person" and "people" in q):
                target_class = cls
                break
                
        if target_class:
            c_tracks = [t for t in self.tracks if target_class in t["class_name"].lower()]
            ans = f"A total of {len(c_tracks)} individual {target_class}(s) were tracked in the video."
            tl = [{"event": f"{t['class_name'].capitalize()} #{t['track_id']} detected", "time": format_ts(t['first_seen']), "timestamp_sec": t['first_seen']} for t in c_tracks]
            return {"answer": ans, "count": len(c_tracks), "timeline": tl, "confidence": 0.95}

        # General object count
        ans = f"A total of {len(self.tracks)} tracked objects and {len(self.events)} events were detected."
        tl = [{"event": f"Track #{t['track_id']} ({t['class_name']})", "time": format_ts(t['first_seen']), "timestamp_sec": t['first_seen']} for t in self.tracks[:5]]
        return {"answer": ans, "count": len(self.tracks), "timeline": tl, "confidence": 0.92}

    def _handle_dynamic_when(self, q: str) -> Dict[str, Any]:
        match = self._find_matching_event(q) or (self.events[0] if self.events else None)
        if match:
            t = match["timestamp"]
            ans = f"{match['description']} was recorded at timestamp {format_ts(t)} ({t:.1f}s)."
            return {
                "answer": ans,
                "timeline": [{"event": match["description"], "time": format_ts(t), "timestamp_sec": t}],
                "evidence_start": max(0.0, t - 3.0),
                "evidence_end": t + 6.0,
                "evidence_label": f"Play {format_ts(max(0.0, t - 3.0))} – {format_ts(t + 6.0)}",
                "confidence": 0.94
            }
        return {"answer": "Requested event could not be found in timeline.", "timeline": []}

    def _handle_dynamic_direction(self, q: str) -> Dict[str, Any]:
        moves = [e for e in self.events if "moving_" in e["event_type"]]
        if moves:
            ans = f"{len(moves)} movement events detected. {moves[0]['description']} at {format_ts(moves[0]['timestamp'])}."
            tl = [{"event": e["description"], "time": format_ts(e["timestamp"]), "timestamp_sec": e["timestamp"]} for e in moves]
            return {
                "answer": ans,
                "timeline": tl,
                "evidence_start": max(0.0, moves[0]["timestamp"] - 3.0),
                "evidence_end": moves[0]["timestamp"] + 8.0,
                "confidence": 0.95
            }
        return {"answer": "No clear movement direction events were detected.", "timeline": []}

    def _handle_dynamic_fallback(self, q: str) -> Dict[str, Any]:
        keywords = [w for w in re.findall(r'\b\w+\b', q.lower()) if len(w) > 2 and w not in {"who", "what", "when", "how", "did", "was", "the", "and", "are"}]
        matching = []
        for ev in self.events:
            score = sum(1 for kw in keywords if kw in ev["description"].lower() or kw in ev["event_type"].lower())
            if score > 0:
                matching.append((score, ev))

        matching.sort(key=lambda x: (-x[0], x[1]["timestamp"]))
        if matching:
            best = matching[0][1]
            ans = f"Based on video detections: {best['description']} at timestamp {format_ts(best['timestamp'])}."
            tl = [{"event": e[1]["description"], "time": format_ts(e[1]["timestamp"]), "timestamp_sec": e[1]["timestamp"]} for e in matching[:4]]
            return {
                "answer": ans,
                "timeline": tl,
                "evidence_start": best["evidence_start"],
                "evidence_end": best["evidence_end"],
                "evidence_label": f"Play {format_ts(best['evidence_start'])} – {format_ts(best['evidence_end'])}",
                "confidence": 0.88
            }

        return {
            "answer": "No events matching your query were localized in this video.",
            "timeline": [{"event": e["description"], "time": format_ts(e["timestamp"]), "timestamp_sec": e["timestamp"]} for e in self.events[:3]],
            "confidence": 0.70
        }
