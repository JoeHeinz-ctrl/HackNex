import React from 'react';
import type { EventItem, TrackItem } from '../types';

interface MultiTrackTimelineProps {
  duration: number;
  currentTime: number;
  events: EventItem[];
  tracks: TrackItem[];
  evidenceRange: { start: number; end: number } | null;
  selectedTrackId?: number | null;
  onSelectTrack?: (trackId: number | null) => void;
  onSeek: (timestamp: number) => void;
}

export const MultiTrackTimeline: React.FC<MultiTrackTimelineProps> = ({
  duration,
  currentTime,
  events,
  tracks,
  evidenceRange,
  selectedTrackId,
  onSelectTrack,
  onSeek
}) => {
  const effectiveDuration = duration > 0 ? duration : 100;

  const dynamicTracks = tracks.map((trk) => {
    let barColor = 'bg-blue-200 border-blue-300 text-blue-900';
    if (trk.class_name === 'person') {
      barColor = 'bg-emerald-200 border-emerald-300 text-emerald-900';
    } else if (['truck', 'car', 'bus'].includes(trk.class_name)) {
      barColor = 'bg-slate-200 border-slate-300 text-slate-800';
    }

    const trkEvents = events.filter((e) => e.object_id === trk.track_id);

    return {
      id: `trk_${trk.track_id}`,
      label: `${trk.class_name.charAt(0).toUpperCase() + trk.class_name.slice(1)} #${trk.track_id}`,
      barColor,
      trackItem: trk,
      events: trkEvents
    };
  });

  const formatMinSec = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="ui-card p-4 bg-white border border-slate-200 rounded-xl flex flex-col space-y-2">
      <div className="flex items-center justify-between pb-2 border-b border-slate-100 text-xs">
        <span className="font-semibold text-slate-800">
          Object Timeline
        </span>
        <span className="text-slate-400 font-mono text-[11px]">
          Click timeline or tracks to seek
        </span>
      </div>

      {/* Timeline Ruler Header */}
      <div className="relative h-5 border-b border-slate-200 flex items-center ml-44 text-[10px] font-mono text-slate-400">
        {[0, 10, 20, 30, 40, 50, 60, 90, 120].map((tick) => {
          if (tick > effectiveDuration) return null;
          const posPercent = (tick / effectiveDuration) * 100;
          return (
            <div
              key={tick}
              className="absolute transform -translate-x-1/2 flex flex-col items-center"
              style={{ left: `${posPercent}%` }}
            >
              <div className="h-1.5 w-px bg-slate-300" />
              <span>{formatMinSec(tick)}</span>
            </div>
          );
        })}
      </div>

      {/* Tracks Container */}
      <div className="relative flex flex-col space-y-1.5 pt-1">
        {/* Playback Scrub Needle Line */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-slate-900 z-20 pointer-events-none"
          style={{
            left: `calc(11rem + ${(currentTime / effectiveDuration) * 100} * (100% - 11rem) / 100)`
          }}
        >
          <div className="w-2 h-2 bg-slate-900 rotate-45 transform -translate-x-[3px] -translate-y-1" />
        </div>

        {/* Evidence Highlight Band */}
        {evidenceRange && (
          <div
            className="absolute top-0 bottom-0 bg-blue-100/60 border-x border-blue-300 pointer-events-none z-10"
            style={{
              left: `calc(11rem + ${(evidenceRange.start / effectiveDuration) * 100} * (100% - 11rem) / 100)`,
              width: `calc(${((evidenceRange.end - evidenceRange.start) / effectiveDuration) * 100} * (100% - 11rem) / 100)`
            }}
          />
        )}

        {/* Dynamic Track Rows */}
        {dynamicTracks.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-400">
            No tracked objects found for this video.
          </div>
        ) : (
          dynamicTracks.map((row) => {
            const isRowSelected = row.trackItem && selectedTrackId === row.trackItem.track_id;
            return (
              <div
                key={row.id}
                onClick={() => {
                  if (row.trackItem && onSelectTrack) {
                    onSelectTrack(isRowSelected ? null : row.trackItem.track_id);
                  }
                }}
                className={`flex items-center h-7 rounded px-1 transition-colors cursor-pointer ${
                  isRowSelected ? 'bg-amber-50 ring-1 ring-amber-300' : 'hover:bg-slate-50'
                }`}
              >
                {/* Track Label with Zone badge */}
                <div className="w-44 pr-2 text-xs text-slate-700 font-medium truncate flex-shrink-0 flex items-center justify-between">
                  <span className="truncate">{row.label}</span>
                  {row.trackItem?.primary_zone && (
                    <span className="text-[9px] px-1 py-0.2 rounded bg-blue-50 text-blue-600 border border-blue-200 truncate ml-1 font-mono max-w-[80px]" title={`Zone: ${row.trackItem.primary_zone}`}>
                      {row.trackItem.primary_zone}
                    </span>
                  )}
                </div>

                {/* Track Bar Channel */}
                <div className="relative flex-1 h-5 bg-slate-50 rounded border border-slate-200 overflow-hidden">
                  {row.trackItem && (
                    <div
                      className={`absolute top-0.5 bottom-0.5 rounded border opacity-75 ${
                        isRowSelected ? 'bg-amber-300 border-amber-400' : row.barColor
                      }`}
                      style={{
                        left: `${(row.trackItem.first_seen / effectiveDuration) * 100}%`,
                        width: `${Math.max(1.5, ((row.trackItem.last_seen - row.trackItem.first_seen) / effectiveDuration) * 100)}%`
                      }}
                      title={`${row.label} (${formatMinSec(row.trackItem.first_seen)} - ${formatMinSec(row.trackItem.last_seen)})`}
                    />
                  )}

                  {/* Event points */}
                  {row.events.map((ev, idx) => {
                    const pos = (ev.timestamp / effectiveDuration) * 100;
                    return (
                      <button
                        key={idx}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSeek(ev.timestamp);
                        }}
                        className="absolute top-0.5 bottom-0.5 px-1.5 rounded bg-white hover:bg-slate-800 hover:text-white border border-slate-300 text-[10px] text-slate-700 z-10 truncate cursor-pointer transition-colors"
                        style={{ left: `${pos}%` }}
                        title={`${ev.description} (${formatMinSec(ev.timestamp)})`}
                      >
                        {formatMinSec(ev.timestamp)}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default MultiTrackTimeline;
