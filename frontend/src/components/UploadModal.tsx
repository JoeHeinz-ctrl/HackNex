import React, { useState } from 'react';
import { X, Film, AlertCircle } from 'lucide-react';
import type { VideoItem } from '../types';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVideoUploaded: (video: VideoItem) => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({ isOpen, onClose, onVideoUploaded }) => {
  if (!isOpen) return null;

  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setIsUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/videos/upload', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        throw new Error('Upload failed');
      }

      const newVideo: VideoItem = await res.json();
      onVideoUploaded(newVideo);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error uploading video');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="ui-card w-full max-w-md bg-white border border-slate-200 p-5 rounded-xl shadow-lg flex flex-col space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Upload Video</h3>
            <p className="text-xs text-slate-500">Select an MP4 video file for detection and timeline analysis</p>
          </div>
          <button onClick={onClose} className="p-1 rounded text-slate-400 hover:text-slate-700">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="border border-dashed border-slate-300 hover:border-slate-500 rounded-lg p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-colors relative bg-slate-50 hover:bg-slate-100/50">
          <input
            type="file"
            accept="video/mp4,video/avi,video/quicktime,video/mkv"
            onChange={handleFileChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <Film className="w-8 h-8 text-slate-500 mb-2" />
          <span className="text-xs font-medium text-slate-800">
            {file ? file.name : 'Choose video or drag & drop'}
          </span>
          <span className="text-[11px] text-slate-400 mt-1">
            MP4, MOV, or AVI
          </span>
        </div>

        {error && (
          <div className="flex items-center space-x-2 text-xs text-red-700 bg-red-50 p-2 rounded border border-red-200">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex justify-end space-x-2 pt-1">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded bg-slate-100 text-xs font-medium text-slate-700 hover:bg-slate-200"
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={!file || isUploading}
            className="px-3.5 py-1.5 rounded bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-xs font-medium text-white transition-colors"
          >
            {isUploading ? 'Uploading...' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default UploadModal;
