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
  Plus
} from 'lucide-react';
import type { EventItem, ZoneItem, DetectionItem } from '../types';

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

  // Custom Zone Drawing States
  const [isDrawingZone, setIsDrawingZone] = useState<boolean>(false);
  const [draftZonePoints, setDraftZonePoints] = useState<[number, number][]>([]);
  const [draftZoneName, setDraftZoneName] = useState<string>('Custom Zone');
  const [draftZoneType, setDraftZoneType] = useState<string>('roadway');
  const [draftZoneColor, setDraftZoneColor] = useState<string>('#3b82f6');

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

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea') return;

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
  }, [togglePlay, skipSeconds, stepFrame, toggleMute, toggleFullscreen]);

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
      zones.forEach((z) => {
        if (!z.polygon || z.polygon.length < 3) return;
        ctx.beginPath();
        ctx.moveTo(toX(z.polygon[0][0]), toY(z.polygon[0][1]));
        for (let i = 1; i < z.polygon.length; i++) {
          ctx.lineTo(toX(z.polygon[i][0]), toY(z.polygon[i][1]));
        }
        ctx.closePath();

        const baseColor = z.color || '#3b82f6';
        ctx.fillStyle = `${baseColor}15`;
        ctx.fill();

        ctx.lineWidth = 1.5;
        ctx.strokeStyle = `${baseColor}99`;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Zone label tag
        const firstPt = z.polygon[0];
        const tagX = toX(firstPt[0]);
        const tagY = toY(firstPt[1]) - 4;
        ctx.font = '500 11px Inter, sans-serif';
        const textWidth = ctx.measureText(z.name).width;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.fillRect(tagX - 3, tagY - 13, textWidth + 8, 16);
        ctx.fillStyle = '#f8fafc';
        ctx.fillText(z.name, tagX + 1, tagY - 1);
      });
    }

    // 1b. Draw Active Custom Draft Zone Being Marked
    if (isDrawingZone && draftZonePoints.length > 0) {
      ctx.beginPath();
      ctx.moveTo(toX(draftZonePoints[0][0]), toY(draftZonePoints[0][1]));
      for (let i = 1; i < draftZonePoints.length; i++) {
        ctx.lineTo(toX(draftZonePoints[i][0]), toY(draftZonePoints[i][1]));
      }
      if (draftZonePoints.length >= 3) {
        ctx.closePath();
        ctx.fillStyle = `${draftZoneColor}30`;
        ctx.fill();
      }
      ctx.lineWidth = 2;
      ctx.strokeStyle = draftZoneColor;
      ctx.setLineDash([5, 3]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Point handles
      draftZonePoints.forEach((pt, pIdx) => {
        const px = toX(pt[0]);
        const py = toY(pt[1]);
        ctx.beginPath();
        ctx.arc(px, py, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = draftZoneColor;
        ctx.stroke();

        ctx.font = '700 9px Inter, sans-serif';
        ctx.fillStyle = draftZoneColor;
        ctx.fillText(`${pIdx + 1}`, px + 7, py - 4);
      });
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
  }, [showZones, showDetections, zones, showTrails, selectedTrackId, getDetectionsAtTime, isDrawingZone, draftZonePoints, draftZoneColor]);

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

  // Canvas click detection for object selection & zone point marking
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!videoRef.current) return;
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

    // Zone marking mode: record polygon vertex
    if (isDrawingZone) {
      const nx = Math.max(0, Math.min(1, (clickX - ox) / rw));
      const ny = Math.max(0, Math.min(1, (clickY - oy) / rh));
      setDraftZonePoints((prev) => [...prev, [parseFloat(nx.toFixed(4)), parseFloat(ny.toFixed(4))]]);
      return;
    }

    if (currentDetections.length === 0) {
      setInspectedTrack(null);
      if (onSelectTrack) onSelectTrack(null);
      return;
    }

    const clicked = currentDetections.find((d) => {
      const [nx1, ny1, nx2, ny2] = d.bbox_norm || [0, 0, 0, 0];
      const bx = ox + nx1 * rw;
      const by = oy + ny1 * rh;
      const bw = (nx2 - nx1) * rw;
      const bh = (ny2 - ny1) * rh;
      return clickX >= bx && clickX <= bx + bw && clickY >= by && clickY <= by + bh;
    });

    if (clicked) {
      setInspectedTrack(clicked);
      if (onSelectTrack) onSelectTrack(clicked.track_id);
    } else {
      setInspectedTrack(null);
      if (onSelectTrack) onSelectTrack(null);
    }
  };

  // Complete and save custom marked zone
  const finishDraftZone = async () => {
    if (draftZonePoints.length < 3) return;
    const newZone: ZoneItem = {
      name: draftZoneName.trim() || `Zone ${zones.length + 1}`,
      zone_type: draftZoneType,
      color: draftZoneColor,
      polygon: draftZonePoints
    };

    const updatedZones = [...zones, newZone];
    try {
      const res = await fetch(`/api/videos/${videoId}/zones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedZones)
      });
      if (res.ok) {
        if (onZonesUpdated) onZonesUpdated(updatedZones);
      }
    } catch (err) {
      console.error('Failed to save custom zone:', err);
    }
    setIsDrawingZone(false);
    setDraftZonePoints([]);
    setShowZones(true);
  };

  // Delete an existing zone
  const handleDeleteZone = async (indexToDelete: number) => {
    const updatedZones = zones.filter((_, idx) => idx !== indexToDelete);
    try {
      const res = await fetch(`/api/videos/${videoId}/zones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedZones)
      });
      if (res.ok) {
        if (onZonesUpdated) onZonesUpdated(updatedZones);
      }
    } catch (err) {
      console.error('Failed to delete zone:', err);
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

          {/* Zones Management Drawer Button */}
          <button
            onClick={() => setShowZonesPanel(!showZonesPanel)}
            className={`px-2 py-0.5 rounded text-[11px] font-medium flex items-center space-x-1 border transition-colors ${
              showZonesPanel
                ? 'bg-blue-600 border-blue-500 text-white'
                : 'border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <MapPin className="w-3 h-3" />
            <span>Zones ({zones.length})</span>
          </button>

          {/* Direct Mark Zone Button */}
          <button
            onClick={() => {
              const nextState = !isDrawingZone;
              setIsDrawingZone(nextState);
              if (nextState) {
                setDraftZonePoints([]);
                setDraftZoneName(`Zone ${zones.length + 1}`);
                setShowZones(true);
                setShowZonesPanel(false);
              }
            }}
            className={`px-2 py-0.5 rounded text-[11px] font-medium flex items-center space-x-1 border transition-colors ${
              isDrawingZone
                ? 'bg-amber-600 border-amber-500 text-white shadow-xs'
                : 'border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
            title="Mark a custom surveillance zone by clicking points on video"
          >
            <PenTool className="w-3 h-3" />
            <span>{isDrawingZone ? 'Cancel Marking' : 'Mark Zone'}</span>
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
          onClick={handleCanvasClick}
          onDoubleClick={() => {
            if (isDrawingZone && draftZonePoints.length >= 3) {
              finishDraftZone();
            }
          }}
          className={`absolute inset-0 w-full h-full z-10 ${isDrawingZone ? 'cursor-crosshair' : 'cursor-default'}`}
        />

        {/* Active Zone Marking Floating HUD */}
        {isDrawingZone && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 bg-slate-900/95 border border-amber-500/80 rounded-xl px-3.5 py-2 text-xs text-white shadow-2xl flex flex-wrap items-center gap-2.5 backdrop-blur-sm max-w-[95%]">
            <div className="flex items-center gap-1.5 font-medium text-amber-400">
              <PenTool className="w-3.5 h-3.5" />
              <span>Click to place points ({draftZonePoints.length})</span>
            </div>

            <input
              type="text"
              value={draftZoneName}
              onChange={(e) => setDraftZoneName(e.target.value)}
              placeholder="Zone name"
              className="bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-amber-400 w-28"
            />

            <select
              value={draftZoneType}
              onChange={(e) => setDraftZoneType(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-xs text-slate-200 focus:outline-none focus:border-amber-400"
            >
              <option value="roadway">Roadway</option>
              <option value="walkway">Walkway</option>
              <option value="perimeter">Perimeter</option>
              <option value="restricted">Restricted</option>
            </select>

            <div className="flex items-center gap-1">
              {['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setDraftZoneColor(c)}
                  className={`w-3.5 h-3.5 rounded-full border ${draftZoneColor === c ? 'ring-2 ring-white scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>

            <div className="flex items-center gap-1 pl-1.5 border-l border-slate-700">
              <button
                type="button"
                onClick={finishDraftZone}
                disabled={draftZonePoints.length < 3}
                className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:hover:bg-amber-600 text-white font-medium text-xs transition-colors flex items-center gap-1"
                title={draftZonePoints.length < 3 ? 'Place at least 3 points on video' : 'Save zone'}
              >
                <Check className="w-3.5 h-3.5" />
                <span>Save</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsDrawingZone(false);
                  setDraftZonePoints([]);
                }}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors"
              >
                Cancel
              </button>
            </div>
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
                  <div key={idx} className="p-2 rounded bg-slate-800/80 border border-slate-700/60 flex items-center justify-between group">
                    <div className="flex items-center space-x-2 truncate">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: z.color || '#3b82f6' }} />
                      <div className="flex flex-col truncate">
                        <span className="font-medium text-slate-200 text-[11px] truncate">{z.name}</span>
                        <span className="text-[10px] text-slate-400 font-mono capitalize">{z.zone_type} &bull; {z.polygon?.length || 0} pts</span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteZone(idx)}
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
                onClick={() => {
                  setIsDrawingZone(true);
                  setDraftZonePoints([]);
                  setDraftZoneName(`Zone ${zones.length + 1}`);
                  setShowZones(true);
                  setShowZonesPanel(false);
                }}
                className="w-full py-1.5 px-3 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs flex items-center justify-center space-x-1.5 transition-colors shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Draw / Mark Custom Zone</span>
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
