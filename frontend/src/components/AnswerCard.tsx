import React from 'react';
import type { QueryResult } from '../types';
import { Play } from 'lucide-react';

interface AnswerCardProps {
  result: QueryResult | null;
  onPlayEvidence: (start: number) => void;
}

export const AnswerCard: React.FC<AnswerCardProps> = ({ result, onPlayEvidence }) => {
  if (!result) return null;

  return (
    <div className="ui-card p-4 bg-white border border-slate-200 rounded-xl flex flex-col space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-100 text-xs">
        <span className="font-semibold text-slate-800">
          Search Result
        </span>
        {result.evidence_start !== undefined && (
          <button
            onClick={() => onPlayEvidence(result.evidence_start!)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 active:scale-95 text-white font-medium text-xs transition-all shadow-xs"
            title="Play evidence clip"
          >
            <Play className="w-3 h-3 fill-current" />
            <span>{result.evidence_label || 'Play Clip'}</span>
          </button>
        )}
      </div>

      {/* Answer Body */}
      <div className="text-xs text-slate-800 leading-relaxed font-normal bg-slate-50 p-3 rounded-lg border border-slate-100">
        {result.answer}
      </div>

      {/* Structured Events Breakdown */}
      {result.timeline && result.timeline.length > 0 && (
        <div className="flex flex-col space-y-1.5 pt-1">
          <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
            Detected Event Sequence:
          </span>
          <div className="flex flex-col space-y-1.5">
            {result.timeline.map((node, i) => (
              <div
                key={i}
                onClick={() => {
                  const targetTime = node.timestamp_sec !== undefined ? node.timestamp_sec : (result.evidence_start || 0);
                  onPlayEvidence(targetTime);
                }}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 active:scale-[0.99] text-xs text-slate-800 flex items-center justify-between cursor-pointer transition-all group"
                title={`Play from timestamp ${node.time}`}
              >
                <div className="flex items-center space-x-2 truncate">
                  <span className="font-mono text-[10px] text-blue-700 font-semibold bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 flex-shrink-0">
                    {node.time}
                  </span>
                  <span className="truncate font-medium text-slate-700 group-hover:text-slate-900 transition-colors">
                    {node.event}
                  </span>
                </div>
                <div className="flex items-center space-x-1 text-slate-400 group-hover:text-slate-900 text-[11px] font-medium ml-2 flex-shrink-0 transition-colors">
                  <Play className="w-3 h-3 fill-current" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AnswerCard;
