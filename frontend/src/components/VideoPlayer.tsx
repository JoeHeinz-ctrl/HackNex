import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Volume1,
  Maximize,
  Minimize,
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight,
  Repeat,
  HelpCircle,
  X,
  MapPin,
  RefreshCw,
  Check,
  PenTool,
  Trash2,
  Plus,
  Square,
  MousePointer,
  Undo2,
  Copy,
  Sparkles,
  Layers,
  Settings2
} from 'lucide-react';
import type { EventItem, ZoneItem, DetectionItem } from '../types';

export interface ZoneTemplate {
  id: string;
  name: string;
  zone_type: string;
  color: string;
  description: string;
  polygon: [number, number][];
}

export const ZONE_TEMPLATES: ZoneTemplate[] = [
  {
    id: 'roadway_corridor',
    name: 'Roadway Corridor',
    zone_type: 'roadway',
    color: '#3b82f6',
    description: 'Vehicle transit lane (bottom 50%)',
    polygon: [[0.05, 0.48], [0.95, 0.48], [0.95, 0.95], [0.05, 0.95]]
  },
  {
    id: 'walkway_left',
    name: 'Left Pedestrian Walkway',
    zone_type: 'walkway',
    color: '#10b981',
    description: 'Left sidewalk corridor (0-35% width)',
    polygon: [[0.05, 0.15], [0.35, 0.15], [0.35, 0.95], [0.05, 0.95]]
  },
  {
    id: 'walkway_right',
    name: 'Right Pedestrian Walkway',
    zone_type: 'walkway',
    color: '#10b981',
    description: 'Right sidewalk corridor (65-95% width)',
    polygon: [[0.65, 0.15], [0.95, 0.15], [0.95, 0.95], [0.65, 0.95]]
  },
  {
    id: 'restricted_center',
    name: 'Restricted Center Area',
    zone_type: 'restricted',
    color: '#ef4444',
    description: 'Security & unauthorized loitering zone',
    polygon: [[0.25, 0.25], [0.75, 0.25], [0.75, 0.75], [0.25, 0.75]]
  },
  {
    id: 'entry_portal',
    name: 'Gate Entry Point',
    zone_type: 'perimeter',
    color: '#8b5cf6',
    description: 'Entry & exit threshold boundary',
    polygon: [[0.30, 0.65], [0.70, 0.65], [0.70, 0.95], [0.30, 0.95]]
  },
  {
    id: 'full_scene',
    name: 'Whole Scene Coverage',
    zone_type: 'perimeter',
    color: '#06b6d4',
    description: 'Full camera surveillance area',
    polygon: [[0.02, 0.02], [0.98, 0.02], [0.98, 0.98], [0.02, 0.98]]
  }
];

