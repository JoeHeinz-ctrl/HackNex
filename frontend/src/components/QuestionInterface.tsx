import React, { useState } from 'react';
import { Search, ArrowRight } from 'lucide-react';
import type { PresetQuestion } from '../types';

interface QuestionInterfaceProps {
  presetQuestions: PresetQuestion[];
  onAskQuestion: (q: string) => void;
  isLoading: boolean;
}

export const QuestionInterface: React.FC<QuestionInterfaceProps> = ({
  presetQuestions,
  onAskQuestion,
  isLoading
}) => {
  const [inputValue, setInputValue] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      onAskQuestion(inputValue.trim());
    }
  };

  const handleSelectPreset = (text: string) => {
    setInputValue(text);
    onAskQuestion(text);
  };

  return (
    <div className="ui-card p-4 bg-white border border-slate-200 rounded-xl flex flex-col space-y-3.5">
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
          Event Search & Questions
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Search for actions, arrivals, departures, or sequence of events
        </p>
      </div>

      {/* Clean Search Input */}
      <form onSubmit={handleSubmit} className="relative flex items-center">
        <Search className="w-4 h-4 absolute left-3 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Ask or search (e.g. What happened after the truck arrived?)"
          className="w-full pl-9 pr-24 py-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-400 focus:bg-white transition-colors"
        />
        <button
          type="submit"
          disabled={isLoading || !inputValue.trim()}
          className="absolute right-1 px-3 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-xs font-medium text-white transition-colors flex items-center space-x-1"
        >
          {isLoading ? (
            <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <span>Search</span>
          )}
        </button>
      </form>

      {/* Suggested Questions List */}
      {presetQuestions.length > 0 && (
        <div className="flex flex-col space-y-1.5 pt-1 border-t border-slate-100">
          <span className="text-[11px] font-medium text-slate-500">
            Suggested queries for this video:
          </span>
          <div className="flex flex-col space-y-1 max-h-48 overflow-y-auto pr-1">
            {presetQuestions.map((q) => (
              <button
                key={q.id}
                onClick={() => handleSelectPreset(q.text)}
                className="text-left px-2.5 py-1.5 rounded-md hover:bg-slate-50 border border-slate-100 hover:border-slate-200 text-xs text-slate-700 transition-colors flex items-center justify-between group"
              >
                <span className="truncate">{q.text}</span>
                <ArrowRight className="w-3 h-3 text-slate-300 group-hover:text-slate-600 flex-shrink-0 ml-1" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default QuestionInterface;
