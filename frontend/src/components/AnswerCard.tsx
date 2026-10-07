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
            className="flex items-center space-x-1 px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-white font-medium text-[11px] transition-colors"
          >
            <Play className="w-3 h-3 fill-current" />
            <span>Play Clip ({result.evidence_start.toFixed(1)}s)</span>
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
          <div className="flex flex-col space-y-1">
            {result.timeline.map((node, i) => (
              <div
                key={i}
                onClick={() => node.timestamp_sec !== undefined && onPlayEvidence(node.timestamp_sec)}
                className="px-2.5 py-1.5 rounded border border-slate-100 hover:border-slate-300 hover:bg-slate-50 text-xs text-slate-700 flex items-center justify-between cursor-pointer transition-colors"
              >
                <div className="flex items-center space-x-2 truncate">
                  <span className="font-mono text-[10px] text-slate-400 font-semibold">{node.time}</span>
                  <span className="truncate">{node.event}</span>
                </div>
                <Play className="w-3 h-3 text-slate-400 ml-2 flex-shrink-0" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AnswerCard;