function hexToRgba(hex: string, alpha: number): string {
  const cleanHex = (hex || '#3b82f6').replace('#', '');
  let r = 59, g = 130, b = 246;
  if (cleanHex.length === 6) {
    r = parseInt(cleanHex.substring(0, 2), 16) || 59;
    g = parseInt(cleanHex.substring(2, 4), 16) || 130;
    b = parseInt(cleanHex.substring(4, 6), 16) || 246;
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function pointInPolygon(px: number, py: number, polygon: [number, number][]): boolean {
  if (!polygon || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    const intersect = ((yi > py) !== (yj > py)) &&
      (px < ((xj - xi) * (py - yi)) / ((yj - yi) || 0.00001) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function findNearVertex(
  clickX: number,
  clickY: number,
  polygon: [number, number][],
  ox: number,
  oy: number,
  rw: number,
  rh: number,
  hitRadius = 24
): number | null {
  if (!polygon) return null;
  for (let i = 0; i < polygon.length; i++) {
    const px = ox + polygon[i][0] * rw;
    const py = oy + polygon[i][1] * rh;
    if (Math.hypot(clickX - px, clickY - py) <= hitRadius) {
      return i;
    }
  }
  return null;
}

interface VideoPlayerProps {
  videoId: string;
  duration: number;
  evidenceRange: { start: number; end: number } | null;
  events: EventItem[];
  currentTime: number;
  onTimeUpdate: (t: number) => void;
  seekToTime?: number | null;
  seekRequest?: { time: number; reqId: number } | null;
  selectedTrackId?: number | null;
  onSelectTrack?: (trackId: number | null) => void;
  zones?: ZoneItem[];
  onZonesUpdated?: (newZones: ZoneItem[]) => void;
  detections?: DetectionItem[];
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  videoId,
  duration,
  evidenceRange,
  events,
  currentTime,
  onTimeUpdate,
  seekToTime,
  seekRequest,
  selectedTrackId,
  onSelectTrack,
  zones = [],
  onZonesUpdated,
  detections = []
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameId = useRef<number | null>(null);

  // Playback States
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [volume, setVolume] = useState<number>(1.0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isLoopingEvidence, setIsLoopingEvidence] = useState<boolean>(false);

  // Scrubbing & Hover States
  const [isScrubbing, setIsScrubbing] = useState<boolean>(false);
  const [scrubTime, setScrubTime] = useState<number>(0);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState<number>(0);

  // Layer Visibility
  const [showDetections, setShowDetections] = useState<boolean>(true);
  const [showTrails, setShowTrails] = useState<boolean>(false);
  const [showZones, setShowZones] = useState<boolean>(true);
  const [classFilter, setClassFilter] = useState<'all' | 'person' | 'vehicle' | 'item'>('all');
  const [showHotkeysHelp, setShowHotkeysHelp] = useState<boolean>(false);
  const [showZonesPanel, setShowZonesPanel] = useState<boolean>(false);
  const [isDetectingZones, setIsDetectingZones] = useState<boolean>(false);
  const [zonesSuccess, setZonesSuccess] = useState<boolean>(false);

  // Custom Zone Studio States
  type ZoneToolMode = 'box' | 'polygon' | 'select';
  const [isStudioOpen, setIsStudioOpen] = useState<boolean>(false);
  const [zoneToolMode, setZoneToolMode] = useState<ZoneToolMode>('box');
  const [selectedZoneIdx, setSelectedZoneIdx] = useState<number | null>(null);
  const [hoveredZoneIdx, setHoveredZoneIdx] = useState<number | null>(null);
  const [hoveredVertex, setHoveredVertex] = useState<{ zoneIdx: number; vertexIdx: number } | null>(null);

  // Interactive dragging
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [boxDragStart, setBoxDragStart] = useState<[number, number] | null>(null);
  const [boxDragCurrent, setBoxDragCurrent] = useState<[number, number] | null>(null);
  const [activeDragVertex, setActiveDragVertex] = useState<{ zoneIdx: number; vertexIdx: number } | null>(null);
  const [activeDragZone, setActiveDragZone] = useState<{
    zoneIdx: number;
    startNorm: [number, number];
    originalPolygon: [number, number][];
  } | null>(null);

  // Polygon drawing mode
  const [draftPolygonPoints, setDraftPolygonPoints] = useState<[number, number][]>([]);
  const [mouseNormPos, setMouseNormPos] = useState<[number, number] | null>(null);
  const [isSnappingToStart, setIsSnappingToStart] = useState<boolean>(false);

  // Active Zone Metadata & Configuration
  const [activeZoneName, setActiveZoneName] = useState<string>('Custom Zone');
  const [activeZoneType, setActiveZoneType] = useState<string>('roadway');
  const [activeZoneColor, setActiveZoneColor] = useState<string>('#3b82f6');

  // UI feedback & Menus
  const [showTemplatesMenu, setShowTemplatesMenu] = useState<boolean>(false);
  const [zoneToast, setZoneToast] = useState<string | null>(null);
  const [, setIsSavingZones] = useState<boolean>(false);

  // Track Inspection
  const [inspectedTrack, setInspectedTrack] = useState<DetectionItem | null>(null);

  const effectiveDuration = duration > 0 ? duration : 100;

  // Track handlers and IDs to prevent infinite seek re-triggering
  const lastHandledReqId = useRef<number | null>(null);
  const lastHandledSeekToTime = useRef<number | null>(null);
  const onTimeUpdateRef = useRef(onTimeUpdate);

  useEffect(() => {
    onTimeUpdateRef.current = onTimeUpdate;
  }, [onTimeUpdate]);

  // Instant trigger for seek & play request (from evidence button or timeline click)
  useEffect(() => {
    if (!seekRequest || !videoRef.current) return;
    if (seekRequest.reqId === lastHandledReqId.current) return;
    lastHandledReqId.current = seekRequest.reqId;

    const vid = videoRef.current;
    const target = Math.max(0, Math.min(effectiveDuration, seekRequest.time));

    vid.currentTime = target;
    onTimeUpdateRef.current(target);

    // Immediate playback trigger
    const playPromise = vid.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          setIsPlaying(true);
        })
        .catch(() => {
          vid.muted = true;
          setIsMuted(true);
          vid.play().then(() => setIsPlaying(true)).catch(() => {});
        });
    }
  }, [seekRequest?.reqId, effectiveDuration]);

  // Synchronize legacy seekToTime if provided independently
  useEffect(() => {
    if (seekToTime !== null && seekToTime !== undefined && videoRef.current && !seekRequest) {
      if (seekToTime === lastHandledSeekToTime.current) return;
      lastHandledSeekToTime.current = seekToTime;
      videoRef.current.currentTime = seekToTime;
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  }, [seekToTime, seekRequest]);

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play().catch(() => {});
    }
  }, [isPlaying]);

  const skipSeconds = useCallback((delta: number) => {
    if (!videoRef.current) return;
    const target = Math.max(0, Math.min(effectiveDuration, videoRef.current.currentTime + delta));
    videoRef.current.currentTime = target;
    onTimeUpdate(target);
  }, [effectiveDuration, onTimeUpdate]);

  const stepFrame = useCallback((deltaFrames: number) => {
    if (!videoRef.current) return;
    videoRef.current.pause();
    setIsPlaying(false);
    const frameTime = 1.0 / 30.0;
    const target = Math.max(0, Math.min(effectiveDuration, videoRef.current.currentTime + deltaFrames * frameTime));
    videoRef.current.currentTime = target;
    onTimeUpdate(target);
  }, [effectiveDuration, onTimeUpdate]);

  const toggleMute = useCallback(() => {
    if (!videoRef.current) return;
    if (isMuted) {
      videoRef.current.muted = false;
      videoRef.current.volume = volume || 1;
      setIsMuted(false);
    } else {
      videoRef.current.muted = true;
      setIsMuted(true);
    }
  }, [isMuted, volume]);

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);



  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const vTime = videoRef.current.currentTime;

    if (isLoopingEvidence && evidenceRange) {
      if (vTime >= evidenceRange.end || vTime < evidenceRange.start) {
        videoRef.current.currentTime = evidenceRange.start;
        return;
      }
    }

    if (!isScrubbing) {
      onTimeUpdate(vTime);
    }
  };

  const handleScrubStart = (e: React.MouseEvent<HTMLInputElement> | React.TouchEvent<HTMLInputElement>) => {
    setIsScrubbing(true);
    const targetVal = parseFloat((e.target as HTMLInputElement).value);
    setScrubTime(targetVal);
  };

  const handleScrubChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const targetVal = parseFloat(e.target.value);
    setScrubTime(targetVal);
    if (!isPlaying && videoRef.current) {
      videoRef.current.currentTime = targetVal;
    }
  };

  const handleScrubEnd = () => {
    setIsScrubbing(false);
    if (videoRef.current) {
      videoRef.current.currentTime = scrubTime;
      onTimeUpdate(scrubTime);
    }
  };

  const handleSliderMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverTime(pos * effectiveDuration);
    setHoverX(e.clientX - rect.left);
  };

  const handleSliderMouseLeave = () => {
    setHoverTime(null);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
      setIsMuted(val === 0);
    }
  };

  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
  };

  const formatSeconds = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 10);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms}`;
  };

  const displayTime = isScrubbing ? scrubTime : currentTime;

  // Clean frame detection lookup with Non-Maximum Suppression (NMS) and vehicle-interior filtering
  const getDetectionsAtTime = useCallback((timeSec: number): DetectionItem[] => {
    if (!detections || detections.length === 0) return [];

    // Find the sampled detection timestamp closest to timeSec within 0.18s
    let closestTime: number | null = null;
    let minDelta = 0.18;

    for (const d of detections) {
      const delta = Math.abs(d.timestamp - timeSec);
      if (delta < minDelta) {
        minDelta = delta;
        closestTime = d.timestamp;
      }
    }

    if (closestTime === null) return [];

    // Gather all detections from that exact closest frame
    const frameDets = detections.filter(
      (d) => Math.abs(d.timestamp - (closestTime as number)) < 0.04
    );

    // Apply class filter if active
    let filtered = frameDets;
    if (classFilter === 'person') {
      filtered = frameDets.filter((d) => d.class_name.toLowerCase() === 'person');
    } else if (classFilter === 'vehicle') {
      filtered = frameDets.filter((d) =>
        ['car', 'truck', 'bus', 'motorcycle', 'bicycle'].includes(d.class_name.toLowerCase())
      );
    } else if (classFilter === 'item') {
      filtered = frameDets.filter((d) =>
        ['backpack', 'handbag', 'suitcase', 'bottle'].includes(d.class_name.toLowerCase())
      );
    }

    // Spatial Deduplication (NMS): remove duplicate/overlapping ghost boxes
    const cleanDets: DetectionItem[] = [];
    const sorted = [...filtered].sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

    for (const det of sorted) {
      const [nx1, ny1, nx2, ny2] = det.bbox_norm || [0, 0, 0, 0];
      const cx = (nx1 + nx2) / 2;
      const cy = (ny1 + ny2) / 2;

      let isDuplicate = false;
      for (const existing of cleanDets) {
        const [ex1, ey1, ex2, ey2] = existing.bbox_norm || [0, 0, 0, 0];
        const ecx = (ex1 + ex2) / 2;
        const ecy = (ey1 + ey2) / 2;

        const xA = Math.max(nx1, ex1);
        const yA = Math.max(ny1, ey1);
        const xB = Math.min(nx2, ex2);
        const yB = Math.min(ny2, ey2);
        const interArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);
        const a1 = (nx2 - nx1) * (ny2 - ny1);
        const a2 = (ex2 - ex1) * (ey2 - ey1);
        const unionArea = a1 + a2 - interArea;
        const iou = unionArea > 0 ? interArea / unionArea : 0;

        // Suppress overlapping boxes
        if (iou > 0.40 || Math.hypot(cx - ecx, cy - ecy) < 0.04) {
          isDuplicate = true;
          break;
        }

        // Suppress false-positive person detections inside car windshields
        if (
          det.class_name === 'person' &&
          ['car', 'truck', 'bus'].includes(existing.class_name) &&
          cx > ex1 && cx < ex2 && cy > ey1 && cy < ey2
        ) {
          isDuplicate = true;
          break;
        }
      }

      if (!isDuplicate) {
        cleanDets.push(det);
      }
    }

    return cleanDets;
  }, [detections, classFilter]);

  // Current detections for inspected object and HUD counts
  const currentDetections = useMemo(() => {
    return getDetectionsAtTime(displayTime);
  }, [getDetectionsAtTime, displayTime]);

  // Synchronize canvas resolution to pixel device ratio
  const syncCanvasResolution = useCallback(() => {
    if (!canvasRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvasRef.current.width = rect.width * dpr;
    canvasRef.current.height = rect.height * dpr;
    const ctx = canvasRef.current.getContext('2d');
    if (ctx) {
      ctx.resetTransform();
      ctx.scale(dpr, dpr);
    }
  }, []);

  useEffect(() => {
    syncCanvasResolution();
    window.addEventListener('resize', syncCanvasResolution);
    return () => window.removeEventListener('resize', syncCanvasResolution);
  }, [syncCanvasResolution]);

  // Render function for 60 FPS drawing
  const renderFrameToCanvas = useCallback((timeSec: number) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cw = canvas.width / (window.devicePixelRatio || 1);
    const ch = canvas.height / (window.devicePixelRatio || 1);
    ctx.clearRect(0, 0, cw, ch);

    const vWidth = video.videoWidth || 16;
    const vHeight = video.videoHeight || 9;
    const containerRatio = cw / ch;
    const videoRatio = vWidth / vHeight;

    let rw = cw;
    let rh = ch;
    let ox = 0;
    let oy = 0;

    if (containerRatio > videoRatio) {
      rw = ch * videoRatio;
      ox = (cw - rw) / 2;
    } else {
      rh = cw / videoRatio;
      oy = (ch - rh) / 2;
    }

    const toX = (nx: number) => ox + nx * rw;
    const toY = (ny: number) => oy + ny * rh;

    // 1. Draw Surveillance Zones
    if (showZones && zones.length > 0) {
      zones.forEach((z, idx) => {
        if (!z.polygon || z.polygon.length < 3) return;
        const isSelected = isStudioOpen && selectedZoneIdx === idx;
        const isHovered = isStudioOpen && hoveredZoneIdx === idx && !isSelected;
        const baseColor = z.color || '#3b82f6';

        ctx.beginPath();
        ctx.moveTo(toX(z.polygon[0][0]), toY(z.polygon[0][1]));
        for (let i = 1; i < z.polygon.length; i++) {
          ctx.lineTo(toX(z.polygon[i][0]), toY(z.polygon[i][1]));
        }
        ctx.closePath();

        // Polygon Fill
        ctx.fillStyle = hexToRgba(baseColor, isSelected ? 0.32 : isHovered ? 0.22 : 0.12);
        ctx.fill();

        // Polygon Border
        ctx.lineWidth = isSelected ? 2.5 : isHovered ? 2.0 : 1.5;
        ctx.strokeStyle = isSelected ? '#ffffff' : baseColor;
        if (!isSelected && !isHovered) {
          ctx.setLineDash([4, 4]);
        } else {
          ctx.setLineDash([]);
        }
        ctx.stroke();
        ctx.setLineDash([]);

        // Draggable Vertex Handles for Selected Zone in Studio
        if (isSelected) {
          z.polygon.forEach((pt, vIdx) => {
            const vx = toX(pt[0]);
            const vy = toY(pt[1]);
            const isHandleHovered = (hoveredVertex?.zoneIdx === idx && hoveredVertex?.vertexIdx === vIdx) ||
                                    (activeDragVertex?.zoneIdx === idx && activeDragVertex?.vertexIdx === vIdx);

            ctx.beginPath();
            ctx.arc(vx, vy, isHandleHovered ? 7 : 5, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            ctx.lineWidth = isHandleHovered ? 3 : 2;
            ctx.strokeStyle = isHandleHovered ? '#f59e0b' : baseColor;
            ctx.stroke();

            // Pulsing outer halo if hovered
            if (isHandleHovered) {
              ctx.beginPath();
              ctx.arc(vx, vy, 11, 0, Math.PI * 2);
              ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
              ctx.lineWidth = 2;
              ctx.stroke();
            }
          });
        }

        // Zone Tag Label
        const firstPt = z.polygon[0];
        const tagX = toX(firstPt[0]);
        const tagY = toY(firstPt[1]) - 4;
        ctx.font = '600 11px Inter, sans-serif';
        const labelText = `${z.name} [${z.zone_type}]`;
        const textWidth = ctx.measureText(labelText).width;

        ctx.fillStyle = isSelected ? 'rgba(15, 23, 42, 0.95)' : 'rgba(15, 23, 42, 0.80)';
        ctx.fillRect(tagX - 4, tagY - 14, textWidth + 14, 17);

        // Color indicator circle
        ctx.fillStyle = baseColor;
        ctx.beginPath();
        ctx.arc(tagX + 2, tagY - 5.5, 3.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = isSelected ? '#ffffff' : '#f8fafc';
        ctx.fillText(labelText, tagX + 10, tagY - 2);
      });
    }

    // 1b. Draw Active Box Drag Preview
    if (isStudioOpen && zoneToolMode === 'box' && isDragging && boxDragStart && boxDragCurrent) {
      const minX = Math.min(boxDragStart[0], boxDragCurrent[0]);
      const maxX = Math.max(boxDragStart[0], boxDragCurrent[0]);
      const minY = Math.min(boxDragStart[1], boxDragCurrent[1]);
      const maxY = Math.max(boxDragStart[1], boxDragCurrent[1]);

      const bx1 = toX(minX);
      const by1 = toY(minY);
      const bw = (maxX - minX) * rw;
      const bh = (maxY - minY) * rh;

      ctx.fillStyle = hexToRgba(activeZoneColor, 0.28);
      ctx.fillRect(bx1, by1, bw, bh);

      ctx.lineWidth = 2;
      ctx.strokeStyle = activeZoneColor;
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(bx1, by1, bw, bh);
      ctx.setLineDash([]);

      // Corner handles
      [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]].forEach(([cx, cy]) => {
        ctx.beginPath();
        ctx.arc(toX(cx), toY(cy), 5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = activeZoneColor;
        ctx.stroke();
      });

      // Dimensions Pill
      const dimText = `${Math.round((maxX - minX) * 100)}% × ${Math.round((maxY - minY) * 100)}%`;
      ctx.font = '600 10px Inter, monospace';
      const dimW = ctx.measureText(dimText).width;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.fillRect(bx1 + bw / 2 - dimW / 2 - 5, by1 + bh / 2 - 9, dimW + 10, 18);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(dimText, bx1 + bw / 2 - dimW / 2, by1 + bh / 2 + 4);
    }

    // 1c. Draw Active Polygon in Progress
    if (isStudioOpen && zoneToolMode === 'polygon' && draftPolygonPoints.length > 0) {
      ctx.beginPath();
      ctx.moveTo(toX(draftPolygonPoints[0][0]), toY(draftPolygonPoints[0][1]));
      for (let i = 1; i < draftPolygonPoints.length; i++) {
        ctx.lineTo(toX(draftPolygonPoints[i][0]), toY(draftPolygonPoints[i][1]));
      }

      // Live rubberband line to current mouse position!
      if (mouseNormPos) {
        ctx.lineTo(toX(mouseNormPos[0]), toY(mouseNormPos[1]));
        // Preview fill if >= 2 points
        if (draftPolygonPoints.length >= 2) {
          ctx.lineTo(toX(draftPolygonPoints[0][0]), toY(draftPolygonPoints[0][1]));
          ctx.fillStyle = hexToRgba(activeZoneColor, 0.20);
          ctx.fill();
        }
      }

      ctx.lineWidth = 2;
      ctx.strokeStyle = activeZoneColor;
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Numbered Point handles
      draftPolygonPoints.forEach((pt, pIdx) => {
        const px = toX(pt[0]);
        const py = toY(pt[1]);
        const isStart = pIdx === 0;

        ctx.beginPath();
        ctx.arc(px, py, isStart && isSnappingToStart ? 8 : 5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = isStart && isSnappingToStart ? '#10b981' : activeZoneColor;
        ctx.stroke();

        if (isStart && isSnappingToStart) {
          // Snap pulse ring
          ctx.beginPath();
          ctx.arc(px, py, 13, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(16, 185, 129, 0.6)';
          ctx.lineWidth = 2;
          ctx.stroke();

          ctx.font = '600 10px Inter, sans-serif';
          ctx.fillStyle = '#10b981';
          ctx.fillText('Click to close', px + 12, py - 6);
        } else {
          ctx.font = '700 9px Inter, sans-serif';
          ctx.fillStyle = activeZoneColor;
          ctx.fillText(`${pIdx + 1}`, px + 7, py - 4);
        }
      });
    }

    // 1d. Hairline CAD Crosshair Guide
    if (isStudioOpen && mouseNormPos && (zoneToolMode === 'box' || zoneToolMode === 'polygon')) {
      const mx = toX(mouseNormPos[0]);
      const my = toY(mouseNormPos[1]);

      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.setLineDash([3, 3]);

      // Vertical guide
      ctx.beginPath();
      ctx.moveTo(mx, oy);
      ctx.lineTo(mx, oy + rh);
      ctx.stroke();

      // Horizontal guide
      ctx.beginPath();
      ctx.moveTo(ox, my);
      ctx.lineTo(ox + rw, my);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 2. Draw Object Detections
    if (showDetections) {
      const activeDets = getDetectionsAtTime(timeSec);

      activeDets.forEach((det) => {
        const [nx1, ny1, nx2, ny2] = det.bbox_norm || [0, 0, 0, 0];
        const bx = toX(nx1);
        const by = toY(ny1);
        const bw = (nx2 - nx1) * rw;
        const bh = (ny2 - ny1) * rh;

        const isSelected = selectedTrackId === det.track_id;

        // Distinct, clean colors by class
        let strokeColor = '#38bdf8'; // Sky blue for vehicles
        if (det.class_name === 'person') strokeColor = '#10b981'; // Emerald for persons
        else if (['bicycle', 'motorcycle'].includes(det.class_name)) strokeColor = '#a855f7';
        else if (['backpack', 'handbag', 'suitcase'].includes(det.class_name)) strokeColor = '#f59e0b';

        if (isSelected) strokeColor = '#eab308'; // Amber highlight when clicked

        // Bounding Box
        ctx.lineWidth = isSelected ? 2.5 : 1.5;
        ctx.strokeStyle = strokeColor;
        ctx.strokeRect(bx, by, bw, bh);

        // Subtle box fill
        ctx.fillStyle = `${strokeColor}10`;
        ctx.fillRect(bx, by, bw, bh);

        // Clean label badge with ID, Class, and Color
        const rawColor = (det.color_desc || '').trim();
        const labelText = `#${det.track_id} ${det.class_name}${rawColor ? ` • ${rawColor}` : ''}`;

        ctx.font = '600 10px Inter, sans-serif';
        const labelW = ctx.measureText(labelText).width;
        const badgeY = Math.max(14, by - 4);

        ctx.fillStyle = strokeColor;
        ctx.fillRect(bx, badgeY - 13, labelW + 6, 15);

        ctx.fillStyle = '#0f172a';
        ctx.fillText(labelText, bx + 3, badgeY - 2);

        // Trajectory trail
        const trail = (det as any).trail;
        if (showTrails && Array.isArray(trail) && trail.length > 1) {
          ctx.beginPath();
          ctx.moveTo(toX(trail[0][0]), toY(trail[0][1]));
          for (let i = 1; i < trail.length; i++) {
            ctx.lineTo(toX(trail[i][0]), toY(trail[i][1]));
          }
          ctx.strokeStyle = `${strokeColor}90`;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      });
    }
  }, [
    showZones,
    showDetections,
    zones,
    showTrails,
    selectedTrackId,
    getDetectionsAtTime,
    isStudioOpen,
    zoneToolMode,
    selectedZoneIdx,
    hoveredZoneIdx,
    hoveredVertex,
    isDragging,
    boxDragStart,
    boxDragCurrent,
    activeDragVertex,
    draftPolygonPoints,
    mouseNormPos,
    isSnappingToStart,
    activeZoneColor
  ]);

  // RequestAnimationFrame loop for seamless 60 FPS playback
  useEffect(() => {
    let active = true;

    const loop = () => {
      if (!active) return;
      if (videoRef.current && isPlaying) {
        renderFrameToCanvas(videoRef.current.currentTime);
      }
      animFrameId.current = requestAnimationFrame(loop);
    };

    if (isPlaying) {
      animFrameId.current = requestAnimationFrame(loop);
    } else {
      renderFrameToCanvas(displayTime);
    }

    return () => {
      active = false;
      if (animFrameId.current) {
        cancelAnimationFrame(animFrameId.current);
      }
    };
  }, [isPlaying, displayTime, renderFrameToCanvas]);

  // Normalized coordinate resolver
  const getCoords = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!videoRef.current) return null;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const cw = rect.width;
    const ch = rect.height;
    const vWidth = videoRef.current.videoWidth || 16;
    const vHeight = videoRef.current.videoHeight || 9;
    const containerRatio = cw / ch;
    const videoRatio = vWidth / vHeight;

    let rw = cw;
    let rh = ch;
    let ox = 0;
    let oy = 0;

    if (containerRatio > videoRatio) {
      rw = ch * videoRatio;
      ox = (cw - rw) / 2;
    } else {
      rh = cw / videoRatio;
      oy = (ch - rh) / 2;
    }

    const nx = Math.max(0, Math.min(1, (clickX - ox) / rw));
    const ny = Math.max(0, Math.min(1, (clickY - oy) / rh));

    return {
      nx: parseFloat(nx.toFixed(4)),
      ny: parseFloat(ny.toFixed(4)),
      canvasX: clickX,
      canvasY: clickY,
      rw,
      rh,
      ox,
      oy
    };
  }, []);

  // Backend Sync
  const saveZonesToBackend = useCallback(async (newZones: ZoneItem[]) => {
    setIsSavingZones(true);
    try {
      const res = await fetch(`/api/videos/${videoId}/zones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newZones)
      });
      if (res.ok) {
        if (onZonesUpdated) onZonesUpdated(newZones);
        setZoneToast('✓ Zones synced & timeline updated');
        setTimeout(() => setZoneToast(null), 3000);
      }
    } catch (err) {
      console.error('Failed to save zones:', err);
      setZoneToast('⚠ Failed to sync zones');
      setTimeout(() => setZoneToast(null), 3000);
    } finally {
      setIsSavingZones(false);
    }
  }, [videoId, onZonesUpdated]);

  // Zone Studio Control
  const openZoneStudio = () => {
    if (videoRef.current && isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    }
    setIsStudioOpen(true);
    setShowZones(true);
    setShowZonesPanel(false);
    setZoneToolMode('box');
    setSelectedZoneIdx(null);
    setDraftPolygonPoints([]);
    setActiveZoneName(`Zone ${zones.length + 1}`);
  };

  const closeZoneStudio = () => {
    setIsStudioOpen(false);
    setSelectedZoneIdx(null);
    setDraftPolygonPoints([]);
    setBoxDragStart(null);
    setBoxDragCurrent(null);
    setIsDragging(false);
    setShowTemplatesMenu(false);
  };

  const toggleZoneStudio = () => {
    if (isStudioOpen) closeZoneStudio();
    else openZoneStudio();
  };

  const handleUndoPolygonPoint = () => {
    setDraftPolygonPoints((prev) => prev.slice(0, -1));
  };

  const handleFinishPolygon = () => {
    if (draftPolygonPoints.length < 3) return;
    const newName = activeZoneName.trim() || `Zone ${zones.length + 1}`;
    const newZone: ZoneItem = {
      name: newName,
      zone_type: activeZoneType,
      color: activeZoneColor,
      polygon: draftPolygonPoints
    };
    const updated = [...zones, newZone];
    saveZonesToBackend(updated);
    setDraftPolygonPoints([]);
    setIsSnappingToStart(false);
    setSelectedZoneIdx(updated.length - 1);
    setZoneToolMode('select');
    setZoneToast(`✓ Created polygon ${newName}!`);
  };

  const handleDeleteSelectedZone = () => {
    if (selectedZoneIdx === null) return;
    const updated = zones.filter((_, idx) => idx !== selectedZoneIdx);
    saveZonesToBackend(updated);
    setSelectedZoneIdx(null);
    setZoneToast('✓ Zone deleted');
  };

  const handleDuplicateSelectedZone = () => {
    if (selectedZoneIdx === null || !zones[selectedZoneIdx]) return;
    const orig = zones[selectedZoneIdx];
    const duplicated: ZoneItem = {
      name: `${orig.name} (Copy)`,
      zone_type: orig.zone_type,
      color: orig.color,
      polygon: orig.polygon.map(([x, y]) => [
        Math.min(0.98, x + 0.04),
        Math.min(0.98, y + 0.04)
      ]) as [number, number][]
    };
    const updated = [...zones, duplicated];
    saveZonesToBackend(updated);
    setSelectedZoneIdx(updated.length - 1);
    setZoneToast(`✓ Duplicated ${orig.name}`);
  };

  const handleApplyTemplate = (tmpl: ZoneTemplate) => {
    const newZone: ZoneItem = {
      name: tmpl.name,
      zone_type: tmpl.zone_type,
      color: tmpl.color,
      polygon: tmpl.polygon.map((pt) => [...pt] as [number, number])
    };
    const updated = [...zones, newZone];
    saveZonesToBackend(updated);
    setSelectedZoneIdx(updated.length - 1);
    setActiveZoneName(tmpl.name);
    setActiveZoneType(tmpl.zone_type);
    setActiveZoneColor(tmpl.color);
    setZoneToolMode('select');
    setShowTemplatesMenu(false);
    setZoneToast(`✓ Added '${tmpl.name}'! Drag handles to fit view`);
  };

  // Canvas Mouse Down
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isStudioOpen) return;
    const c = getCoords(e);
    if (!c) return;

    if (zoneToolMode === 'box') {
      setBoxDragStart([c.nx, c.ny]);
      setBoxDragCurrent([c.nx, c.ny]);
      setIsDragging(true);
      return;
    }

    if (zoneToolMode === 'select') {
      // 1. Check if clicking on vertex handle of selected zone
      if (selectedZoneIdx !== null && zones[selectedZoneIdx]) {
        const vIdx = findNearVertex(c.canvasX, c.canvasY, zones[selectedZoneIdx].polygon, c.ox, c.oy, c.rw, c.rh, 14);
        if (vIdx !== null) {
          setActiveDragVertex({ zoneIdx: selectedZoneIdx, vertexIdx: vIdx });
          setIsDragging(true);
          return;
        }
      }

      // 2. Check if clicking inside any zone
      let hitIdx: number | null = null;
      for (let i = zones.length - 1; i >= 0; i--) {
        if (pointInPolygon(c.nx, c.ny, zones[i].polygon)) {
          hitIdx = i;
          break;
        }
      }

      if (hitIdx !== null) {
        setSelectedZoneIdx(hitIdx);
        setActiveZoneName(zones[hitIdx].name);
        setActiveZoneType(zones[hitIdx].zone_type);
        setActiveZoneColor(zones[hitIdx].color || '#3b82f6');
        setActiveDragZone({
          zoneIdx: hitIdx,
          startNorm: [c.nx, c.ny],
          originalPolygon: zones[hitIdx].polygon.map((pt) => [...pt] as [number, number])
        });
        setIsDragging(true);
      } else {
        setSelectedZoneIdx(null);
      }
    }
  };

  // Canvas Mouse Move
  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const c = getCoords(e);
    if (!c) return;
    setMouseNormPos([c.nx, c.ny]);

    if (!isStudioOpen) return;

    if (zoneToolMode === 'box' && isDragging && boxDragStart) {
      setBoxDragCurrent([c.nx, c.ny]);
      return;
    }

    if (zoneToolMode === 'polygon') {
      if (draftPolygonPoints.length >= 3) {
        const p0 = draftPolygonPoints[0];
        const sx = c.ox + p0[0] * c.rw;
        const sy = c.oy + p0[1] * c.rh;
        const dist = Math.hypot(c.canvasX - sx, c.canvasY - sy);
        setIsSnappingToStart(dist <= 30);
      } else {
        setIsSnappingToStart(false);
      }
      return;
    }

    if (zoneToolMode === 'select') {
      if (isDragging && activeDragVertex && zones[activeDragVertex.zoneIdx]) {
        const updated = [...zones];
        const poly = [...updated[activeDragVertex.zoneIdx].polygon];
        poly[activeDragVertex.vertexIdx] = [c.nx, c.ny];
        updated[activeDragVertex.zoneIdx] = { ...updated[activeDragVertex.zoneIdx], polygon: poly };
        if (onZonesUpdated) onZonesUpdated(updated);
        return;
      }

      if (isDragging && activeDragZone && zones[activeDragZone.zoneIdx]) {
        const dx = c.nx - activeDragZone.startNorm[0];
        const dy = c.ny - activeDragZone.startNorm[1];
        const updated = [...zones];
        const movedPoly = activeDragZone.originalPolygon.map(([px, py]) => [
          parseFloat(Math.max(0, Math.min(1, px + dx)).toFixed(4)),
          parseFloat(Math.max(0, Math.min(1, py + dy)).toFixed(4))
        ]) as [number, number][];
        updated[activeDragZone.zoneIdx] = { ...updated[activeDragZone.zoneIdx], polygon: movedPoly };
        if (onZonesUpdated) onZonesUpdated(updated);
        return;
      }

      // Check hover on vertex
      if (selectedZoneIdx !== null && zones[selectedZoneIdx]) {
        const vIdx = findNearVertex(c.canvasX, c.canvasY, zones[selectedZoneIdx].polygon, c.ox, c.oy, c.rw, c.rh, 14);
        if (vIdx !== null) {
          setHoveredVertex({ zoneIdx: selectedZoneIdx, vertexIdx: vIdx });
          setHoveredZoneIdx(null);
          return;
        }
      }
      setHoveredVertex(null);

      // Check hover on zone body
      let hIdx: number | null = null;
      for (let i = zones.length - 1; i >= 0; i--) {
        if (pointInPolygon(c.nx, c.ny, zones[i].polygon)) {
          hIdx = i;
          break;
        }
      }
      setHoveredZoneIdx(hIdx);
    }
  };

  // Canvas Mouse Up
  const handleCanvasMouseUp = () => {
    if (!isStudioOpen || !isDragging) return;

    if (zoneToolMode === 'box' && boxDragStart && boxDragCurrent) {
      const minX = Math.min(boxDragStart[0], boxDragCurrent[0]);
      const maxX = Math.max(boxDragStart[0], boxDragCurrent[0]);
      const minY = Math.min(boxDragStart[1], boxDragCurrent[1]);
      const maxY = Math.max(boxDragStart[1], boxDragCurrent[1]);

      if (maxX - minX > 0.01 && maxY - minY > 0.01) {
        const newName = `Zone ${zones.length + 1}`;
        const newZone: ZoneItem = {
          name: newName,
          zone_type: activeZoneType,
          color: activeZoneColor,
          polygon: [
            [minX, minY],
            [maxX, minY],
            [maxX, maxY],
            [minX, maxY]
          ]
        };
        const updated = [...zones, newZone];
        saveZonesToBackend(updated);
        setSelectedZoneIdx(updated.length - 1);
        setActiveZoneName(newName);
        setZoneToolMode('select');
        setZoneToast(`✓ Created ${newName}! Adjust handles or rename`);
      }
      setBoxDragStart(null);
      setBoxDragCurrent(null);
      setIsDragging(false);
      return;
    }

    if (activeDragVertex) {
      saveZonesToBackend(zones);
      setActiveDragVertex(null);
      setIsDragging(false);
      return;
    }

    if (activeDragZone) {
      saveZonesToBackend(zones);
      setActiveDragZone(null);
      setIsDragging(false);
      return;
    }

    setIsDragging(false);
  };

  // Canvas Click
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const c = getCoords(e);
    if (!c) return;

    if (isStudioOpen) {
      if (zoneToolMode === 'polygon') {
        if (isSnappingToStart && draftPolygonPoints.length >= 3) {
          handleFinishPolygon();
        } else {
          setDraftPolygonPoints((prev) => [...prev, [c.nx, c.ny]]);
        }
      }
      return;
    }

    // Normal Object Selection Mode
    if (currentDetections.length === 0) {
      setInspectedTrack(null);
      if (onSelectTrack) onSelectTrack(null);
      return;
    }

    const clicked = currentDetections.find((d) => {
      const [nx1, ny1, nx2, ny2] = d.bbox_norm || [0, 0, 0, 0];
      const bx = c.ox + nx1 * c.rw;
      const by = c.oy + ny1 * c.rh;
      const bw = (nx2 - nx1) * c.rw;
      const bh = (ny2 - ny1) * c.rh;
      return c.canvasX >= bx && c.canvasX <= bx + bw && c.canvasY >= by && c.canvasY <= by + bh;
    });

    if (clicked) {
      setInspectedTrack(clicked);
      if (onSelectTrack) onSelectTrack(clicked.track_id);
    } else {
      setInspectedTrack(null);
      if (onSelectTrack) onSelectTrack(null);
    }
  };

  // Canvas Double Click
  const handleCanvasDoubleClick = () => {
    if (isStudioOpen && zoneToolMode === 'polygon' && draftPolygonPoints.length >= 3) {
      handleFinishPolygon();
    }
  };

  // Canvas Mouse Leave
  const handleCanvasMouseLeave = () => {
    setMouseNormPos(null);
    setIsSnappingToStart(false);
    setHoveredVertex(null);
    setHoveredZoneIdx(null);
    if (isDragging) {
      handleCanvasMouseUp();
    }
  };

  // Delete an existing zone by index
  const handleDeleteZone = async (indexToDelete: number) => {
    const updatedZones = zones.filter((_, idx) => idx !== indexToDelete);
    await saveZonesToBackend(updatedZones);
    if (selectedZoneIdx === indexToDelete) {
      setSelectedZoneIdx(null);
    } else if (selectedZoneIdx !== null && selectedZoneIdx > indexToDelete) {
      setSelectedZoneIdx(selectedZoneIdx - 1);
    }
  };

  // Auto-detect zones action
  const handleAutoDetectZones = async () => {
    setIsDetectingZones(true);
    setZonesSuccess(false);
    try {
      const res = await fetch(`/api/videos/${videoId}/zones/autodetect`, {
        method: 'POST'
      });
      if (res.ok) {
        const data = await res.json();
        if (data.zones && onZonesUpdated) {
          onZonesUpdated(data.zones);
        }
        setZonesSuccess(true);
        setTimeout(() => setZonesSuccess(false), 2500);
      }
    } catch (err) {
      console.error('Failed to autodetect zones:', err);
    } finally {
      setIsDetectingZones(false);
    }
  };

  // Unified Keyboard Controls (Player & Zone Studio)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') return;

      // Studio-specific shortcuts
      if (isStudioOpen) {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
          e.preventDefault();
          handleUndoPolygonPoint();
          return;
        }
        if (e.key === 'Backspace') {
          if (zoneToolMode === 'polygon' && draftPolygonPoints.length > 0) {
            e.preventDefault();
            handleUndoPolygonPoint();
            return;
          }
          if (zoneToolMode === 'select' && selectedZoneIdx !== null) {
            e.preventDefault();
            handleDeleteSelectedZone();
            return;
          }
        }
        if (e.key === 'Delete' && selectedZoneIdx !== null) {
          e.preventDefault();
          handleDeleteSelectedZone();
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          if (zoneToolMode === 'polygon' && draftPolygonPoints.length > 0) {
            setDraftPolygonPoints([]);
          } else if (selectedZoneIdx !== null) {
            setSelectedZoneIdx(null);
          } else {
            closeZoneStudio();
          }
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          if (zoneToolMode === 'polygon' && draftPolygonPoints.length >= 3) {
            handleFinishPolygon();
          }
          return;
        }
        if (e.key.toLowerCase() === 'r') {
          e.preventDefault();
          setZoneToolMode('box');
          setSelectedZoneIdx(null);
          return;
        }
        if (e.key.toLowerCase() === 'p') {
          e.preventDefault();
          setZoneToolMode('polygon');
          setSelectedZoneIdx(null);
          return;
        }
        if (e.key.toLowerCase() === 'v') {
          e.preventDefault();
          setZoneToolMode('select');
          return;
        }
      }

      // Playback hotkeys
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        if (e.shiftKey) stepFrame(-1);
        else skipSeconds(-5);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        if (e.shiftKey) stepFrame(1);
        else skipSeconds(5);
      } else if (e.code === 'KeyM') {
        e.preventDefault();
        toggleMute();
      } else if (e.code === 'KeyF') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.code === 'KeyL') {
        e.preventDefault();
        setIsLoopingEvidence((prev) => !prev);
      } else if (e.code === 'KeyB') {
        e.preventDefault();
        setShowDetections((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isStudioOpen,
    zoneToolMode,
    draftPolygonPoints,
    selectedZoneIdx,
    togglePlay,
    skipSeconds,
    stepFrame,
    toggleMute,
    toggleFullscreen
  ]);

  return (
    <div
      ref={containerRef}
      className={`ui-card overflow-hidden flex flex-col bg-white border border-slate-200 shadow-xs ${
        isFullscreen ? 'fixed inset-0 z-50 rounded-none border-none' : ''
      }`}
    >
      {/* Top Header Controls Bar */}
      <div className="px-3.5 py-2 bg-slate-900 border-b border-slate-800 text-slate-300 flex items-center justify-between text-xs">
        <div className="flex items-center space-x-2">
          <span className="font-mono text-slate-300 text-[11px] font-medium">
            {formatSeconds(displayTime)} / {formatSeconds(effectiveDuration)}
          </span>
          {currentDetections.length > 0 && (
            <span className="text-[10px] text-slate-400 font-mono">
              ({currentDetections.length} objects)
            </span>
          )}
        </div>

        {/* Layer Switches & Zone Controls */}
        <div className="flex items-center space-x-1">
          <button
            onClick={() => setShowDetections(!showDetections)}
            className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
              showDetections ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Boxes
          </button>
          <button
            onClick={() => setShowTrails(!showTrails)}
            className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
              showTrails ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Trails
          </button>
          <button
            onClick={() => setShowZones(!showZones)}
            className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
              showZones ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Zones
          </button>

          {/* Zone Studio Toggle Button */}
          <button
            onClick={toggleZoneStudio}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium flex items-center space-x-1.5 border transition-all ${
              isStudioOpen
                ? 'bg-amber-600 border-amber-500 text-white shadow-sm'
                : 'bg-slate-800 border-slate-700 text-amber-400 hover:bg-slate-700 hover:border-slate-600'
            }`}
            title="Open Zone Studio to draw and customize zones [Box, Polygon, Presets]"
          >
            <PenTool className="w-3.5 h-3.5" />
            <span>{isStudioOpen ? 'Exit Studio' : `Zone Studio (${zones.length})`}</span>
          </button>

          {/* Zones Management Drawer Button */}
          <button
            onClick={() => setShowZonesPanel(!showZonesPanel)}
            className={`p-1.5 rounded-md border transition-colors ${
              showZonesPanel
                ? 'bg-blue-600 border-blue-500 text-white'
                : 'border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
            title="Manage surveillance zones list"
          >
            <Layers className="w-3.5 h-3.5" />
          </button>

          {/* Filter dropdown */}
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value as any)}
            className="bg-slate-800 text-slate-300 text-[10px] rounded px-1.5 py-0.5 ml-1 border border-slate-700 focus:outline-none cursor-pointer"
          >
            <option value="all">All Objects</option>
            <option value="person">Persons Only</option>
            <option value="vehicle">Vehicles Only</option>
            <option value="item">Items Only</option>
          </select>

          <button
            onClick={() => setShowHotkeysHelp(!showHotkeysHelp)}
            className="p-1 rounded text-slate-400 hover:text-slate-200 ml-1"
            title="Shortcuts"
          >
            <HelpCircle className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

        {/* Zone Studio CAD Floating Toolbar */}
        {isStudioOpen && (
        <div className="bg-slate-900 border-b border-slate-800 px-3.5 py-2 text-xs text-white flex flex-wrap items-center gap-3 select-none w-full">
            {/* Tool Selection */}
            <div className="flex items-center bg-slate-800/90 rounded-xl p-0.5 border border-slate-700/60">
              <button
                type="button"
                onClick={() => { setZoneToolMode('box'); setSelectedZoneIdx(null); }}
                className={`px-2.5 py-1 rounded-lg flex items-center space-x-1.5 transition-all text-xs font-medium ${
                  zoneToolMode === 'box' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                }`}
                title="Box Tool: Click and drag anywhere to create a box [R]"
              >
                <Square className="w-3.5 h-3.5" />
                <span>Box (Drag)</span>
              </button>
              <button
                type="button"
                onClick={() => { setZoneToolMode('polygon'); setSelectedZoneIdx(null); }}
                className={`px-2.5 py-1 rounded-lg flex items-center space-x-1.5 transition-all text-xs font-medium ${
                  zoneToolMode === 'polygon' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                }`}
                title="Polygon Tool: Click vertices to create freeform zone [P]"
              >
                <PenTool className="w-3.5 h-3.5" />
                <span>Polygon</span>
              </button>
              <button
                type="button"
                onClick={() => setZoneToolMode('select')}
                className={`px-2.5 py-1 rounded-lg flex items-center space-x-1.5 transition-all text-xs font-medium ${
                  zoneToolMode === 'select' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                }`}
                title="Select & Move: Drag handles or whole zone to tweak [V]"
              >
                <MousePointer className="w-3.5 h-3.5" />
                <span>Select & Move</span>
              </button>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowTemplatesMenu(!showTemplatesMenu)}
                  className="px-2 py-1 rounded-lg flex items-center space-x-1 transition-all text-xs font-medium text-amber-400 hover:bg-slate-700/60"
                  title="1-Click Scene Templates"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Presets ▾</span>
                </button>
                {/* Presets Popover Menu */}
                {showTemplatesMenu && (
                  <div className="absolute top-full mt-2 left-0 w-64 bg-slate-900/98 border border-slate-700 rounded-xl shadow-2xl p-2 z-40 space-y-1">
                    <div className="text-[10px] font-semibold text-slate-400 px-2 py-1 uppercase tracking-wider">
                      Quick Scene Presets
                    </div>
                    {ZONE_TEMPLATES.map((tmpl) => (
                      <button
                        key={tmpl.id}
                        type="button"
                        onClick={() => handleApplyTemplate(tmpl)}
                        className="w-full text-left p-1.5 rounded-lg hover:bg-slate-800 flex items-center space-x-2 transition-colors group"
                      >
                        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: tmpl.color }} />
                        <div className="flex flex-col truncate">
                          <span className="text-xs font-medium text-white group-hover:text-amber-300 truncate">
                            {tmpl.name}
                          </span>
                          <span className="text-[10px] text-slate-400 truncate">
                            {tmpl.description}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="h-5 w-px bg-slate-700" />

            {/* Active Zone Name & Type */}
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={activeZoneName}
                onChange={(e) => {
                  const val = e.target.value;
                  setActiveZoneName(val);
                  if (selectedZoneIdx !== null && zones[selectedZoneIdx]) {
                    const updated = [...zones];
                    updated[selectedZoneIdx].name = val;
                    saveZonesToBackend(updated);
                  }
                }}
                placeholder="Zone name"
                className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 w-28"
              />
              <select
                value={activeZoneType}
                onChange={(e) => {
                  const val = e.target.value;
                  setActiveZoneType(val);
                  if (selectedZoneIdx !== null && zones[selectedZoneIdx]) {
                    const updated = [...zones];
                    updated[selectedZoneIdx].zone_type = val;
                    saveZonesToBackend(updated);
                  }
                }}
                className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              >
                <option value="roadway">Roadway</option>
                <option value="walkway">Walkway</option>
                <option value="perimeter">Perimeter</option>
                <option value="restricted">Restricted</option>
                <option value="entry_exit">Entry / Gate</option>
              </select>

              {/* Color Swatches */}
              <div className="flex items-center space-x-1 pl-1">
                {['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'].map((col) => (
                  <button
                    key={col}
                    type="button"
                    onClick={() => {
                      setActiveZoneColor(col);
                      if (selectedZoneIdx !== null && zones[selectedZoneIdx]) {
                        const updated = [...zones];
                        updated[selectedZoneIdx].color = col;
                        saveZonesToBackend(updated);
                      }
                    }}
                    className={`w-3.5 h-3.5 rounded-full border transition-all ${
                      activeZoneColor === col ? 'ring-2 ring-white scale-110' : 'border-transparent hover:scale-105'
                    }`}
                    style={{ backgroundColor: col }}
                  />
                ))}
              </div>
            </div>

            <div className="h-5 w-px bg-slate-700" />

            {/* Mode Actions */}
            <div className="flex items-center space-x-1.5">
              {zoneToolMode === 'polygon' && (
                <>
                  <button
                    type="button"
                    onClick={handleUndoPolygonPoint}
                    disabled={draftPolygonPoints.length === 0}
                    className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 text-xs flex items-center space-x-1"
                    title="Undo last point [Backspace / Ctrl+Z]"
                  >
                    <Undo2 className="w-3 h-3" />
                    <span>Undo ({draftPolygonPoints.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleFinishPolygon}
                    disabled={draftPolygonPoints.length < 3}
                    className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 text-white font-medium text-xs flex items-center space-x-1 transition-colors"
                    title="Close Polygon [Enter]"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Close Shape</span>
                  </button>
                </>
              )}

              {zoneToolMode === 'select' && selectedZoneIdx !== null && (
                <>
                  <button
                    type="button"
                    onClick={handleDuplicateSelectedZone}
                    className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center space-x-1"
                    title="Duplicate Zone"
                  >
                    <Copy className="w-3 h-3" />
                    <span>Duplicate</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteSelectedZone}
                    className="px-2 py-1 rounded-lg bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/30 text-xs flex items-center space-x-1"
                    title="Delete Zone [Delete]"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Delete</span>
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={closeZoneStudio}
                className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium transition-colors"
                title="Exit Zone Studio [Esc]"
              >
                Done
              </button>
            </div>
          </div>
        )}

      {/* Video Container */}
      <div className="relative w-full aspect-video bg-black flex items-center justify-center overflow-hidden">
        <video
          ref={videoRef}
          src={`/api/videos/${videoId}/stream`}
          className="w-full h-full object-contain"
          preload="auto"
          onTimeUpdate={handleTimeUpdate}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
          muted={isMuted}
          playsInline
          onLoadedMetadata={syncCanvasResolution}
        />

        {/* Synchronized Canvas */}
        <canvas
          ref={canvasRef}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onClick={handleCanvasClick}
          onDoubleClick={handleCanvasDoubleClick}
          onMouseLeave={handleCanvasMouseLeave}
          className={`absolute inset-0 w-full h-full z-10 ${
            !isStudioOpen
              ? 'cursor-default'
              : zoneToolMode === 'box'
              ? 'cursor-crosshair'
              : zoneToolMode === 'polygon'
              ? isSnappingToStart
                ? 'cursor-pointer'
                : 'cursor-crosshair'
              : hoveredVertex
              ? 'cursor-grab'
              : hoveredZoneIdx !== null
              ? 'cursor-move'
              : 'cursor-default'
          }`}
        />

        {/* Dynamic Studio Helper Banner */}
        {isStudioOpen && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 px-3.5 py-1 rounded-full bg-slate-900/85 border border-slate-700/80 text-[11px] text-slate-300 backdrop-blur-xs flex items-center space-x-2 pointer-events-none shadow-lg">
            {zoneToolMode === 'box' && (
              <span>⚡ <strong>Box Mode:</strong> Click and drag anywhere to draw a rectangle zone</span>
            )}
            {zoneToolMode === 'polygon' && (
              <span>📍 <strong>Polygon Mode:</strong> Click points ({draftPolygonPoints.length}) &bull; Double-click or click start point to close &bull; [Backspace] undo</span>
            )}
            {zoneToolMode === 'select' && (
              <span>🖐 <strong>Select Mode:</strong> Click any zone &bull; Drag handles to reshape &bull; Drag body to move</span>
            )}
          </div>
        )}

        {/* Floating Toast Notice */}
        {zoneToast && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 px-3.5 py-1.5 rounded-xl bg-slate-950/95 text-emerald-400 border border-emerald-500/40 shadow-2xl text-xs font-medium backdrop-blur-md animate-in fade-in slide-in-from-top-2 flex items-center space-x-1.5">
            <Check className="w-3.5 h-3.5" />
            <span>{zoneToast}</span>
          </div>
        )}

        {/* Inspected Object HUD */}
        {inspectedTrack && (
          <div className="absolute top-3 left-3 z-20 bg-slate-900/95 border border-slate-700 rounded-lg p-3 text-xs text-slate-200 max-w-[220px] shadow-lg">
            <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-800">
              <span className="font-semibold text-white">Track #{inspectedTrack.track_id}</span>
              <button onClick={() => setInspectedTrack(null)} className="text-slate-400 hover:text-white">
                <X className="w-3 h-3" />
              </button>
            </div>
            <div className="text-[11px] font-mono space-y-1 text-slate-300">
              <div>Class: <span className="text-white capitalize">{inspectedTrack.class_name}</span></div>
              {inspectedTrack.color_desc && <div>Appearance: <span className="text-emerald-400">{inspectedTrack.color_desc}</span></div>}
              <div>Speed: <span className="text-white">{inspectedTrack.speed ? `${Math.round(inspectedTrack.speed)} px/s` : '0'}</span></div>
              {inspectedTrack.action && <div>Action: <span className="text-white capitalize">{inspectedTrack.action}</span></div>}
              {inspectedTrack.zone_name && <div>Zone: <span className="text-blue-400">{inspectedTrack.zone_name}</span></div>}
            </div>
          </div>
        )}

        {/* Zones Configuration Modal / Panel */}
        {showZonesPanel && (
          <div className="absolute top-3 right-3 z-30 bg-slate-900/95 border border-slate-700 rounded-lg p-3.5 text-xs text-slate-200 w-80 shadow-xl">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
              <div className="flex items-center space-x-1.5 font-medium text-white">
                <MapPin className="w-3.5 h-3.5 text-blue-400" />
                <span>Surveillance Zones</span>
              </div>
              <button onClick={() => setShowZonesPanel(false)} className="text-slate-400 hover:text-white">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <p className="text-[11px] text-slate-400 mb-2.5">
              Zones define operational boundaries for pedestrian walkways, vehicle roadways, and security perimeters.
            </p>

            {/* List of Zones with delete buttons */}
            <div className="space-y-1.5 mb-3 max-h-44 overflow-y-auto pr-1">
              {zones.length === 0 ? (
                <div className="text-[11px] text-slate-500 italic p-2 text-center">No zones defined yet.</div>
              ) : (
                zones.map((z, idx) => (
                  <div
                    key={idx}
                    onClick={() => {
                      setSelectedZoneIdx(idx);
                      setActiveZoneName(z.name);
                      setActiveZoneType(z.zone_type);
                      setActiveZoneColor(z.color || '#3b82f6');
                      setIsStudioOpen(true);
                      setZoneToolMode('select');
                      setShowZonesPanel(false);
                    }}
                    className={`p-2 rounded-lg border flex items-center justify-between group cursor-pointer transition-colors ${
                      selectedZoneIdx === idx
                        ? 'bg-blue-900/40 border-blue-500/80 ring-1 ring-blue-500/40'
                        : 'bg-slate-800/80 border-slate-700/60 hover:bg-slate-750'
                    }`}
                    title="Click to select and adjust handles in Studio"
                  >
                    <div className="flex items-center space-x-2 truncate">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: z.color || '#3b82f6' }} />
                      <div className="flex flex-col truncate">
                        <span className="font-medium text-slate-200 text-[11px] truncate">{z.name}</span>
                        <span className="text-[10px] text-slate-400 font-mono capitalize">{z.zone_type} &bull; {z.polygon?.length || 0} pts</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteZone(idx);
                      }}
                      className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-700/60 transition-colors"
                      title="Delete this zone"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="flex flex-col space-y-2">
              <button
                type="button"
                onClick={() => {
                  openZoneStudio();
                  setShowZonesPanel(false);
                }}
                className="w-full py-1.5 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs flex items-center justify-center space-x-1.5 transition-colors shadow-sm"
              >
                <PenTool className="w-3.5 h-3.5" />
                <span>Open Zone Studio (Draw / Edit)</span>
              </button>

              <button
                onClick={handleAutoDetectZones}
                disabled={isDetectingZones}
                className="w-full py-1.5 px-3 rounded border border-slate-700 hover:bg-slate-800 disabled:opacity-50 text-slate-300 font-medium text-xs flex items-center justify-center space-x-1.5 transition-colors"
              >
                {isDetectingZones ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Computing Scene Geometry...</span>
                  </>
                ) : zonesSuccess ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-300" />
                    <span>Zones Calibrated to Scene Paths!</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
                    <span>Auto-Detect from Trajectories</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Shortcuts popup */}
        {showHotkeysHelp && (
          <div className="absolute inset-0 bg-black/70 z-30 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 max-w-xs w-full text-xs text-slate-300">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800 font-semibold text-white">
                <span>Keyboard Shortcuts</span>
                <button onClick={() => setShowHotkeysHelp(false)} className="text-slate-400 hover:text-white">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="space-y-1.5 text-[11px] font-mono">
                <div className="flex justify-between"><span>Play/Pause</span><span className="text-white">Space</span></div>
                <div className="flex justify-between"><span>Step -/+ 5s</span><span className="text-white">&larr; / &rarr;</span></div>
                <div className="flex justify-between"><span>Step 1 frame</span><span className="text-white">Shift + &larr;/&rarr;</span></div>
                <div className="flex justify-between"><span>Mute</span><span className="text-white">M</span></div>
                <div className="flex justify-between"><span>Fullscreen</span><span className="text-white">F</span></div>
                <div className="flex justify-between"><span>Toggle Boxes</span><span className="text-white">B</span></div>
                <div className="flex justify-between"><span>Loop Segment</span><span className="text-white">L</span></div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Clean Bottom Playback Bar */}
      <div className="p-3 bg-white border-t border-slate-200 flex flex-col space-y-2">
        {/* Scrub Bar */}
        <div
          className="relative w-full flex items-center py-0.5 group"
          onMouseMove={handleSliderMouseMove}
          onMouseLeave={handleSliderMouseLeave}
        >
          {hoverTime !== null && (
            <div
              className="absolute -top-6 px-1.5 py-0.5 rounded bg-slate-900 text-white text-[10px] font-mono pointer-events-none transform -translate-x-1/2"
              style={{ left: `${hoverX}px` }}
            >
              {formatSeconds(hoverTime)}
            </div>
          )}

          <input
            type="range"
            min={0}
            max={effectiveDuration}
            step={0.05}
            value={displayTime}
            onMouseDown={handleScrubStart}
            onTouchStart={handleScrubStart}
            onChange={handleScrubChange}
            onMouseUp={handleScrubEnd}
            onTouchEnd={handleScrubEnd}
            className="w-full h-1.5 bg-slate-200 rounded appearance-none cursor-pointer accent-slate-900 z-10"
          />

          {evidenceRange && effectiveDuration > 0 && (
            <div
              className="absolute top-1 bottom-1 bg-blue-400/80 rounded pointer-events-none z-0"
              style={{
                left: `${(evidenceRange.start / effectiveDuration) * 100}%`,
                width: `${Math.max(0.5, ((evidenceRange.end - evidenceRange.start) / effectiveDuration) * 100)}%`
              }}
            />
          )}

          {/* Event pins */}
          {events.map((ev, idx) => (
            <div
              key={idx}
              className="absolute top-0 w-1 h-1.5 bg-amber-400 rounded-xs pointer-events-none z-0"
              style={{
                left: `${(ev.timestamp / effectiveDuration) * 100}%`
              }}
              title={ev.description}
            />
          ))}
        </div>

        {/* Buttons Row */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-700">
          <div className="flex items-center space-x-1.5">
            <button
              onClick={togglePlay}
              className="w-7 h-7 rounded bg-slate-900 hover:bg-slate-800 text-white flex items-center justify-center transition-colors"
              title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5 fill-current" />}
            </button>

            <button
              onClick={() => {
                if (videoRef.current) {
                  videoRef.current.currentTime = 0;
                  onTimeUpdate(0);
                }
              }}
              className="p-1.5 rounded hover:bg-slate-100 text-slate-500"
              title="Restart"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => skipSeconds(-5)}
              className="p-1.5 rounded hover:bg-slate-100 text-slate-500"
              title="Back 5s"
            >
              <SkipBack className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => skipSeconds(5)}
              className="p-1.5 rounded hover:bg-slate-100 text-slate-500"
              title="Forward 5s"
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>

            {/* Frame step */}
            <div className="flex items-center border border-slate-200 rounded text-[10px]">
              <button
                onClick={() => stepFrame(-1)}
                className="px-1 py-0.5 text-slate-600 hover:bg-slate-100 rounded-l"
                title="Previous Frame"
              >
                <ChevronLeft className="w-3 h-3" />
              </button>
              <span className="px-1 text-slate-400 font-mono">FR</span>
              <button
                onClick={() => stepFrame(1)}
                className="px-1 py-0.5 text-slate-600 hover:bg-slate-100 rounded-r"
                title="Next Frame"
              >
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>

            {/* Volume */}
            <div className="flex items-center space-x-1 pl-1">
              <button onClick={toggleMute} className="p-1 text-slate-500 hover:text-slate-800">
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-3.5 h-3.5" />
                ) : volume < 0.5 ? (
                  <Volume1 className="w-3.5 h-3.5" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5" />
                )}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-12 h-1 bg-slate-200 rounded appearance-none cursor-pointer accent-slate-900"
              />
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {evidenceRange && (
              <button
                onClick={() => setIsLoopingEvidence(!isLoopingEvidence)}
                className={`px-2 py-1 rounded text-[11px] font-medium flex items-center space-x-1 border transition-colors ${
                  isLoopingEvidence
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <Repeat className="w-3 h-3" />
                <span>Loop Segment</span>
              </button>
            )}

            {/* Speed */}
            <div className="flex items-center border border-slate-200 rounded p-0.5">
              {[0.5, 1, 2].map((spd) => (
                <button
                  key={spd}
                  onClick={() => handleSpeedChange(spd)}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                    playbackSpeed === spd ? 'bg-slate-900 text-white font-medium' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {spd}x
                </button>
              ))}
            </div>

            <button
              onClick={toggleFullscreen}
              className="p-1 rounded text-slate-500 hover:text-slate-900"
              title="Fullscreen"
            >
              {isFullscreen ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoPlayer;
