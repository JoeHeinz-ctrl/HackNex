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
    <header className="border-b border-slate-200 bg-white sticky top-0 z-40 px-5 py-3 flex items-center justify-between">
      <div className="flex items-center space-x-3">
        <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center">
          <Video className="w-4 h-4" />
        </div>
        <div>
          <span className="text-sm font-semibold tracking-tight text-slate-900 block leading-tight">
            Video Analytics Studio
          </span>
          <span className="text-[11px] text-slate-500 block leading-tight">
            Object Detection & Timeline Search
          </span>
        </div>
      </div>

      <div className="flex items-center space-x-3 text-xs">
        {/* Video selector */}
        {videos.length > 0 && (
          <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700">
            <span className="text-slate-500 mr-2 font-medium">Video:</span>
            <select
              value={selectedVideoId}
              onChange={(e) => onSelectVideo(e.target.value)}
              className="bg-transparent text-slate-900 font-medium focus:outline-none cursor-pointer"
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
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-medium transition-colors"
        >
          <Upload className="w-3.5 h-3.5" />
          <span>Upload Video</span>
        </button>

        {/* Pipeline Info Button */}
        <button
          onClick={onOpenArchitecture}
          className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors"
          title="Pipeline Information"
        >
          <Info className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Pipeline</span>
        </button>

        {/* System Online Status */}
        <div className="hidden md:flex items-center space-x-1.5 pl-2 border-l border-slate-200 text-slate-500 text-[11px]">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span>Ready</span>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
