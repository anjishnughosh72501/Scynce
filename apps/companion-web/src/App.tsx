import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  Session,
  SessionMember,
  BoundarySnapshot,
  Episode,
  QuestionAnswer,
  Show,
  ExtensionDeviceState,
  ResponseDestination,
  ExtensionCommandType,
} from '@scenesync/shared-types';
import {
  ShieldCheck,
  ShieldAlert,
  Users,
  Tv,
  Send,
  LogOut,
  Sparkles,
  HelpCircle,
  CheckCircle2,
  Clock,
  Monitor,
  Laptop,
  Sliders,
  SendHorizontal,
  ChevronDown,
} from 'lucide-react';

export function App() {
  // Session State
  const [session, setSession] = useState<Session | null>(null);
  const [myMember, setMyMember] = useState<SessionMember | null>(null);
  const [members, setMembers] = useState<SessionMember[]>([]);
  const [boundary, setBoundary] = useState<BoundarySnapshot | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [show, setShow] = useState<Show | null>(null);

  // Extension Controllers
  const [extensions, setExtensions] = useState<ExtensionDeviceState[]>([]);
  const [responseDestination, setResponseDestination] = useState<ResponseDestination>('all');
  const [isEditingContext, setIsEditingContext] = useState(false);
  const [overrideShowTitle, setOverrideShowTitle] = useState('Chronicles of Aethelgard');
  const [overrideSeason, setOverrideSeason] = useState(1);
  const [overrideEpisode, setOverrideEpisode] = useState(6);

  // Q&A State
  const [questionInput, setQuestionInput] = useState('');
  const [answers, setAnswers] = useState<QuestionAnswer[]>([]);
  const [isSubmittingQuestion, setIsSubmittingQuestion] = useState(false);

  // Join Form State
  const [displayName, setDisplayName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [invitationToken, setInvitationToken] = useState<string | null>(null);
  const [initialEpisodeId, setInitialEpisodeId] = useState<string>('');
  const [isJoining, setIsJoining] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);

  // Parse URL query parameters on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const code = params.get('code');
    if (token) {
      setInvitationToken(token);
    }
    if (code) {
      setRoomCode(code.toUpperCase());
    }

    // Pre-load default show catalog to populate episode selector
    fetch('/api/shows')
      .then((r) => r.json())
      .then((data) => {
        if (data.shows && data.shows[0]) {
          setShow(data.shows[0]);
          return fetch(`/api/shows/${data.shows[0].id}`);
        }
      })
      .then((r) => r?.json())
      .then((data) => {
        if (data?.episodes) {
          setEpisodes(data.episodes);
        }
      })
      .catch((err) => console.error('Failed to pre-fetch catalog:', err));
  }, []);

  // Initialize Socket.io when session is active
  useEffect(() => {
    if (!session) return;

    const socket = io('/', { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join-session', session.id);
    });

    socket.on('member.joined', (payload: any) => {
      setMembers((prev) => {
        if (prev.some((m) => m.id === payload.member.id)) return prev;
        return [...prev, payload.member];
      });
    });

    socket.on('member.progress_updated', (payload: any) => {
      setMembers((prev) =>
        prev.map((m) =>
          m.id === payload.memberId
            ? { ...m, lastWatchedEpisodeId: payload.lastWatchedEpisodeId }
            : m
        )
      );
    });

    socket.on('session.boundary_updated', (payload: any) => {
      setBoundary(payload.boundary);
    });

    socket.on('answer.ready', (payload: any) => {
      setAnswers((prev) => {
        if (prev.some((a) => a.id === payload.questionAnswer.id)) return prev;
        return [payload.questionAnswer, ...prev];
      });
    });

    socket.on('extension.connected', (payload: any) => {
      setExtensions((prev) => {
        const filtered = prev.filter((e) => e.installationId !== payload.extension.installationId);
        return [payload.extension, ...filtered];
      });
    });

    socket.on('extension.disconnected', (payload: any) => {
      setExtensions((prev) => prev.filter((e) => e.installationId !== payload.installationId));
    });

    socket.on('extension.context.detected', (payload: any) => {
      setExtensions((prev) =>
        prev.map((e) =>
          e.installationId === payload.installationId
            ? { ...e, detectedContext: payload.context }
            : e
        )
      );
    });

    socket.on('extension.context.confirmed', (payload: any) => {
      setExtensions((prev) =>
        prev.map((e) =>
          e.installationId === payload.installationId
            ? { ...e, confirmedContext: payload.context }
            : e
        )
      );
    });

    socket.on('session.ended', () => {
      alert('The watch party has ended.');
      setSession(null);
    });

    // Fetch initially linked extensions
    fetch(`/api/sessions/${session.id}/extensions`)
      .then((r) => r.json())
      .then((data) => {
        if (data.extensions) setExtensions(data.extensions);
      })
      .catch(() => {});

    return () => {
      socket.disconnect();
    };
  }, [session?.id]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      setErrorMsg('Please enter your name');
      return;
    }
    setErrorMsg(null);
    setIsJoining(true);

    try {
      const res = await fetch('/api/sessions/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invitationToken: invitationToken || undefined,
          roomCode: !invitationToken ? roomCode.trim().toUpperCase() : undefined,
          displayName: displayName.trim(),
          initialEpisodeId: initialEpisodeId || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to join session');
      }

      setSession(data.session);
      setMyMember(data.member);
      setBoundary(data.boundary);

      // Fetch full session details
      const stateRes = await fetch(`/api/sessions/${data.session.id}`);
      const stateData = await stateRes.json();
      if (stateData.success) {
        setMembers(stateData.members);
        setEpisodes(stateData.episodes);
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsJoining(false);
    }
  };

  const handleProgressChange = async (episodeId: string | null) => {
    if (!session || !myMember) return;

    try {
      const res = await fetch(`/api/sessions/${session.id}/progress`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-member-id': myMember.id,
        },
        body: JSON.stringify({
          lastWatchedEpisodeId: episodeId,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setBoundary(data.boundary);
        setMyMember((prev) => (prev ? { ...prev, lastWatchedEpisodeId: episodeId } : null));
      }
    } catch (err) {
      console.error('Failed to update progress:', err);
    }
  };

  const handleAskQuestion = async (text: string) => {
    if (!session || !myMember || !text.trim() || isSubmittingQuestion) return;

    setIsSubmittingQuestion(true);
    try {
      const res = await fetch(`/api/sessions/${session.id}/questions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-member-id': myMember.id,
        },
        body: JSON.stringify({
          question: text.trim(),
          destination: responseDestination,
          sourceClient: 'phone',
        }),
      });

      const data = await res.json();
      if (data.success && data.answer) {
        setAnswers((prev) => {
          if (prev.some((a) => a.id === data.answer.id)) return prev;
          return [data.answer, ...prev];
        });
        setQuestionInput('');
      }
    } catch (err) {
      console.error('Failed to submit question:', err);
    } finally {
      setIsSubmittingQuestion(false);
    }
  };

  const handleSendExtensionCommand = async (type: ExtensionCommandType, payload: any = {}) => {
    if (!session || !myMember) return;

    try {
      await fetch(`/api/sessions/${session.id}/extensions/command`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-member-id': myMember.id,
        },
        body: JSON.stringify({
          type,
          payload,
        }),
      });
    } catch (err) {
      console.error('Command dispatch failed:', err);
    }
  };

  const handleConfirmRemoteContext = async () => {
    await handleSendExtensionCommand('SET_CONTENT_CONTEXT', {
      context: {
        providerId: extensions[0]?.providerId || 'fallback',
        showTitle: overrideShowTitle,
        seasonNumber: overrideSeason,
        episodeNumber: overrideEpisode,
        detectionMethod: 'manual_confirmed',
        confidence: 1.0,
        lastDetectedAt: new Date().toISOString(),
      },
    });
    setIsEditingContext(false);
  };

  const handleLeaveSession = async () => {
    if (!session || !myMember) return;
    try {
      await fetch(`/api/sessions/${session.id}/leave`, {
        method: 'POST',
        headers: {
          'x-member-id': myMember.id,
        },
      });
    } finally {
      setSession(null);
      setMyMember(null);
      setAnswers([]);
    }
  };

  // ==========================================
  // RENDER: Join Screen
  // ==========================================
  if (!session) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col justify-center px-4 py-8 max-w-md mx-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-500 shadow-lg shadow-purple-500/20 mb-4">
            <Tv className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">SceneSync</h1>
          <p className="text-sm text-purple-300 font-medium mt-1">
            Watch together. Never spoil the moment.
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
          <div className="flex items-center gap-2 mb-6 text-purple-400 text-sm font-semibold">
            <ShieldCheck className="w-5 h-5" />
            <span>Join Watch Party Room</span>
          </div>

          {errorMsg && (
            <div className="mb-4 p-3 rounded-xl bg-red-950/60 border border-red-800 text-red-300 text-sm flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleJoin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                Your Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Alex"
                className="w-full px-4 py-3 rounded-xl bg-slate-800/80 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition"
                required
              />
            </div>

            {!invitationToken && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Room Code (from TV or Desktop)
                </label>
                <input
                  type="text"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  placeholder="e.g. ABC123"
                  maxLength={6}
                  className="w-full px-4 py-3 rounded-xl bg-slate-800/80 border border-slate-700 text-white placeholder-slate-500 font-mono tracking-widest text-center uppercase focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition"
                  required
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                Last Episode You Watched
              </label>
              <select
                value={initialEpisodeId}
                onChange={(e) => setInitialEpisodeId(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-slate-800/80 border border-slate-700 text-white focus:outline-none focus:border-purple-500 transition"
              >
                <option value="">I haven't started watching yet</option>
                {episodes.map((ep) => (
                  <option key={ep.id} value={ep.id}>
                    S{ep.seasonNumber} E{ep.episodeNumber}: {ep.title}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500 mt-1">
                SceneSync restricts party recaps to the least-progressed person.
              </p>
            </div>

            <button
              type="submit"
              disabled={isJoining}
              className="w-full mt-2 py-3.5 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold shadow-lg shadow-purple-600/30 hover:opacity-95 active:scale-[0.99] transition disabled:opacity-50"
            >
              {isJoining ? 'Joining Watch Party...' : 'Join Party'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ==========================================
  // RENDER: Active Watch Party Screen
  // ==========================================
  const myEpisode = episodes.find((e) => e.id === myMember?.lastWatchedEpisodeId);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col pb-12 max-w-lg mx-auto">
      {/* Top Header */}
      <header className="sticky top-0 z-20 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center text-white">
            <Tv className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white leading-tight">
              {show?.title || 'SceneSync Party'}
            </h2>
            <span className="text-xs font-mono text-purple-400 bg-purple-950/60 px-1.5 py-0.5 rounded border border-purple-800">
              ROOM: {session.roomCode}
            </span>
          </div>
        </div>

        <button
          onClick={handleLeaveSession}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-400 px-3 py-1.5 rounded-lg border border-slate-800 hover:border-red-900 transition"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Leave</span>
        </button>
      </header>

      {/* Authoritative Boundary Banner */}
      <div className="p-4">
        <div className="bg-gradient-to-br from-indigo-950/70 via-slate-900 to-purple-950/60 border border-purple-500/30 rounded-2xl p-4 shadow-xl relative overflow-hidden">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-purple-600/20 border border-purple-500/40 text-purple-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <div className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                <span>Enforced Spoiler Boundary</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              </div>
              <h3 className="text-lg font-extrabold text-white mt-0.5">
                {boundary?.label || 'Calculating Boundary...'}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Synchronized across your phone, Fire TV, and Chrome extensions.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Extension Remote Controller Section */}
      <div className="px-4 mb-4">
        <div className="bg-slate-900/90 border border-purple-500/30 rounded-2xl p-4 shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Laptop className="w-4 h-4 text-purple-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Connected Desktop Extension
              </span>
            </div>
            <span
              className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                extensions.length > 0
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {extensions.length > 0 ? `${extensions.length} Linked` : 'Waiting for Extension'}
            </span>
          </div>

          {extensions.length > 0 ? (
            <div className="space-y-2.5">
              {extensions.map((ext) => {
                const ctx = ext.confirmedContext || ext.detectedContext;
                return (
                  <div
                    key={ext.installationId}
                    className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 text-xs"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-semibold text-purple-300 uppercase">
                        {ext.providerId || 'Browser Stream'}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        ID: {ext.installationId.substring(0, 8)}
                      </span>
                    </div>

                    {!isEditingContext ? (
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-bold text-white text-sm">
                            {ctx?.showTitle || 'Waiting for stream detection...'}
                          </div>
                          <div className="text-slate-400 text-xs mt-0.5">
                            {ctx?.seasonNumber
                              ? `Season ${ctx.seasonNumber} • Episode ${ctx.episodeNumber}`
                              : 'No episode detected yet'}
                          </div>
                        </div>
                        <button
                          onClick={() => setIsEditingContext(true)}
                          className="px-2.5 py-1 bg-purple-950/80 hover:bg-purple-900/80 text-purple-300 border border-purple-800 rounded-lg text-xs font-semibold flex items-center gap-1"
                        >
                          <Sliders className="w-3 h-3" />
                          <span>Override</span>
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2 mt-2 pt-2 border-t border-slate-700">
                        <input
                          type="text"
                          value={overrideShowTitle}
                          onChange={(e) => setOverrideShowTitle(e.target.value)}
                          placeholder="Show Title"
                          className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs"
                        />
                        <div className="flex gap-2">
                          <input
                            type="number"
                            value={overrideSeason}
                            onChange={(e) => setOverrideSeason(parseInt(e.target.value, 10))}
                            placeholder="Season"
                            className="w-1/2 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs"
                          />
                          <input
                            type="number"
                            value={overrideEpisode}
                            onChange={(e) => setOverrideEpisode(parseInt(e.target.value, 10))}
                            placeholder="Episode"
                            className="w-1/2 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs"
                          />
                        </div>
                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={handleConfirmRemoteContext}
                            className="flex-1 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-semibold text-xs"
                          >
                            Send to Extension
                          </button>
                          <button
                            onClick={() => setIsEditingContext(false)}
                            className="px-2.5 py-1 bg-slate-700 text-slate-300 rounded-lg text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Remote Controls */}
                    <div className="mt-2.5 pt-2 border-t border-slate-700/60 flex gap-2">
                      <button
                        onClick={() =>
                          handleSendExtensionCommand('SET_ACTIVE_SESSION', {
                            sessionId: session.id,
                          })
                        }
                        className="flex-1 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[10px] font-semibold"
                      >
                        Resync Session
                      </button>
                      <button
                        onClick={() =>
                          handleSendExtensionCommand('DISCONNECT_EXTENSION')
                        }
                        className="px-2 py-1 bg-red-950/40 hover:bg-red-900/40 text-red-300 border border-red-800/40 rounded-lg text-[10px] font-semibold"
                      >
                        Disconnect
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-slate-400">
              Open Netflix, Prime Video, or JioHotstar on your desktop with the SceneSync Chrome
              extension installed, then enter room code{' '}
              <span className="font-mono text-purple-300 font-bold">{session.roomCode}</span>.
            </p>
          )}
        </div>
      </div>

      {/* Progress Selector */}
      <div className="px-4 mb-4">
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              My Viewing Progress
            </span>
            <span className="text-xs text-purple-400 font-medium">
              {myEpisode
                ? `Watched S${myEpisode.seasonNumber} E${myEpisode.episodeNumber}`
                : 'Not Started'}
            </span>
          </div>

          <select
            value={myMember?.lastWatchedEpisodeId || ''}
            onChange={(e) => handleProgressChange(e.target.value || null)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-sm text-white focus:outline-none focus:border-purple-500"
          >
            <option value="">I haven't started watching yet</option>
            {episodes.map((ep) => (
              <option key={ep.id} value={ep.id}>
                S{ep.seasonNumber} E{ep.episodeNumber}: {ep.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Watch Party Participants */}
      <div className="px-4 mb-4">
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">
            <Users className="w-4 h-4 text-purple-400" />
            <span>Watch Party Members ({members.length})</span>
          </div>

          <div className="space-y-2">
            {members.map((m) => {
              const ep = episodes.find((e) => e.id === m.lastWatchedEpisodeId);
              return (
                <div
                  key={m.id}
                  className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-800/50 border border-slate-800/80 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                    <span className="font-medium text-slate-200">
                      {m.displayName} {m.id === myMember?.id && '(You)'}
                    </span>
                    {m.role === 'host' && (
                      <span className="text-[10px] font-bold uppercase bg-amber-950/80 text-amber-300 border border-amber-800 px-1.5 py-0.5 rounded">
                        Host
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-slate-400">
                    {ep ? `S${ep.seasonNumber} E${ep.episodeNumber}` : 'Not Started'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Ask Question & Routing Destination Section */}
      <div className="px-4 mb-4">
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <span>Ask SceneSync AI</span>
            </div>

            {/* Response Destination Selector */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase font-bold text-slate-500">Route to:</span>
              <select
                value={responseDestination}
                onChange={(e) => setResponseDestination(e.target.value as ResponseDestination)}
                className="bg-slate-800 border border-slate-700 text-[11px] text-purple-300 font-semibold px-2 py-1 rounded-lg focus:outline-none"
              >
                <option value="all">All Surfaces</option>
                <option value="sidepanel">Extension Sidepanel Only</option>
                <option value="tv">Fire TV Display Only</option>
                <option value="phone">Phone Only</option>
              </select>
            </div>
          </div>

          {/* Suggested Quick Questions */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {[
              "What does Elena's pendant do?",
              'Who is Lord Brandon Starkwell?',
              'What occurred in the latest safe episode?',
            ].map((q, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleAskQuestion(q)}
                className="text-xs bg-purple-950/40 hover:bg-purple-900/60 text-purple-300 border border-purple-800/50 px-2.5 py-1.5 rounded-lg transition text-left"
              >
                {q}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAskQuestion(questionInput);
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={questionInput}
              onChange={(e) => setQuestionInput(e.target.value)}
              placeholder="Ask anything about safe episodes..."
              className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
            />
            <button
              type="submit"
              disabled={isSubmittingQuestion || !questionInput.trim()}
              className="p-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white shadow-md disabled:opacity-40 transition"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
        </div>
      </div>

      {/* Answers Feed */}
      <div className="px-4 space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Q&A Feed ({answers.length})
        </h4>

        {answers.length === 0 ? (
          <div className="text-center py-8 px-4 rounded-2xl bg-slate-900/40 border border-slate-800/60 text-slate-500 text-sm">
            <HelpCircle className="w-8 h-8 mx-auto mb-2 text-slate-600" />
            No questions asked yet. Ask a question or tap a suggested prompt above!
          </div>
        ) : (
          answers.map((ans) => {
            const isVerified = ans.answerStatus === 'verified';
            const isRefused = ans.answerStatus === 'refused_spoiler';

            return (
              <div
                key={ans.id}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    {isVerified ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : isRefused ? (
                      <ShieldAlert className="w-4 h-4 text-amber-400" />
                    ) : (
                      <Clock className="w-4 h-4 text-slate-400" />
                    )}
                    <span
                      className={`text-xs font-bold uppercase tracking-wider ${
                        isVerified
                          ? 'text-emerald-400'
                          : isRefused
                          ? 'text-amber-400'
                          : 'text-slate-400'
                      }`}
                    >
                      {ans.answerStatus.replace('_', ' ')}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {ans.boundarySnapshot?.label}
                  </span>
                </div>

                <p className="text-xs font-semibold text-purple-300 mb-1.5">Q: {ans.question}</p>
                <p className="text-sm text-slate-200 leading-relaxed">{ans.answerBody}</p>

                {ans.evidenceIds.length > 0 && (
                  <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex flex-wrap gap-1">
                    <span className="text-[10px] text-slate-500 uppercase font-bold mr-1">
                      Evidence Cited:
                    </span>
                    {ans.evidenceIds.map((eid) => (
                      <span
                        key={eid}
                        className="text-[10px] font-mono bg-purple-950/60 text-purple-300 border border-purple-800/50 px-1.5 py-0.5 rounded"
                      >
                        {eid}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
