import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { VideoPlayer } from './components/VideoPlayer';
import { QuestionInterface } from './components/QuestionInterface';
import { AnswerCard } from './components/AnswerCard';
import { MultiTrackTimeline } from './components/MultiTrackTimeline';
import { ArchitectureModal } from './components/ArchitectureModal';
import { UploadModal } from './components/UploadModal';
import type { VideoItem, TimelineData, QueryResult, PresetQuestion, DetectionItem } from './types';
import { RefreshCw, Upload, Film } from 'lucide-react';

export const App: React.FC = () => {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState<string>('');
  const [timeline, setTimeline] = useState<TimelineData | null>(null);
  const [detections, setDetections] = useState<DetectionItem[]>([]);
  const [selectedTrackId, setSelectedTrackId] = useState<number | null>(null);
  const [presetQuestions, setPresetQuestions] = useState<PresetQuestion[]>([]);
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [isQuerying, setIsQuerying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [seekToTime, setSeekToTime] = useState<number | null>(null);
  const [evidenceRange, setEvidenceRange] = useState<{ start: number; end: number } | null>(null);
  const [isArchModalOpen, setIsArchModalOpen] = useState<boolean>(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const fetchVideos = async () => {
    try {
      const res = await fetch('/api/videos');
      if (res.ok) {
        const data: VideoItem[] = await res.json();
        setVideos(data);
        if (data.length > 0 && (!selectedVideoId || !data.some((v) => v.id === selectedVideoId))) {
          setSelectedVideoId(data[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to load videos:', err);
    }
  };

  const loadVideoTimeline = async (id: string) => {
    try {
      const res = await fetch(`/api/videos/${id}/timeline`);
      if (res.ok) {
        const data: TimelineData = await res.json();
        setTimeline(data);
      }
    } catch (err) {
      console.error('Failed to load timeline:', err);
    }
  };

  const loadPresetQuestions = async (id: string) => {
    try {
      const res = await fetch(`/api/videos/${id}/questions/preset`);
      if (res.ok) {
        const data = await res.json();
        setPresetQuestions(data);
      }
    } catch (err) {
      console.error('Failed to load preset questions:', err);
    }
  };

  const loadVideoDetections = async (id: string) => {
    try {
      const res = await fetch(`/api/videos/${id}/detections`);
      if (res.ok) {
        const data = await res.json();
        setDetections(data.detections || []);
      }
    } catch (err) {
      console.error('Failed to load detections:', err);
    }
  };

  // Load videos on mount
  useEffect(() => {
    fetchVideos();
  }, []);

  useEffect(() => {
    if (selectedVideoId) {
      loadVideoTimeline(selectedVideoId);
      loadPresetQuestions(selectedVideoId);
      loadVideoDetections(selectedVideoId);
    }
  }, [selectedVideoId]);

  const handleAskQuestion = async (question: string) => {
    setIsQuerying(true);
    try {
      const res = await fetch(`/api/videos/${selectedVideoId}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question })
      });

      if (res.ok) {
        const result: QueryResult = await res.json();
        setQueryResult(result);

        if (result.evidence_start !== undefined && result.evidence_end !== undefined) {
          setEvidenceRange({
            start: result.evidence_start,
            end: result.evidence_end
          });
          // Smoothly seek to start of evidence
          setSeekToTime(result.evidence_start);
        }
      }
    } catch (err) {
      console.error('Query execution failed:', err);
    } finally {
      setIsQuerying(false);
    }
  };

  const handleProcessVideo = async () => {
    setIsProcessing(true);
    try {
      const res = await fetch(`/api/videos/${selectedVideoId}/process`, {
        method: 'POST'
      });
      if (res.ok) {
        await loadVideoTimeline(selectedVideoId);
        await loadPresetQuestions(selectedVideoId);
        await loadVideoDetections(selectedVideoId);
        await fetchVideos();
      }
    } catch (err) {
      console.error('Video processing failed:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePlayEvidence = (startSec: number) => {
    setSeekToTime(startSec);
  };

  const currentVideo = videos.find((v) => v.id === selectedVideoId);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-800 font-sans selection:bg-blue-600 selection:text-white">
      {/* Top Header */}
      <Navbar
        videos={videos}
        selectedVideoId={selectedVideoId}
        onSelectVideo={(id) => {
          setSelectedVideoId(id);
          setQueryResult(null);
          setEvidenceRange(null);
        }}
        onOpenUpload={() => setIsUploadModalOpen(true)}
        onOpenArchitecture={() => setIsArchModalOpen(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 flex flex-col space-y-4">
        {/* If no video is uploaded yet, show clean upload prompt */}
        {videos.length === 0 ? (
          <div className="ui-card p-10 bg-white border border-slate-200 text-center flex flex-col items-center justify-center space-y-3 max-w-md mx-auto my-12 rounded-xl">
            <div className="w-12 h-12 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
              <Upload className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Upload a Video</h2>
              <p className="text-xs text-slate-500 mt-1">
                Upload an MP4 video file to extract frames, track objects, and search events.
              </p>
            </div>
            <button
              onClick={() => setIsUploadModalOpen(true)}
              className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs transition-colors flex items-center space-x-1.5"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Select Video File</span>
            </button>
          </div>
        ) : (
          <>
            {/* Active Video Info Bar */}
            <div className="ui-card p-3.5 bg-white border border-slate-200 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center flex-shrink-0">
                  <Film className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h1 className="text-sm font-semibold text-slate-900">
                      {currentVideo?.filename}
                    </h1>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-medium border ${
                        currentVideo?.status === 'processed'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}
                    >
                      {currentVideo?.status === 'processed' ? 'Processed' : 'Pending Processing'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Duration: {Math.round(currentVideo?.duration || 0)}s &bull; {timeline?.tracks.length || 0} Tracks &bull; {timeline?.events.length || 0} Events
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={handleProcessVideo}
                  disabled={isProcessing}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-medium flex items-center space-x-1.5 transition-colors"
                  title="Run tracking pipeline and compute scene geometry"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin' : ''}`} />
                  <span>{isProcessing ? 'Processing Video...' : currentVideo?.status === 'processed' ? 'Re-run Tracking' : 'Run Tracking Pipeline'}</span>
                </button>

                <button
                  onClick={() => setIsUploadModalOpen(true)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium flex items-center space-x-1.5 transition-colors"
                >
                  <Upload className="w-3.5 h-3.5 text-slate-500" />
                  <span>Upload Video</span>
                </button>
              </div>
            </div>

            {/* Video Player & Question Engine Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left: Video Player (7 Columns) */}
              <div className="lg:col-span-7 flex flex-col space-y-4">
                <VideoPlayer
                  videoId={selectedVideoId}
                  duration={currentVideo?.duration || 100}
                  evidenceRange={evidenceRange}
                  events={timeline?.events || []}
                  currentTime={currentTime}
                  onTimeUpdate={(t) => setCurrentTime(t)}
                  seekToTime={seekToTime}
                  selectedTrackId={selectedTrackId}
                  onSelectTrack={(trId) => setSelectedTrackId(trId)}
                  zones={timeline?.zones || []}
                  onZonesUpdated={(newZones) => {
                    if (timeline) {
                      setTimeline({
                        ...timeline,
                        zones: newZones
                      });
                    }
                  }}
                  detections={detections}
                />
              </div>

              {/* Right: Question Engine & Answer Card (5 Columns) */}
              <div className="lg:col-span-5 flex flex-col space-y-4">
                <QuestionInterface
                  presetQuestions={presetQuestions}
                  onAskQuestion={handleAskQuestion}
                  isLoading={isQuerying}
                />

                {/* Answer Display */}
                {queryResult && (
                  <AnswerCard
                    result={queryResult}
                    onPlayEvidence={handlePlayEvidence}
                  />
                )}
              </div>
            </div>

            {/* Full-Width Multi-Track Temporal Memory Gantt Chart */}
            <div className="w-full">
              <MultiTrackTimeline
                duration={currentVideo?.duration || 100}
                currentTime={currentTime}
                events={timeline?.events || []}
                tracks={timeline?.tracks || []}
                evidenceRange={evidenceRange}
                selectedTrackId={selectedTrackId}
                onSelectTrack={(trId) => setSelectedTrackId(trId)}
                onSeek={(t) => setSeekToTime(t)}
              />
            </div>
          </>
        )}
      </main>

      {/* Modals */}
      <ArchitectureModal
        isOpen={isArchModalOpen}
        onClose={() => setIsArchModalOpen(false)}
      />

      <UploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onVideoUploaded={(newVid) => {
          setVideos([newVid, ...videos]);
          setSelectedVideoId(newVid.id);
        }}
      />
    </div>
  );
};

export default App;
