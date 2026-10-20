import React, { useState } from 'react';
import {
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  CornerDownLeft,
  Home,
  Sliders,
  Tv,
} from 'lucide-react';

export interface FireTvRemoteProps {
  onUp: () => void;
  onDown: () => void;
  onLeft: () => void;
  onRight: () => void;
  onSelect: () => void;
  onBack: () => void;
  onHome: () => void;
}

export function FireTvRemote({
  onUp,
  onDown,
  onLeft,
  onRight,
  onSelect,
  onBack,
  onHome,
}: FireTvRemoteProps) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {isOpen ? (
        <div className="bg-slate-900/95 border-2 border-purple-500/50 rounded-3xl p-5 shadow-2xl backdrop-blur-xl w-64 text-center">
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
            <div className="flex items-center gap-2 text-purple-400 font-bold text-xs uppercase tracking-wider">
              <Tv className="w-4 h-4" />
              <span>Fire TV Remote</span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-xs text-slate-500 hover:text-white"
            >
              Minimize
            </button>
          </div>

          {/* D-Pad Controller */}
          <div className="relative w-44 h-44 mx-auto mb-4 bg-slate-800/80 rounded-full border border-slate-700 flex items-center justify-center shadow-inner">
            {/* UP */}
            <button
              onClick={onUp}
              className="absolute top-2 w-12 h-10 flex items-center justify-center text-slate-300 hover:text-white hover:bg-purple-600/30 rounded-t-xl transition"
              title="Up (ArrowUp)"
            >
              <ChevronUp className="w-6 h-6" />
            </button>

            {/* DOWN */}
            <button
              onClick={onDown}
              className="absolute bottom-2 w-12 h-10 flex items-center justify-center text-slate-300 hover:text-white hover:bg-purple-600/30 rounded-b-xl transition"
              title="Down (ArrowDown)"
            >
              <ChevronDown className="w-6 h-6" />
            </button>

            {/* LEFT */}
            <button
              onClick={onLeft}
              className="absolute left-2 w-10 h-12 flex items-center justify-center text-slate-300 hover:text-white hover:bg-purple-600/30 rounded-l-xl transition"
              title="Left (ArrowLeft)"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>

            {/* RIGHT */}
            <button
              onClick={onRight}
              className="absolute right-2 w-10 h-12 flex items-center justify-center text-slate-300 hover:text-white hover:bg-purple-600/30 rounded-r-xl transition"
              title="Right (ArrowRight)"
            >
              <ChevronRight className="w-6 h-6" />
            </button>

            {/* CENTER SELECT */}
            <button
              onClick={onSelect}
              className="w-16 h-16 rounded-full bg-gradient-to-tr from-purple-700 to-indigo-600 hover:from-purple-600 hover:to-indigo-500 text-white flex items-center justify-center shadow-lg active:scale-95 transition"
              title="Select (Enter)"
            >
              <Circle className="w-6 h-6 fill-current" />
            </button>
          </div>

          {/* Navigation Action Buttons */}
          <div className="flex justify-center gap-4 mb-3">
            <button
              onClick={onBack}
              className="p-3 rounded-full bg-slate-800 hover:bg-purple-950/80 border border-slate-700 hover:border-purple-600 text-slate-300 hover:text-white transition"
              title="Back (Escape)"
            >
              <CornerDownLeft className="w-5 h-5" />
            </button>
            <button
              onClick={onHome}
              className="p-3 rounded-full bg-slate-800 hover:bg-purple-950/80 border border-slate-700 hover:border-purple-600 text-slate-300 hover:text-white transition"
              title="Home"
            >
              <Home className="w-5 h-5" />
            </button>
          </div>

          <div className="text-[10px] text-slate-400 font-mono">
            Or use physical Keyboard Arrows + Enter + Esc
          </div>
        </div>
      ) : (
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-xl transition"
        >
          <Sliders className="w-4 h-4" />
          <span>Show Fire TV Remote</span>
        </button>
      )}
    </div>
  );
}
