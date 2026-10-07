import React from 'react';
import { X } from 'lucide-react';

interface ArchitectureModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ArchitectureModal: React.FC<ArchitectureModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const layers = [
    {
      step: '01',
      title: 'Video Ingestion & Frame Sampling',
      desc: 'Samples video frames at 8–10 FPS using OpenCV. Generates exact timestamps and frame index mappings.',
      tech: 'OpenCV (cv2.VideoCapture) + FastAPI'
    },
    {
      step: '02',
      title: 'Object Detection & Tracking',
      desc: 'Detects multi-class objects (persons, vehicles, luggage) with persistent tracking IDs across occlusions.',
      tech: 'YOLOv8 + ByteTrack'
    },
    {
      step: '03',
      title: 'Kinematics & Velocity Engine',
      desc: 'Tracks centroid displacement (dx/dt, dy/dt), speeds in px/s, movement headings, and actions (idle, walking, speeding).',
      tech: 'Vector Motion & Kinematics'
    },
    {
      step: '04',
      title: 'Spatial Surveillance Zones',
      desc: 'Evaluates point-in-polygon geometry for transit corridors, pedestrian walkways, and restricted perimeters.',
      tech: 'Shapely Polygon Engine'
    },
    {
      step: '05',
      title: 'Temporal Event Database',
      desc: 'Stores chronological timeline events, zone transitions, loitering states, and object track durations.',
      tech: 'SQLite (Indexed Temporal Schema)'
    },
    {
      step: '06',
      title: 'Temporal Query Engine',
      desc: 'Executes temporal relational queries (BEFORE, AFTER, DURATION, COUNT) with ground-truth evidence bounds.',
      tech: 'Temporal Logic & Event Matcher'
    }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="ui-card w-full max-w-3xl max-h-[85vh] overflow-y-auto bg-white border border-slate-200 p-5 rounded-xl shadow-lg flex flex-col space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              System Pipeline Architecture
            </h2>
            <p className="text-xs text-slate-500">
              Multi-stage video tracking, spatial geometry, and temporal search pipeline
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded text-slate-400 hover:text-slate-700">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 6 Layers Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {layers.map((l) => (
            <div key={l.step} className="p-3 rounded-lg border border-slate-200 bg-slate-50/50 flex flex-col justify-between">
              <div>
                <div className="text-[10px] font-mono text-slate-400 font-semibold mb-1">
                  STAGE {l.step}
                </div>
                <h3 className="text-xs font-semibold text-slate-900">{l.title}</h3>
                <p className="text-[11px] text-slate-600 mt-1 leading-normal">{l.desc}</p>
              </div>
              <div className="mt-2 pt-2 border-t border-slate-200 font-mono text-[10px] text-slate-500">
                {l.tech}
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ArchitectureModal;
