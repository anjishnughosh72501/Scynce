import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Tv,
  BookOpen,
  Users,
  MessageSquare,
  Sparkles,
  Send,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import {
  BoundarySnapshot,
  SessionMember,
  Recap,
  Character,
  QuestionAnswer,
  DetectedStreamingContext,
} from '@scenesync/shared-types';
import { getStoredState, ExtensionStoredState } from '../shared/storage.js';
import { sendRuntimeMessage } from '../shared/messaging.js';

type SidepanelTab = 'recap' | 'characters' | 'qa';

export function SidepanelApp() {
  const [activeTab, setActiveTab] = useState<SidepanelTab>('recap');
  const [extState, setExtState] = useState<ExtensionStoredState | null>(null);

  // Session Data
  const [session, setSession] = useState<any>(null);
  const [boundary, setBoundary] = useState<BoundarySnapshot | null>(null);
  const [members, setMembers] = useState<SessionMember[]>([]);
  const [recap, setRecap] = useState<Recap | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [qaFeed, setQaFeed] = useState<QuestionAnswer[]>([]);

  // Q&A input
  const [questionInput, setQuestionInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadSession();

    // Listen to background service worker events
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      const listener = (msg: any) => {
        if (msg.type === 'UPDATE_BOUNDARY') {
          setBoundary(msg.payload);
        } else if (msg.type === 'ANSWER_RECEIVED') {
          setQaFeed((prev) => {
            if (prev.some((a) => a.id === msg.payload.id)) return prev;
            return [msg.payload, ...prev];
          });
        } else if (msg.type === 'CONFIRM_CONTENT_CONTEXT') {
          loadSession();
        } else if (msg.type === 'DISCONNECT_FROM_SESSION') {
          setSession(null);
          setBoundary(null);
        }
      };

      chrome.runtime.onMessage.addListener(listener);
      return () => chrome.runtime.onMessage.removeListener(listener);
    }
  }, []);

  const loadSession = async () => {
    const s = await getStoredState();
    setExtState(s);

    if (s.sessionId) {
      try {
        const res = await fetch(`${s.apiBaseUrl}/api/sessions/${s.sessionId}`);
        const data = await res.json();
        if (data.success) {
          setSession(data.session);
          setBoundary(data.boundary);
          setMembers(data.members || []);

          // Fetch show details (characters)
          const showRes = await fetch(`${s.apiBaseUrl}/api/shows/${data.session.showId}`);
          const showData = await showRes.json();
          if (showData.characters) {
            setCharacters(showData.characters);
            if (showData.characters[0]) {
              setSelectedCharacterId(showData.characters[0].id);
            }
          }

          // Fetch recap
          const recapRes = await fetch(`${s.apiBaseUrl}/api/sessions/${s.sessionId}/recap`, {
            method: 'POST',
          });
          const recapData = await recapRes.json();
          if (recapData.success) {
            setRecap(recapData.recap);
          }
        }
      } catch (err) {
        console.error('Failed to load session state:', err);
      }
    }
  };

  const handleAskQuestion = async (qText: string) => {
    if (!qText.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const res = await sendRuntimeMessage({
        type: 'SUBMIT_QUESTION',
        payload: {
          question: qText.trim(),
          destination: 'all',
        },
      });

      if (res?.success && res.answer) {
        setQaFeed((prev) => [res.answer, ...prev]);
        setQuestionInput('');
        setActiveTab('qa');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeContext: DetectedStreamingContext | null =
    extState?.confirmedContext || extState?.detectedContext || null;

  return (
    <div className="w-full h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none overflow-hidden">
      {/* Top Header */}
      <header className="bg-slate-900 border-b border-slate-800 p-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white">
            <Tv className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs font-bold text-white uppercase tracking-wider leading-none">
              SceneSync
            </h2>
            <span className="text-[10px] text-purple-400 font-mono">
              {activeContext ? `${activeContext.providerId.toUpperCase()}` : 'Desktop Companion'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {session && (
            <span className="font-mono text-[10px] font-bold bg-purple-950 text-purple-300 border border-purple-800 px-2 py-0.5 rounded">
              ROOM: {session.roomCode}
            </span>
          )}
          <a
            href="http://localhost:3000"
            target="_blank"
            rel="noreferrer"
            className="p-1.5 text-slate-400 hover:text-white rounded-lg border border-slate-800 hover:border-slate-700 transition"
            title="Open Phone Controller"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </header>

      {/* Authoritative Boundary Banner */}
      <div className="p-3 bg-gradient-to-r from-purple-950/40 via-slate-900 to-slate-900 border-b border-purple-500/20">
        <div className="flex items-center gap-2 text-purple-400 text-[10px] font-bold uppercase tracking-wider">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Shared Viewing Boundary</span>
        </div>
        <h3 className="text-sm font-extrabold text-white mt-0.5 truncate">
          {boundary?.label || 'Not Connected to Room'}
        </h3>
        <p className="text-[10px] text-slate-400 mt-0.5">
          Filtered to the group's slowest viewer across desktop, TV & mobile.
        </p>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-800 bg-slate-900/60 px-2 pt-1 gap-1">
        <button
          onClick={() => setActiveTab('recap')}
          className={`flex-1 py-2 text-xs font-bold rounded-t-lg flex items-center justify-center gap-1.5 transition ${
            activeTab === 'recap'
              ? 'bg-slate-900 text-purple-400 border-t-2 border-purple-500'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>Recap</span>
        </button>

        <button
          onClick={() => setActiveTab('characters')}
          className={`flex-1 py-2 text-xs font-bold rounded-t-lg flex items-center justify-center gap-1.5 transition ${
            activeTab === 'characters'
              ? 'bg-slate-900 text-purple-400 border-t-2 border-purple-500'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Characters</span>
        </button>

        <button
          onClick={() => setActiveTab('qa')}
          className={`flex-1 py-2 text-xs font-bold rounded-t-lg flex items-center justify-center gap-1.5 transition ${
            activeTab === 'qa'
              ? 'bg-slate-900 text-purple-400 border-t-2 border-purple-500'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Q&A ({qaFeed.length})</span>
        </button>
      </div>

      {/* Main Tab Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* TAB 1: RECAP */}
        {activeTab === 'recap' && (
          <div className="space-y-3">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Story Progression
              </span>
              <p className="text-xs text-slate-200 leading-relaxed">
                {recap?.body || 'No recap generated yet. Join a party or start streaming a show.'}
              </p>
            </div>

            {recap?.keyEvents && recap.keyEvents.length > 0 && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                  Key Milestones through Boundary:
                </span>
                <div className="space-y-1.5">
                  {recap.keyEvents.map((evt, idx) => (
                    <div
                      key={idx}
                      className="p-2 rounded-lg bg-slate-800/60 border border-slate-700/60 text-xs text-slate-300"
                    >
                      {evt}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Suggested Discussion Prompts */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
              <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1 mb-2">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Ask SceneSync AI</span>
              </span>
              <div className="space-y-1.5">
                {[
                  "What does Elena's pendant do?",
                  'Who is Lord Brandon Starkwell?',
                  'What happened in the latest safe episode?',
                ].map((q, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleAskQuestion(q)}
                    className="w-full text-left p-2 rounded-lg bg-purple-950/40 hover:bg-purple-900/60 border border-purple-800/40 text-purple-200 text-xs transition"
                  >
                    "{q}"
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: CHARACTERS */}
        {activeTab === 'characters' && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {characters.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCharacterId(c.id)}
                  className={`p-2 rounded-xl border flex flex-col items-center text-center transition ${
                    selectedCharacterId === c.id
                      ? 'bg-purple-950/80 border-purple-500 shadow-md'
                      : 'bg-slate-900 border-slate-800 text-slate-400'
                  }`}
                >
                  <img
                    src={c.imageUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100'}
                    alt={c.name}
                    className="w-10 h-10 rounded-full object-cover mb-1 border border-purple-400/40"
                  />
                  <span className="text-[11px] font-bold truncate w-full text-slate-200">
                    {c.name.split(' ')[0]}
                  </span>
                </button>
              ))}
            </div>

            {selectedCharacterId && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
                <div className="flex items-center justify-between mb-1">
                  <h4 className="text-sm font-bold text-white">
                    {characters.find((c) => c.id === selectedCharacterId)?.name}
                  </h4>
                  <span className="text-[10px] text-emerald-400 font-bold uppercase">
                    Safe Bio
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed mt-1">
                  Verified character information restricted to the group's shared progress. Future
                  twists and unrevealed relationships are hidden.
                </p>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: Q&A FEED */}
        {activeTab === 'qa' && (
          <div className="space-y-2.5">
            {qaFeed.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-xs">
                No questions asked yet. Ask a question below or tap a suggested prompt!
              </div>
            ) : (
              qaFeed.map((ans) => {
                const isVerified = ans.answerStatus === 'verified';
                const isRefused = ans.answerStatus === 'refused_spoiler';

                return (
                  <div
                    key={ans.id}
                    className="bg-slate-900 border border-slate-800 rounded-xl p-3 shadow-md"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1">
                        {isVerified ? (
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        ) : isRefused ? (
                          <AlertTriangle className="w-3 h-3 text-amber-400" />
                        ) : (
                          <Clock className="w-3 h-3 text-slate-400" />
                        )}
                        <span>{ans.answerStatus.replace('_', ' ')}</span>
                      </span>
                      <span className="text-[9px] font-mono text-slate-500">
                        {ans.boundarySnapshot?.label?.substring(0, 16)}
                      </span>
                    </div>

                    <p className="text-xs font-semibold text-purple-200 mb-1">Q: {ans.question}</p>
                    <p className="text-xs text-slate-300 leading-relaxed">{ans.answerBody}</p>

                    {ans.evidenceIds.length > 0 && (
                      <div className="mt-2 pt-1.5 border-t border-slate-800/80 flex flex-wrap gap-1">
                        {ans.evidenceIds.map((id) => (
                          <span
                            key={id}
                            className="text-[9px] font-mono bg-purple-950 text-purple-300 px-1 py-0.5 rounded border border-purple-800/50"
                          >
                            {id}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Bottom Sticky Question Input Bar */}
      <div className="p-3 bg-slate-900 border-t border-slate-800">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAskQuestion(questionInput);
          }}
          className="flex gap-1.5"
        >
          <input
            type="text"
            value={questionInput}
            onChange={(e) => setQuestionInput(e.target.value)}
            placeholder="Ask safe question..."
            className="flex-1 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
          />
          <button
            type="submit"
            disabled={isSubmitting || !questionInput.trim()}
            className="p-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white shadow-md disabled:opacity-40 transition"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
