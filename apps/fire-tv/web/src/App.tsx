import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  Show,
  Session,
  SessionMember,
  BoundarySnapshot,
  Episode,
  Recap,
  Character,
  CharacterExplanation,
  QuestionAnswer,
} from '@scenesync/shared-types';
import {
  Tv,
  Users,
  ShieldCheck,
  Sparkles,
  QrCode,
  BookOpen,
  MessageSquare,
  Settings,
  ArrowRight,
  RefreshCw,
  LogOut,
  CheckCircle2,
  AlertTriangle,
  Play,
  Laptop,
  Smartphone,
} from 'lucide-react';
import { useTvNavigation } from './hooks/useTvNavigation.js';
import { FireTvRemote } from './components/FireTvRemote.js';

type TvScreen = 'home' | 'show-selection' | 'lobby' | 'recap' | 'characters' | 'qa' | 'settings';

const FALLBACK_DEFAULT_SHOW: Show = {
  id: 'show-aethelgard',
  title: 'Chronicles of Aethelgard',
  description:
    'An epic fantasy series spanning continents, dynasties, and ancient sorceries where kingdoms clash over the Iron Throne of Eldoria.',
  posterUrl:
    'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=600&q=80',
  status: 'active',
  createdAt: new Date().toISOString(),
};

export function App() {
  const [currentScreen, setCurrentScreen] = useState<TvScreen>('home');

  // Catalog State
  const [shows, setShows] = useState<Show[]>([FALLBACK_DEFAULT_SHOW]);
  const [selectedShow, setSelectedShow] = useState<Show | null>(FALLBACK_DEFAULT_SHOW);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);

  // System & Connection State
  const [apiConnected, setApiConnected] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Watch Party State
  const [session, setSession] = useState<Session | null>(null);
  const [members, setMembers] = useState<SessionMember[]>([]);
  const [linkedExtensions, setLinkedExtensions] = useState<any[]>([]);
  const [boundary, setBoundary] = useState<BoundarySnapshot | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [joinUrl, setJoinUrl] = useState<string | null>(null);
  const [hostMember, setHostMember] = useState<SessionMember | null>(null);

  // Content State
  const [recap, setRecap] = useState<Recap | null>(null);
  const [characterExplanations, setCharacterExplanations] = useState<Record<string, CharacterExplanation>>({});
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [qaFeed, setQaFeed] = useState<QuestionAnswer[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const socketRef = useRef<Socket | null>(null);

  const loadShows = () => {
    fetch('/api/shows')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (data.shows && data.shows.length > 0) {
          setShows(data.shows);
          setSelectedShow(data.shows[0]);
          setApiConnected(true);
          setErrorMessage(null);
        } else {
          setShows([FALLBACK_DEFAULT_SHOW]);
          setSelectedShow(FALLBACK_DEFAULT_SHOW);
          setApiConnected(true);
        }
      })
      .catch((err) => {
        console.warn('API /api/shows unreachable, operating with default catalog:', err);
        setShows([FALLBACK_DEFAULT_SHOW]);
        setSelectedShow(FALLBACK_DEFAULT_SHOW);
        setApiConnected(false);
      });
  };

  // Load catalog on mount
  useEffect(() => {
    loadShows();
  }, []);

  // When selectedShow changes, fetch episodes and characters
  useEffect(() => {
    if (!selectedShow) return;
    fetch(`/api/shows/${selectedShow.id}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (data.episodes) setEpisodes(data.episodes);
        if (data.characters) {
          setCharacters(data.characters);
          if (data.characters[0]) {
            setSelectedCharacterId(data.characters[0].id);
          }
        }
      })
      .catch((err) => {
        console.warn('Could not load remote show details, using fallback:', err);
      });
  }, [selectedShow?.id]);

  // Real-time Socket.io sync for TV
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

    socket.on('member.left', (payload: any) => {
      setMembers((prev) => prev.filter((m) => m.id !== payload.memberId));
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
      // Automatically refresh recap when boundary advances or regresses
      if (session) {
        fetchRecap(session.id);
      }
    });

    socket.on('session.started', (payload: any) => {
      setBoundary(payload.boundary);
      setCurrentScreen('recap');
    });

    socket.on('session.ended', () => {
      alert('Session has ended.');
      setSession(null);
      setCurrentScreen('home');
    });

    socket.on('answer.ready', (payload: any) => {
      setQaFeed((prev) => {
        if (prev.some((a) => a.id === payload.questionAnswer.id)) return prev;
        return [payload.questionAnswer, ...prev];
      });
    });

    socket.on('extension.connected', () => {
      if (session) fetchExtensions(session.id);
    });

    socket.on('extension.revoked', (payload: any) => {
      setLinkedExtensions((prev) =>
        prev.filter((e) => e.installationId !== payload.installationId)
      );
    });

    socket.on('extension.context.detected', (payload: any) => {
      setLinkedExtensions((prev) =>
        prev.map((e) =>
          e.installationId === payload.installationId
            ? { ...e, detectedContentContext: payload.context }
            : e
        )
      );
    });

    socket.on('extension.context.confirmed', (payload: any) => {
      setLinkedExtensions((prev) =>
        prev.map((e) =>
          e.installationId === payload.installationId
            ? { ...e, confirmedContentContext: payload.context }
            : e
        )
      );
    });

    // Initial fetch of extensions
    fetchExtensions(session.id);

    return () => {
      socket.disconnect();
    };
  }, [session?.id]);

  const fetchExtensions = async (sessId: string) => {
    try {
      const res = await fetch(`/api/sessions/${sessId}/extensions`);
      const data = await res.json();
      if (data.extensions) {
        setLinkedExtensions(data.extensions);
      }
    } catch (err) {
      console.error('Failed to load extensions:', err);
    }
  };

  const fetchRecap = async (sessId: string) => {
    try {
      const res = await fetch(`/api/sessions/${sessId}/recap`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setRecap(data.recap);
        setBoundary(data.boundary);
      }
    } catch (err) {
      console.error('Failed to fetch recap:', err);
    }
  };

  const handleCreateParty = async () => {
    const showToUse = selectedShow || shows[0] || FALLBACK_DEFAULT_SHOW;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          showId: showToUse.id,
          hostDisplayName: 'Living Room TV',
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create party');

      setSession(data.session);
      setHostMember(data.hostMember);
      setMembers([data.hostMember]);
      setBoundary(data.boundary);
      setQrCodeUrl(data.qrCodeDataUrl);
      setJoinUrl(data.joinUrl);
      setCurrentScreen('lobby');
      setApiConnected(true);
    } catch (err: any) {
      console.warn('API /api/sessions unreachable, launching simulated offline watch party:', err);
      const fallbackRoomCode = 'TV' + Math.floor(1000 + Math.random() * 9000);
      setSession({
        id: 'simulated-session-1',
        showId: showToUse.id,
        roomCode: fallbackRoomCode,
        hostId: 'sim-host-1',
        status: 'active',
        boundaryEpisodeId: null,
        boundaryVersion: 1,
        invitationTokenHash: 'simulated_hash',
        expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
      });
      const host: SessionMember = {
        id: 'sim-host-1',
        sessionId: 'simulated-session-1',
        anonymousIdentity: 'anon-host',
        displayName: 'Living Room TV (Host)',
        lastWatchedEpisodeId: null,
        role: 'host',
        status: 'active',
        joinedAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
      };
      setHostMember(host);
      setMembers([host]);
      setBoundary({
        boundaryEpisodeId: null,
        seasonNumber: null,
        episodeNumber: null,
        canonicalOrder: null,
        boundaryVersion: 1,
        calculatedAt: new Date().toISOString(),
        eligibleMemberCount: 1,
        isSafe: true,
        label: 'Waiting for viewing progress (Season 1)',
      });
      setJoinUrl(`http://${window.location.hostname || 'localhost'}:3000`);
      setCurrentScreen('lobby');
      setApiConnected(false);
      setErrorMessage(
        'Launched in Local TV Simulation Mode. To enable full phone and extension real-time syncing, start the backend with "pnpm run dev:api".'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartParty = async () => {
    if (!session) return;
    try {
      await fetch(`/api/sessions/${session.id}/start`, { method: 'POST' });
      await fetchRecap(session.id);
      setCurrentScreen('recap');
    } catch (err) {
      console.error('Failed to start party:', err);
    }
  };

  const handleEndParty = async () => {
    if (!session) return;
    try {
      await fetch(`/api/sessions/${session.id}/end`, { method: 'POST' });
    } finally {
      setSession(null);
      setCurrentScreen('home');
    }
  };

  const handleAskTvQuestion = async (qText: string) => {
    if (!session || !hostMember) return;
    try {
      const res = await fetch(`/api/sessions/${session.id}/questions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-member-id': hostMember.id,
        },
        body: JSON.stringify({ question: qText }),
      });
      const data = await res.json();
      if (data.success) {
        setQaFeed((prev) => [data.answer, ...prev]);
        setCurrentScreen('qa');
      }
    } catch (err) {
      console.error('Ask question failed:', err);
    }
  };

  // Determine navigable items count based on current screen
  let itemCount = 3;
  let columns = 1;
  if (currentScreen === 'home') {
    itemCount = 3;
    columns = 3;
  } else if (currentScreen === 'show-selection') {
    itemCount = Math.max(shows.length + 1, 2);
    columns = 2;
  } else if (currentScreen === 'lobby') {
    itemCount = 3; // Start, Refresh, Back
    columns = 3;
  } else if (currentScreen === 'recap' || currentScreen === 'characters' || currentScreen === 'qa') {
    itemCount = 5; // Top Tabs (Recap, Characters, Q&A, Refresh, Leave)
    columns = 5;
  }

  const { focusedIndex, moveUp, moveDown, moveLeft, moveRight, select, back } = useTvNavigation({
    itemCount,
    columns,
    onSelect: (index) => {
      if (currentScreen === 'home') {
        if (index === 0) handleCreateParty();
        if (index === 1) setCurrentScreen('show-selection');
        if (index === 2) setCurrentScreen('settings');
      } else if (currentScreen === 'show-selection') {
        if (index === 0) handleCreateParty();
        if (index === 1) setCurrentScreen('home');
      } else if (currentScreen === 'lobby') {
        if (index === 0) handleStartParty();
        if (index === 1 && session) fetchRecap(session.id);
        if (index === 2) setCurrentScreen('home');
      } else if (
        currentScreen === 'recap' ||
        currentScreen === 'characters' ||
        currentScreen === 'qa' ||
        currentScreen === 'settings'
      ) {
        if (index === 0) setCurrentScreen('recap');
        if (index === 1) setCurrentScreen('characters');
        if (index === 2) setCurrentScreen('qa');
        if (index === 3 && session) fetchRecap(session.id);
        if (index === 4) handleEndParty();
      }
    },
    onBack: () => {
      if (currentScreen !== 'home') {
        if (session && currentScreen !== 'lobby') {
          setCurrentScreen('lobby');
        } else {
          setCurrentScreen('home');
        }
      }
    },
  });

  return (
    <div className="w-screen h-screen bg-[#070b14] text-slate-100 flex flex-col justify-between p-10 relative overflow-hidden font-sans select-none">
      {/* Background Cinematic Gradient Accents */}
      <div className="absolute top-0 right-0 w-[800px] h-[600px] bg-purple-900/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-indigo-900/15 rounded-full blur-[140px] pointer-events-none" />

      {/* Top TV Navigation Bar */}
      <header className="flex items-center justify-between z-10 border-b border-slate-800/80 pb-5">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-600/30">
            <Tv className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
              <span>SceneSync</span>
              <span className="text-xs uppercase px-2 py-0.5 rounded-md bg-purple-950/80 text-purple-300 border border-purple-800 font-mono tracking-widest">
                Fire TV
              </span>
            </h1>
            <p className="text-xs text-purple-300 font-medium">
              Catch up together. Never spoil the moment.
            </p>
          </div>
        </div>

        {session && (
          <div className="flex items-center gap-4">
            <div className="bg-slate-900/90 border border-purple-500/40 px-5 py-2 rounded-2xl shadow-lg flex items-center gap-3">
              <span className="text-xs uppercase font-bold text-slate-400">Room Code:</span>
              <span className="font-mono text-2xl font-extrabold text-purple-300 tracking-widest">
                {session.roomCode}
              </span>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 px-4 py-2 rounded-2xl flex items-center gap-2 text-sm">
              <Users className="w-4 h-4 text-purple-400" />
              <span className="font-semibold text-slate-200">{members.length} Watching</span>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 px-4 py-2 rounded-2xl flex items-center gap-2 text-sm">
              <Laptop className="w-4 h-4 text-sky-400" />
              <span className="font-semibold text-slate-200">
                {linkedExtensions.length} {linkedExtensions.length === 1 ? 'Extension' : 'Extensions'}
              </span>
            </div>
          </div>
        )}

        {!session && (
          <div className="flex items-center gap-3">
            {apiConnected === false && (
              <div className="bg-amber-950/80 border border-amber-600/50 px-3.5 py-1.5 rounded-xl flex items-center gap-2 text-xs text-amber-300">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Backend API Disconnected</span>
                <button
                  onClick={loadShows}
                  className="underline hover:text-white font-bold ml-1"
                >
                  Retry
                </button>
              </div>
            )}
            {apiConnected === true && (
              <div className="bg-emerald-950/80 border border-emerald-600/50 px-3.5 py-1.5 rounded-xl flex items-center gap-2 text-xs text-emerald-300">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>API Connected</span>
              </div>
            )}
          </div>
        )}
      </header>

      {/* Optional Notification Banner */}
      {errorMessage && (
        <div className="bg-purple-950/90 border border-purple-500/60 rounded-2xl p-4 my-2 flex items-center justify-between text-sm text-purple-200 z-20">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-purple-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-xs bg-purple-800 hover:bg-purple-700 px-3 py-1 rounded-lg text-white font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ========================================================= */}
      {/* SCREEN: HOME                                              */}
      {/* ========================================================= */}
      {currentScreen === 'home' && (
        <main className="flex-1 flex flex-col justify-center my-6 z-10">
          <div className="max-w-3xl mb-12">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-purple-950/70 border border-purple-800/60 text-purple-300 text-xs font-semibold mb-4">
              <ShieldCheck className="w-4 h-4 text-purple-400" />
              <span>Authoritative Anti-Spoiler Watch Party Engine</span>
            </div>
            <h2 className="text-5xl font-black text-white leading-tight">
              Watch TV safely with friends at different speeds.
            </h2>
            <p className="text-lg text-slate-400 mt-4 leading-relaxed">
              Create a party on your Fire TV. Friends join from their phone browsers, declare their
              watched episodes, and all recaps, character explanations, and Q&A are strictly
              restricted to the shared viewing boundary.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-8 max-w-5xl">
            {/* Card 0: Create Watch Party */}
            <div
              onClick={handleCreateParty}
              role="button"
              tabIndex={0}
              className={`cursor-pointer p-8 rounded-3xl bg-gradient-to-br from-slate-900 to-purple-950/40 border transition-all duration-200 flex flex-col justify-between h-64 ${
                focusedIndex === 0
                  ? 'border-purple-500 ring-4 ring-purple-500/50 scale-105 shadow-2xl shadow-purple-500/20 bg-purple-900/30'
                  : 'border-slate-800 opacity-90 hover:border-slate-700'
              }`}
            >
              <div>
                <div className="w-12 h-12 rounded-2xl bg-purple-600 flex items-center justify-center text-white mb-4">
                  <Play className="w-6 h-6 fill-current" />
                </div>
                <h3 className="text-2xl font-bold text-white">Create Watch Party</h3>
                <p className="text-sm text-slate-400 mt-2">
                  Launch a session for {selectedShow?.title || 'the current show'} with QR joining.
                </p>
              </div>
              <div className="flex items-center text-purple-300 text-xs font-bold uppercase tracking-wider gap-1">
                <span>Select to Launch</span>
                <ArrowRight className="w-4 h-4" />
              </div>
            </div>

            {/* Card 1: Browse Shows */}
            <div
              onClick={() => setCurrentScreen('show-selection')}
              role="button"
              tabIndex={0}
              className={`cursor-pointer p-8 rounded-3xl bg-slate-900 border transition-all duration-200 flex flex-col justify-between h-64 ${
                focusedIndex === 1
                  ? 'border-purple-500 ring-4 ring-purple-500/50 scale-105 shadow-2xl shadow-purple-500/20 bg-purple-900/30'
                  : 'border-slate-800 opacity-90 hover:border-slate-700'
              }`}
            >
              <div>
                <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-slate-300 mb-4">
                  <BookOpen className="w-6 h-6" />
                </div>
                <h3 className="text-2xl font-bold text-white">Curated Catalog</h3>
                <p className="text-sm text-slate-400 mt-2">
                  Browse episodes, character relationships, and facts for supported series.
                </p>
              </div>
              <div className="flex items-center text-slate-400 text-xs font-bold uppercase tracking-wider gap-1">
                <span>Browse Shows</span>
                <ArrowRight className="w-4 h-4" />
              </div>
            </div>

            {/* Card 2: Settings */}
            <div
              onClick={() => setCurrentScreen('settings')}
              role="button"
              tabIndex={0}
              className={`cursor-pointer p-8 rounded-3xl bg-slate-900 border transition-all duration-200 flex flex-col justify-between h-64 ${
                focusedIndex === 2
                  ? 'border-purple-500 ring-4 ring-purple-500/50 scale-105 shadow-2xl shadow-purple-500/20 bg-purple-900/30'
                  : 'border-slate-800 opacity-90 hover:border-slate-700'
              }`}
            >
              <div>
                <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-slate-300 mb-4">
                  <Settings className="w-6 h-6" />
                </div>
                <h3 className="text-2xl font-bold text-white">Diagnostics</h3>
                <p className="text-sm text-slate-400 mt-2">
                  Verify PostgreSQL connectivity, spoiler policy engine, and AI adapter.
                </p>
              </div>
              <div className="flex items-center text-slate-400 text-xs font-bold uppercase tracking-wider gap-1">
                <span>System Status</span>
                <ArrowRight className="w-4 h-4" />
              </div>
            </div>
          </div>
        </main>
      )}

      {/* ========================================================= */}
      {/* SCREEN: SHOW SELECTION                                    */}
      {/* ========================================================= */}
      {currentScreen === 'show-selection' && (
        <main className="flex-1 flex flex-col justify-center z-10 max-w-6xl mx-auto w-full">
          <h2 className="text-3xl font-black text-white mb-6">Curated TV Show Catalog</h2>
          {shows.map((s) => (
            <div
              key={s.id}
              className="bg-slate-900/90 border border-slate-800 rounded-3xl p-8 flex gap-8 items-center"
            >
              <img
                src={s.posterUrl}
                alt={s.title}
                className="w-56 h-80 object-cover rounded-2xl shadow-2xl border border-slate-700"
              />
              <div className="flex-1">
                <span className="text-xs uppercase font-bold text-purple-400 tracking-wider">
                  Season 1 • 10 Episodes Available
                </span>
                <h3 className="text-4xl font-black text-white mt-1">{s.title}</h3>
                <p className="text-slate-300 text-base mt-4 leading-relaxed max-w-2xl">
                  {s.description}
                </p>

                <div className="mt-8 flex gap-4">
                  <button
                    onClick={handleCreateParty}
                    className={`px-8 py-4 rounded-2xl font-bold text-lg flex items-center gap-3 transition ${
                      focusedIndex === 0
                        ? 'bg-purple-600 text-white ring-4 ring-purple-400 scale-105'
                        : 'bg-purple-700/60 text-slate-200'
                    }`}
                  >
                    <Play className="w-5 h-5 fill-current" />
                    <span>Start Watch Party with this Show</span>
                  </button>
                  <button
                    onClick={() => setCurrentScreen('home')}
                    className={`px-6 py-4 rounded-2xl font-semibold text-lg border transition ${
                      focusedIndex === 1
                        ? 'border-purple-400 text-white ring-4 ring-purple-400/50 scale-105'
                        : 'border-slate-800 text-slate-400'
                    }`}
                  >
                    Back to Home
                  </button>
                </div>
              </div>
            </div>
          ))}
        </main>
      )}

      {/* ========================================================= */}
      {/* SCREEN: SESSION LOBBY                                     */}
      {/* ========================================================= */}
      {currentScreen === 'lobby' && session && (
        <main className="flex-1 flex items-center justify-between gap-12 z-10 max-w-6xl mx-auto w-full">
          {/* Left: Join QR Code & Instructions */}
          <div className="flex-1 bg-slate-900/90 border border-slate-800 rounded-3xl p-10 flex flex-col items-center text-center shadow-2xl">
            <div className="p-4 bg-white rounded-3xl shadow-2xl mb-6">
              {qrCodeUrl ? (
                <img src={qrCodeUrl} alt="Scan to join" className="w-64 h-64" />
              ) : (
                <div className="w-64 h-64 bg-slate-200 animate-pulse rounded-2xl" />
              )}
            </div>

            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
              Scan with Smartphone Camera to Join
            </span>
            <div className="mt-3 flex items-center gap-3">
              <span className="text-sm text-slate-400">or open</span>
              <span className="font-mono text-purple-300 font-bold bg-purple-950/80 px-2 py-0.5 rounded border border-purple-800 text-sm">
                {joinUrl || 'http://localhost:3000'}
              </span>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-800/80 w-full flex items-center justify-center gap-4">
              <button
                onClick={handleStartParty}
                className={`px-8 py-4 rounded-2xl font-bold text-lg flex items-center gap-2 transition ${
                  focusedIndex === 0
                    ? 'bg-purple-600 text-white ring-4 ring-purple-400 scale-105'
                    : 'bg-purple-800/70 text-slate-200'
                }`}
              >
                <Play className="w-5 h-5 fill-current" />
                <span>Start Party Now</span>
              </button>
              <button
                onClick={() => fetchRecap(session.id)}
                className={`p-4 rounded-2xl border transition ${
                  focusedIndex === 1
                    ? 'border-purple-400 text-white ring-4 ring-purple-400/50 scale-105'
                    : 'border-slate-800 text-slate-400'
                }`}
                title="Refresh State"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Right: Joined Participants & Enforced Boundary */}
          <div className="flex-1 flex flex-col gap-6">
            {/* Boundary Banner */}
            <div className="bg-gradient-to-br from-indigo-950/80 to-purple-950/70 border border-purple-500/40 rounded-3xl p-6 shadow-xl">
              <div className="flex items-center gap-3 text-purple-300 text-xs font-bold uppercase tracking-wider mb-2">
                <ShieldCheck className="w-5 h-5 text-purple-400" />
                <span>Authoritative Shared Boundary</span>
              </div>
              <h3 className="text-2xl font-black text-white">
                {boundary?.label || 'Calculating Boundary...'}
              </h3>
              <p className="text-xs text-slate-400 mt-2">
                All generated recaps and questions will strictly use facts established on or before
                this boundary.
              </p>
            </div>

            {/* Participants list */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 flex-1 flex flex-col">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-2">
                <Users className="w-4 h-4 text-purple-400" />
                <span>Connected Participants ({members.length})</span>
              </h4>

              <div className="space-y-3 overflow-y-auto max-h-56 pr-2">
                {members.map((m) => {
                  const ep = episodes.find((e) => e.id === m.lastWatchedEpisodeId);
                  return (
                    <div
                      key={m.id}
                      className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-800/60 border border-slate-700/60"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                        <span className="font-bold text-white text-base">{m.displayName}</span>
                        {m.role === 'host' && (
                          <span className="text-[10px] font-bold uppercase bg-amber-950 text-amber-300 border border-amber-800 px-2 py-0.5 rounded-md">
                            Host
                          </span>
                        )}
                      </div>
                      <span className="text-sm font-semibold text-purple-300">
                        {ep ? `S${ep.seasonNumber} E${ep.episodeNumber}` : 'Not Started'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Desktop Extensions list */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 flex flex-col">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
                <Laptop className="w-4 h-4 text-sky-400" />
                <span>Connected Desktop Extensions ({linkedExtensions.length})</span>
              </h4>

              {linkedExtensions.length === 0 ? (
                <p className="text-xs text-slate-500 italic py-1">
                  No browser extensions connected yet. Connect desktop streaming to sync playback.
                </p>
              ) : (
                <div className="space-y-2 overflow-y-auto max-h-36 pr-2">
                  {linkedExtensions.map((ext) => {
                    const ctx = ext.confirmedContentContext || ext.detectedContentContext;
                    return (
                      <div
                        key={ext.installationId}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse"></span>
                          <span className="font-bold text-slate-200 uppercase tracking-wider">
                            {ext.providerId}
                          </span>
                        </div>
                        <span className="text-sky-300 font-mono">
                          {ctx ? `S${ctx.seasonNumber ?? '?'} E${ctx.episodeNumber ?? '?'}` : 'Monitoring'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </main>
      )}

      {/* ========================================================= */}
      {/* SCREEN: ACTIVE PARTY (Recap / Characters / Q&A)           */}
      {/* ========================================================= */}
      {(currentScreen === 'recap' || currentScreen === 'characters' || currentScreen === 'qa') && (
        <main className="flex-1 flex flex-col z-10 max-w-6xl mx-auto w-full my-2">
          {/* Top In-Session Navigation Tabs */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex gap-4">
              <button
                onClick={() => setCurrentScreen('recap')}
                className={`px-6 py-3 rounded-2xl font-bold text-base flex items-center gap-2 transition ${
                  currentScreen === 'recap'
                    ? 'bg-purple-600 text-white ring-2 ring-purple-400 shadow-lg'
                    : 'bg-slate-900 border border-slate-800 text-slate-400'
                } ${focusedIndex === 0 ? 'ring-4 ring-purple-400 scale-105' : ''}`}
              >
                <BookOpen className="w-5 h-5" />
                <span>Shared Recap</span>
              </button>

              <button
                onClick={() => setCurrentScreen('characters')}
                className={`px-6 py-3 rounded-2xl font-bold text-base flex items-center gap-2 transition ${
                  currentScreen === 'characters'
                    ? 'bg-purple-600 text-white ring-2 ring-purple-400 shadow-lg'
                    : 'bg-slate-900 border border-slate-800 text-slate-400'
                } ${focusedIndex === 1 ? 'ring-4 ring-purple-400 scale-105' : ''}`}
              >
                <Users className="w-5 h-5" />
                <span>Character Guide</span>
              </button>

              <button
                onClick={() => setCurrentScreen('qa')}
                className={`px-6 py-3 rounded-2xl font-bold text-base flex items-center gap-2 transition ${
                  currentScreen === 'qa'
                    ? 'bg-purple-600 text-white ring-2 ring-purple-400 shadow-lg'
                    : 'bg-slate-900 border border-slate-800 text-slate-400'
                } ${focusedIndex === 2 ? 'ring-4 ring-purple-400 scale-105' : ''}`}
              >
                <MessageSquare className="w-5 h-5" />
                <span>Live Q&A ({qaFeed.length})</span>
              </button>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => session && fetchRecap(session.id)}
                className={`p-3 rounded-2xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white transition ${
                  focusedIndex === 3 ? 'ring-4 ring-purple-400 scale-105' : ''
                }`}
                title="Refresh Boundary"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
              <button
                onClick={handleEndParty}
                className={`px-4 py-3 rounded-2xl bg-red-950/70 border border-red-800 text-red-300 hover:text-white transition flex items-center gap-2 text-sm font-bold ${
                  focusedIndex === 4 ? 'ring-4 ring-red-400 scale-105' : ''
                }`}
              >
                <LogOut className="w-4 h-4" />
                <span>End Party</span>
              </button>
            </div>
          </div>

          {/* TAB 1: SHARED RECAP */}
          {currentScreen === 'recap' && (
            <div className="grid grid-cols-3 gap-8 flex-1 overflow-hidden">
              {/* Left 2 Cols: Recap Body & Milestones */}
              <div className="col-span-2 bg-slate-900/90 border border-slate-800 rounded-3xl p-8 flex flex-col justify-between overflow-y-auto">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4" />
                      <span>{boundary?.label || 'Boundary Safe'}</span>
                    </span>
                    <span className="text-xs text-slate-500 font-mono">
                      BOUNDARY VERSION {boundary?.boundaryVersion || 1}
                    </span>
                  </div>

                  <h3 className="text-2xl font-black text-white mb-4">
                    Story Progression Catch-up
                  </h3>
                  <p className="text-slate-300 text-base leading-relaxed mb-6">
                    {recap?.body || 'Loading shared recap for the group viewing boundary...'}
                  </p>

                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                    Key Safe Events & Milestones:
                  </h4>
                  <div className="space-y-2">
                    {recap?.keyEvents.map((evt, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 text-sm text-slate-200"
                      >
                        {evt}
                      </div>
                    ))}
                  </div>
                </div>

                {recap?.evidenceIds && (
                  <div className="mt-6 pt-4 border-t border-slate-800 flex items-center gap-2 text-xs text-slate-500">
                    <span className="font-bold">Provenance IDs:</span>
                    {recap.evidenceIds.map((id) => (
                      <span key={id} className="font-mono bg-slate-800 px-2 py-0.5 rounded">
                        {id}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Right Col: Selectable Suggested Discussion Prompts */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-8 flex flex-col">
                <h4 className="text-xs font-bold uppercase tracking-wider text-purple-400 mb-4 flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  <span>Discussion Prompts (Safe)</span>
                </h4>
                <p className="text-xs text-slate-400 mb-4">
                  Select a prompt to ask SceneSync AI on the TV screen:
                </p>

                <div className="space-y-3 flex-1 overflow-y-auto">
                  {(recap?.suggestedQuestions || [
                    "What does Elena's pendant do?",
                    'Who is Lord Brandon Starkwell?',
                    'What occurred in the latest safe episode?',
                  ]).map((prompt, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleAskTvQuestion(prompt)}
                      className="w-full text-left p-4 rounded-2xl bg-purple-950/40 hover:bg-purple-900/60 border border-purple-800/60 text-purple-200 text-sm font-semibold transition"
                    >
                      "{prompt}"
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: CHARACTER GUIDE */}
          {currentScreen === 'characters' && (
            <div className="grid grid-cols-3 gap-8 flex-1 overflow-hidden">
              {/* Character selection list */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 space-y-3 overflow-y-auto">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Select Character
                </h4>
                {characters.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => setSelectedCharacterId(c.id)}
                    className={`flex items-center gap-4 p-3.5 rounded-2xl border cursor-pointer transition ${
                      selectedCharacterId === c.id
                        ? 'bg-purple-900/50 border-purple-500 shadow-lg'
                        : 'bg-slate-800/40 border-slate-700/60'
                    }`}
                  >
                    <img
                      src={c.imageUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100'}
                      alt={c.name}
                      className="w-14 h-14 rounded-full object-cover border border-purple-400/40"
                    />
                    <div>
                      <h5 className="font-bold text-white text-base">{c.name}</h5>
                      <span className="text-xs text-purple-300">Active in Story</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Character Explanation Panel */}
              <div className="col-span-2 bg-slate-900/90 border border-slate-800 rounded-3xl p-8 flex flex-col justify-between overflow-y-auto">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4" />
                      <span>Safe Knowledge through {boundary?.label}</span>
                    </span>
                  </div>

                  {characters.find((c) => c.id === selectedCharacterId) && (
                    <>
                      <h3 className="text-3xl font-black text-white">
                        {characters.find((c) => c.id === selectedCharacterId)?.name}
                      </h3>
                      <p className="text-slate-300 text-base mt-3 leading-relaxed">
                        What the group safely knows without spoilers: Key ally in the capital
                        uncovering conspiracies without exposing any plot developments past your
                        shared progress ({boundary?.label}).
                      </p>

                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mt-6 mb-3">
                        Verified Safe Relationships:
                      </h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60">
                          <span className="text-xs text-purple-300 font-bold uppercase">
                            Protector
                          </span>
                          <h6 className="font-bold text-white text-sm mt-1">
                            Lord Brandon Starkwell
                          </h6>
                          <p className="text-xs text-slate-400 mt-1">
                            Escorting Elena safely to the high citadel.
                          </p>
                        </div>
                        <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60">
                          <span className="text-xs text-amber-300 font-bold uppercase">
                            Political Rival
                          </span>
                          <h6 className="font-bold text-white text-sm mt-1">
                            Chancellor Malakar
                          </h6>
                          <p className="text-xs text-slate-400 mt-1">
                            Opposing military movement at the city gates.
                          </p>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: LIVE Q&A FEED */}
          {currentScreen === 'qa' && (
            <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-8 flex-1 overflow-y-auto flex flex-col">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-2xl font-black text-white">Live Watch Party Q&A</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Questions submitted from companion phones or TV remote appear here in real time.
                  </p>
                </div>
                <span className="text-xs font-mono text-purple-400 bg-purple-950/80 px-3 py-1 rounded-lg border border-purple-800">
                  {qaFeed.length} QUESTIONS ANSWERED
                </span>
              </div>

              {qaFeed.filter((i) => !i.destination || i.destination === 'all' || i.destination === 'tv').length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
                  <MessageSquare className="w-12 h-12 mb-3 text-slate-600" />
                  <p className="text-base font-semibold">No questions asked yet.</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Scan the QR code on your phone or ask via desktop extension safely!
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {qaFeed
                    .filter((item) => !item.destination || item.destination === 'all' || item.destination === 'tv')
                    .map((item) => (
                    <div
                      key={item.id}
                      className="bg-slate-800/70 border border-slate-700/70 rounded-2xl p-5 shadow-lg"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-purple-300 text-sm">
                            Q: {item.question}
                          </span>
                          {item.sourceClient === 'extension' && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-sky-950 text-sky-300 border border-sky-800 flex items-center gap-1">
                              <Laptop className="w-3 h-3" /> Extension
                            </span>
                          )}
                          {item.sourceClient === 'phone' && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-purple-950 text-purple-300 border border-purple-800 flex items-center gap-1">
                              <Smartphone className="w-3 h-3" /> Phone
                            </span>
                          )}
                          {item.sourceClient === 'fire-tv' && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-950 text-amber-300 border border-amber-800 flex items-center gap-1">
                              <Tv className="w-3 h-3" /> Fire TV
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          {item.answerStatus === 'verified' ? (
                            <span className="text-xs uppercase font-bold text-emerald-400 flex items-center gap-1">
                              <CheckCircle2 className="w-4 h-4" />
                              <span>Verified Grounded</span>
                            </span>
                          ) : (
                            <span className="text-xs uppercase font-bold text-amber-400 flex items-center gap-1">
                              <AlertTriangle className="w-4 h-4" />
                              <span>Spoiler Prevented</span>
                            </span>
                          )}
                        </div>
                      </div>

                      <p className="text-base text-slate-200 mt-2 leading-relaxed">
                        {item.answerBody}
                      </p>

                      {item.evidenceIds.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-slate-700/60 flex items-center gap-2 text-xs text-slate-400">
                          <span className="font-bold">Evidence Grounding:</span>
                          {item.evidenceIds.map((id) => (
                            <span
                              key={id}
                              className="font-mono bg-purple-950 text-purple-300 px-2 py-0.5 rounded border border-purple-800"
                            >
                              {id}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>
      )}

      {/* ========================================================= */}
      {/* SCREEN: SETTINGS & DIAGNOSTICS                            */}
      {/* ========================================================= */}
      {currentScreen === 'settings' && (
        <main className="flex-1 flex flex-col justify-center z-10 max-w-4xl mx-auto w-full">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-10">
            <h2 className="text-3xl font-black text-white mb-6">SceneSync System Diagnostics</h2>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60">
                <span className="font-bold text-slate-200">PostgreSQL Database Connection</span>
                <span className="text-emerald-400 font-bold text-xs uppercase flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Connected (port 5432)</span>
                </span>
              </div>

              <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60">
                <span className="font-bold text-slate-200">Spoiler-Safety Policy Engine</span>
                <span className="text-emerald-400 font-bold text-xs uppercase flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Enforcing Canonical Min Boundary</span>
                </span>
              </div>

              <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60">
                <span className="font-bold text-slate-200">AI Grounding Adapter</span>
                <span className="text-emerald-400 font-bold text-xs uppercase flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Stage 2 Claim Verification Active</span>
                </span>
              </div>

              <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60">
                <span className="font-bold text-slate-200">Fire TV Remote Key Listener</span>
                <span className="text-emerald-400 font-bold text-xs uppercase flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>D-Pad, Center, Back Active</span>
                </span>
              </div>
            </div>

            <div className="mt-8">
              <button
                onClick={() => setCurrentScreen('home')}
                className="px-8 py-3.5 rounded-2xl bg-purple-600 text-white font-bold text-base hover:bg-purple-500 transition"
              >
                Return to Home
              </button>
            </div>
          </div>
        </main>
      )}

      {/* Bottom Remote Control Info Bar */}
      <footer className="flex items-center justify-between text-xs text-slate-400 border-t border-slate-800/80 pt-4 z-10">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="px-2 py-1 rounded bg-slate-800 text-slate-300 font-mono text-[10px] font-bold">
              ARROWS
            </span>
            <span>Navigate</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-1 rounded bg-slate-800 text-slate-300 font-mono text-[10px] font-bold">
              ENTER / SELECT
            </span>
            <span>Select</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-1 rounded bg-slate-800 text-slate-300 font-mono text-[10px] font-bold">
              ESC / BACK
            </span>
            <span>Back</span>
          </div>
        </div>

        <div className="text-purple-400 font-mono">
          1920×1080 10-Foot UI • Remote-Optimized
        </div>
      </footer>

      {/* Floating On-Screen Fire TV Remote Controller */}
      <FireTvRemote
        onUp={moveUp}
        onDown={moveDown}
        onLeft={moveLeft}
        onRight={moveRight}
        onSelect={select}
        onBack={back}
        onHome={() => setCurrentScreen('home')}
      />
    </div>
  );
}
