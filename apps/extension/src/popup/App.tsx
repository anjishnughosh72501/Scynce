import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Tv,
  ExternalLink,
  ChevronRight,
  RefreshCw,
  LogOut,
  Sliders,
  CheckCircle2,
} from 'lucide-react';
import { sendRuntimeMessage } from '../shared/messaging.js';
import { ExtensionStoredState, getStoredState } from '../shared/storage.js';

export function PopupApp() {
  const [state, setState] = useState<ExtensionStoredState | null>(null);
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Manual fallback inputs
  const [isManualMode, setIsManualMode] = useState(false);
  const [manualShowTitle, setManualShowTitle] = useState('Chronicles of Aethelgard');
  const [manualSeason, setManualSeason] = useState(1);
  const [manualEpisode, setManualEpisode] = useState(6);

  useEffect(() => {
    loadState();
  }, []);

  const loadState = async () => {
    const s = await getStoredState();
    setState(s);
  };

  const handleConnectSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomCodeInput.trim()) return;

    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await sendRuntimeMessage({
        type: 'CONNECT_TO_SESSION',
        payload: { roomCode: roomCodeInput.trim().toUpperCase() },
      });
      if (res?.success) {
        await loadState();
        setRoomCodeInput('');
      } else {
        setErrorMsg(res?.error || 'Failed to connect to watch party room');
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = async () => {
    await sendRuntimeMessage({ type: 'DISCONNECT_FROM_SESSION' });
    await loadState();
  };

  const handleConfirmManualContext = async () => {
    await sendRuntimeMessage({
      type: 'CONFIRM_CONTENT_CONTEXT',
      payload: {
        providerId: state?.detectedContext?.providerId || 'fallback',
        showTitle: manualShowTitle,
        seasonNumber: manualSeason,
        episodeNumber: manualEpisode,
        detectionMethod: 'manual_confirmed',
        confidence: 1.0,
        lastDetectedAt: new Date().toISOString(),
      },
    });
    setIsManualMode(false);
    await loadState();
  };

  const handleOpenSidePanel = () => {
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.sidePanel) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.sidePanel.open({ tabId: tabs[0].id }).catch(() => {});
        }
      });
    }
  };

  const activeContext = state?.confirmedContext || state?.detectedContext;
  const isConnected = !!state?.sessionId;

  return (
    <div className="w-80 min-h-[460px] bg-slate-950 text-slate-100 flex flex-col justify-between p-4 font-sans select-none border border-slate-800">
      {/* Top Header */}
      <div>
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-md">
              <Tv className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white leading-tight">SceneSync</h1>
              <span className="text-[10px] text-purple-400 font-semibold uppercase tracking-wider">
                Desktop Companion
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
              }`}
            />
            <span className="text-[11px] font-medium text-slate-400">
              {isConnected ? 'In Party' : 'Standby'}
            </span>
          </div>
        </div>

        {errorMsg && (
          <div className="mb-3 p-2.5 rounded-xl bg-red-950/70 border border-red-800 text-red-300 text-xs">
            {errorMsg}
          </div>
        )}

        {/* Streaming Context Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 mb-3 shadow-lg">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
              Detected Stream
            </span>
            <span className="text-[10px] font-mono uppercase bg-purple-950 text-purple-300 px-1.5 py-0.5 rounded border border-purple-800/60">
              {activeContext?.providerId || 'Detecting...'}
            </span>
          </div>

          {!isManualMode ? (
            <div>
              <h3 className="text-sm font-bold text-white truncate">
                {activeContext?.showTitle || 'Waiting for stream to play...'}
              </h3>
              <div className="flex items-center justify-between mt-1 text-xs text-slate-400">
                <span>
                  {activeContext?.seasonNumber
                    ? `Season ${activeContext.seasonNumber} • Episode ${activeContext.episodeNumber}`
                    : 'Episode not yet detected'}
                </span>
                <button
                  onClick={() => setIsManualMode(true)}
                  className="text-purple-400 hover:text-purple-300 text-[10px] font-semibold flex items-center gap-0.5"
                >
                  <Sliders className="w-3 h-3" />
                  <span>Edit</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2 mt-2">
              <input
                type="text"
                value={manualShowTitle}
                onChange={(e) => setManualShowTitle(e.target.value)}
                placeholder="Show Title"
                className="w-full px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white"
              />
              <div className="flex gap-2">
                <input
                  type="number"
                  value={manualSeason}
                  onChange={(e) => setManualSeason(parseInt(e.target.value, 10))}
                  placeholder="Season"
                  className="w-1/2 px-2 py-1 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white"
                />
                <input
                  type="number"
                  value={manualEpisode}
                  onChange={(e) => setManualEpisode(parseInt(e.target.value, 10))}
                  placeholder="Episode"
                  className="w-1/2 px-2 py-1 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleConfirmManualContext}
                  className="flex-1 py-1 bg-purple-600 hover:bg-purple-500 rounded-lg text-white text-xs font-semibold"
                >
                  Confirm Match
                </button>
                <button
                  onClick={() => setIsManualMode(false)}
                  className="px-2 py-1 bg-slate-800 text-slate-400 rounded-lg text-xs"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Watch Party Connection */}
        {!isConnected ? (
          <form onSubmit={handleConnectSession} className="space-y-2.5 mb-3">
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">
                Join Watch Party Room
              </label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={roomCodeInput}
                  onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
                  placeholder="Room Code (from TV or Phone)"
                  maxLength={6}
                  className="flex-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 font-mono text-center text-sm font-bold tracking-widest text-white uppercase focus:outline-none focus:border-purple-500"
                />
                <button
                  type="submit"
                  disabled={isLoading || !roomCodeInput.trim()}
                  className="px-3.5 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-md transition"
                >
                  Join
                </button>
              </div>
            </div>
          </form>
        ) : (
          <div className="bg-purple-950/40 border border-purple-500/30 rounded-xl p-3 mb-3 flex items-center justify-between">
            <div>
              <div className="text-[10px] font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Protected Room Active</span>
              </div>
              <span className="font-mono text-xs font-bold text-slate-200">
                SESSION: {state?.sessionId?.substring(0, 10)}...
              </span>
            </div>
            <button
              onClick={handleDisconnect}
              className="text-xs text-slate-400 hover:text-red-400 p-1.5 rounded-lg border border-slate-800 hover:border-red-900 transition"
              title="Leave Room"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Action Button: Open Side Panel */}
        <button
          onClick={handleOpenSidePanel}
          className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-purple-600/30 hover:opacity-95 transition"
        >
          <span>Open Side Panel</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Footer Companion Link */}
      <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
        <a
          href="http://localhost:3000"
          target="_blank"
          rel="noreferrer"
          className="hover:text-purple-300 flex items-center gap-1 transition"
        >
          <ExternalLink className="w-3 h-3" />
          <span>Open Phone Controller</span>
        </a>
        <button
          onClick={loadState}
          className="hover:text-white p-1 rounded transition"
          title="Refresh State"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
