export interface VideoItem {
  id: string;
  filename: string;
  filepath: string;
  duration: number;
  fps: number;
  total_frames: number;
  width: number;
  height: number;
  status: string;
  created_at?: string;
}


export interface ZoneItem {
  id?: string;
  name: string;
  zone_type: string;
  polygon: [number, number][]; // normalized [x, y]
  color: string;
}

export interface DetectionItem {
  id: string;
  frame_idx: number;
  timestamp: number;
  track_id: number;
  class_name: string;
  color_desc: string;
  confidence: number;
  bbox_norm: [number, number, number, number]; // [nx1, ny1, nx2, ny2] 0.0 - 1.0
  bbox_pixel?: [number, number, number, number] | null;
  speed?: number | null;
  action?: string;
  zone_name?: string | null;
}

export interface TrackItem {
  id?: string;
  track_id: number;
  class_name: string;
  first_seen: number;
  last_seen: number;
  duration: number;
  confidence: number;
  max_speed?: number;
  primary_zone?: string | null;
}

export interface EventItem {
  id?: string;
  timestamp: number;
  end_timestamp?: number | null;
  event_type: string;
  object_id?: number | null;
  object_label?: string;
  zone_name?: string | null;
  description: string;
  confidence: number;
  evidence_start: number;
  evidence_end: number;
  metadata?: Record<string, any>;
}

export interface TimelineData {
  video_id: string;
  events: EventItem[];
  tracks: TrackItem[];
  zones?: ZoneItem[];
}

export interface QueryTimelineNode {
  event: string;
  time: string;
  timestamp_sec?: number;
}

export interface QueryResult {
  answer: string;
  timeline: QueryTimelineNode[];
  time_difference?: string;
  evidence_start?: number;
  evidence_end?: number;
  evidence_label?: string;
  confidence?: number;
  reasoning_steps?: string[];
  direct_subject?: string;
  logic?: Record<string, any>;
}

export interface PresetQuestion {
  id: number;
  text: string;
}
