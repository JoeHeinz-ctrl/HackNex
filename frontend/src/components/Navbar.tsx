import React from 'react';
import type { VideoItem } from '../types';
import { Video, Upload, Info } from 'lucide-react';

interface NavbarProps {
  videos: VideoItem[];
  selectedVideoId: string;
  onSelectVideo: (id: string) => void;
  onOpenUpload: () => void;
  onOpenArchitecture: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  videos,
  selectedVideoId,
  onSelectVideo,
  onOpenUpload,
  onOpenArchitecture
}) => {
  return (
    <header className="border-b border-slate-200 bg-white sticky top-0 z-40 px-4 sm:px-6 py-2.5 flex items-center justify-between gap-4 w-full">
      {/* Brand Identity */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
          <Video className="w-4 h-4" />
        </div>
        <div className="flex flex-col whitespace-nowrap">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold tracking-tight text-slate-900 leading-none">
              Video Analytics Studio
            </span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 leading-none">
              v2.0
            </span>
          </div>
          <span className="text-[11px] text-slate-500 leading-tight mt-1">
            Object Detection &amp; Timeline Search
          </span>
        </div>
      </div>

      {/* Action Controls & Video Selection */}
      <div className="flex items-center gap-2.5 text-xs flex-shrink-0">
        {/* Compact Video Selector */}
        {videos.length > 0 && (
          <div className="flex items-center bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-700 transition-colors flex-shrink-0">
            <span className="text-slate-400 mr-2 font-medium flex-shrink-0">Video:</span>
            <select
              value={selectedVideoId}
              onChange={(e) => onSelectVideo(e.target.value)}
              className="bg-transparent text-slate-900 font-medium focus:outline-none cursor-pointer truncate max-w-[140px] sm:max-w-[200px]"
            >
              {videos.map((v) => (
                <option key={v.id} value={v.id} className="bg-white text-slate-900">
                  {v.filename}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Upload Button */}
        <button
          onClick={onOpenUpload}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-medium transition-colors shadow-sm flex-shrink-0"
        >
          <Upload className="w-3.5 h-3.5" />
          <span>Upload Video</span>
        </button>

        {/* Pipeline Info Button */}
        <button
          onClick={onOpenArchitecture}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 transition-colors flex-shrink-0"
          title="Pipeline Architecture & Capabilities"
        >
          <Info className="w-3.5 h-3.5 text-slate-500" />
          <span className="hidden sm:inline">Pipeline</span>
        </button>

        {/* System Online Status */}
        <div className="hidden md:flex items-center gap-1.5 pl-2.5 border-l border-slate-200 text-slate-500 text-[11px] flex-shrink-0">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="font-medium text-slate-600">Ready</span>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
