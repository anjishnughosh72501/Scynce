import { z } from 'zod';

// ==========================================
// Catalog Models
// ==========================================

export interface Show {
  id: string;
  title: string;
  description: string;
  posterUrl: string;
  status: 'active' | 'archived';
  createdAt?: string;
}

export interface Episode {
  id: string;
  showId: string;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  canonicalOrder: number; // Strictly increasing integer (e.g. S1E1=1, S1E2=2, S2E1=11)
  contentStatus: 'ready' | 'draft';
}

export interface Fact {
  id: string;
  showId: string;
  episodeId: string;
  characterId?: string | null;
  factText: string;
  sourceId: string;
  verificationStatus: 'verified' | 'unverified';
}

export interface Character {
  id: string;
  showId: string;
  name: string;
  imageUrl?: string | null;
  firstAppearanceEpisodeId: string;
}

export interface CharacterRelationship {
  id: string;
  characterId: string;
  relatedCharacterId: string;
  relationshipType: string;
  establishedEpisodeId: string;
  description: string;
}

// ==========================================
// Session & Member Models
// ==========================================

export type SessionStatus = 'lobby' | 'active' | 'ended';
export type MemberRole = 'host' | 'guest';
export type MemberStatus = 'active' | 'disconnected' | 'left';

export interface Session {
  id: string;
  roomCode: string;
  showId: string;
  hostId: string;
  status: SessionStatus;
  boundaryEpisodeId: string | null;
  boundaryVersion: number;
  invitationTokenHash: string;
  expiresAt: string;
  createdAt: string;
}

export interface SessionMember {
  id: string;
  sessionId: string;
  anonymousIdentity: string;
  displayName: string;
  lastWatchedEpisodeId: string | null; // null means 'not started'
  role: MemberRole;
  status: MemberStatus;
  joinedAt: string;
  lastSeenAt: string;
}

export interface BoundarySnapshot {
  boundaryEpisodeId: string | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  canonicalOrder: number | null;
  boundaryVersion: number;
  calculatedAt: string;
  eligibleMemberCount: number;
  isSafe: boolean;
  label: string; // e.g. "Safe through S1 E6" or "Not Started"
}

// ==========================================
// Extension & Multi-Surface Models
// ==========================================

export type StreamingProviderId = 'netflix' | 'prime-video' | 'hotstar' | 'fallback';

export type DetectionMethod =
  | 'url'
  | 'dom_metadata'
  | 'dom_player'
  | 'manual_confirmed'
  | 'unverified';

export interface DetectedStreamingContext {
  providerId: StreamingProviderId;
  showTitle: string;
  seasonNumber?: number | null;
  episodeNumber?: number | null;
  episodeTitle?: string | null;
  canonicalContentId?: string | null;
  detectionMethod: DetectionMethod;
  confidence: number; // 0.0 to 1.0
  lastDetectedAt: string;
}

export interface ProviderCapabilities {
  canDetectShowTitle: boolean;
  canDetectEpisode: boolean;
  canDetectTimeOffset: boolean;
  requiresManualConfirmation: boolean;
  verificationStatus: 'verified_automated' | 'verified_manual_fallback' | 'unverified';
  supportedDomains: string[];
}

export type ResponseDestination = 'all' | 'sidepanel' | 'tv' | 'phone';

export type ExtensionCommandType =
  | 'SET_ACTIVE_SESSION'
  | 'SET_CONTENT_CONTEXT'
  | 'REQUEST_RECAP'
  | 'REQUEST_CHARACTER_EXPLANATION'
  | 'SUBMIT_QUESTION'
  | 'SET_DISPLAY_DESTINATION'
  | 'DISCONNECT_EXTENSION';

export interface ExtensionCommand {
  commandId: string;
  type: ExtensionCommandType;
  payload: any;
  issuedBy: string;
  issuedAt: string;
}

export interface ExtensionLinking {
  id: string;
  installationId: string;
  ownerId: string;
  sessionId: string | null;
  providerId: StreamingProviderId | null;
  detectedContentContext: DetectedStreamingContext | null;
  confirmedContentContext: DetectedStreamingContext | null;
  connectionStatus: 'connected' | 'disconnected' | 'revoked';
  displayDestination: ResponseDestination;
  lastSeenAt: string;
  revokedAt: string | null;
  createdAt: string;
}

export interface ExtensionDeviceState {
  installationId: string;
  providerId: StreamingProviderId | null;
  connectionStatus: 'connected' | 'disconnected' | 'revoked';
  detectedContext: DetectedStreamingContext | null;
  confirmedContext: DetectedStreamingContext | null;
  displayDestination: ResponseDestination;
  lastSeenAt: string;
}

// ==========================================
// Recap & Q&A Models
// ==========================================

export interface Recap {
  id: string;
  showId: string;
  boundaryEpisodeId: string | null;
  boundaryVersion: number;
  contentVersion: string;
  body: string;
  keyEvents: string[];
  suggestedQuestions: string[];
  evidenceIds: string[];
  createdAt: string;
}

export interface CharacterExplanation {
  characterId: string;
  name: string;
  knownSummary: string;
  relationships: Array<{
    relatedCharacterName: string;
    relationshipType: string;
    description: string;
  }>;
  firstAppearanceEpisode: string;
  evidenceIds: string[];
  boundarySnapshot: BoundarySnapshot;
}

export type AnswerStatus = 'verified' | 'refused_spoiler' | 'insufficient_evidence' | 'error';

export interface QuestionAnswer {
  id: string;
  sessionId: string;
  memberId: string;
  question: string;
  boundarySnapshot: BoundarySnapshot;
  answerStatus: AnswerStatus;
  answerBody: string;
  claims: string[];
  evidenceIds: string[];
  destination?: ResponseDestination;
  sourceClient?: 'phone' | 'extension' | 'fire-tv';
  createdAt: string;
}

// ==========================================
// AI & Spoiler Contracts
// ==========================================

export interface EvidenceItem {
  id: string;
  factText: string;
  episodeId: string;
  seasonNumber: number;
  episodeNumber: number;
  canonicalOrder: number;
  sourceId: string;
  characterName?: string | null;
}

export interface AiStructuredAnswer {
  answer: string;
  claims: string[];
  evidenceIds: string[];
  status: AnswerStatus;
  boundarySnapshot: BoundarySnapshot;
}

// ==========================================
// Real-time Event Definitions
// ==========================================

export type RealTimeEventName =
  | 'member.joined'
  | 'member.left'
  | 'member.progress_updated'
  | 'session.boundary_updated'
  | 'session.started'
  | 'session.ended'
  | 'question.submitted'
  | 'answer.ready'
  | 'extension.connected'
  | 'extension.disconnected'
  | 'extension.context.detected'
  | 'extension.context.confirmed'
  | 'extension.context.changed'
  | 'extension.session.joined'
  | 'extension.session.left'
  | 'extension.boundary.updated'
  | 'extension.recap.ready'
  | 'extension.question.submitted'
  | 'extension.answer.ready'
  | 'extension.command.dispatched'
  | 'extension.error';

export interface RealTimeEventPayloads {
  'member.joined': { sessionId: string; member: SessionMember };
  'member.left': { sessionId: string; memberId: string; reason: string };
  'member.progress_updated': { sessionId: string; memberId: string; lastWatchedEpisodeId: string | null };
  'session.boundary_updated': { sessionId: string; boundary: BoundarySnapshot };
  'session.started': { sessionId: string; boundary: BoundarySnapshot };
  'session.ended': { sessionId: string };
  'question.submitted': { sessionId: string; questionId: string; question: string; memberId: string; destination?: ResponseDestination; sourceClient?: string };
  'answer.ready': { sessionId: string; questionAnswer: QuestionAnswer };
  'extension.connected': { sessionId: string; extension: ExtensionDeviceState };
  'extension.disconnected': { sessionId: string; installationId: string };
  'extension.context.detected': { sessionId: string; installationId: string; context: DetectedStreamingContext };
  'extension.context.confirmed': { sessionId: string; installationId: string; context: DetectedStreamingContext };
  'extension.context.changed': { sessionId: string; installationId: string; context: DetectedStreamingContext };
  'extension.session.joined': { sessionId: string; installationId: string };
  'extension.session.left': { sessionId: string; installationId: string };
  'extension.boundary.updated': { sessionId: string; boundary: BoundarySnapshot };
  'extension.recap.ready': { sessionId: string; recap: Recap };
  'extension.question.submitted': { sessionId: string; questionId: string; question: string };
  'extension.answer.ready': { sessionId: string; questionAnswer: QuestionAnswer };
  'extension.command.dispatched': { sessionId: string; command: ExtensionCommand };
  'extension.error': { sessionId: string; installationId: string; message: string };
}

export interface RealTimeMessage<T extends RealTimeEventName = RealTimeEventName> {
  event: T;
  data: RealTimeEventPayloads[T];
  timestamp: string;
  version: number;
}

// ==========================================
// Zod Request / Response Validation Schemas
// ==========================================

export const CreateSessionSchema = z.object({
  showId: z.string().min(1, 'Show ID is required'),
  hostDisplayName: z.string().min(1, 'Host display name is required').max(50),
});
export type CreateSessionInput = z.infer<typeof CreateSessionSchema>;

export const JoinSessionSchema = z.object({
  invitationToken: z.string().optional(),
  roomCode: z.string().optional(),
  displayName: z.string().min(1, 'Display name is required').max(50),
  initialEpisodeId: z.string().nullable().optional(),
}).refine((data) => data.invitationToken || data.roomCode, {
  message: 'Either invitationToken or roomCode must be provided',
});
export type JoinSessionInput = z.infer<typeof JoinSessionSchema>;

export const UpdateProgressSchema = z.object({
  lastWatchedEpisodeId: z.string().nullable(),
});
export type UpdateProgressInput = z.infer<typeof UpdateProgressSchema>;

export const SubmitQuestionSchema = z.object({
  question: z.string().min(1, 'Question text cannot be empty').max(300),
  destination: z.enum(['all', 'sidepanel', 'tv', 'phone']).optional().default('all'),
  sourceClient: z.enum(['phone', 'extension', 'fire-tv']).optional().default('phone'),
});
export type SubmitQuestionInput = z.infer<typeof SubmitQuestionSchema>;

export const LinkExtensionSchema = z.object({
  installationId: z.string().min(1, 'installationId is required'),
  ownerId: z.string().min(1, 'ownerId is required'),
  sessionId: z.string().nullable().optional(),
  providerId: z.enum(['netflix', 'prime-video', 'hotstar', 'fallback']).nullable().optional(),
});
export type LinkExtensionInput = z.infer<typeof LinkExtensionSchema>;

export const UpdateExtensionContextSchema = z.object({
  context: z.object({
    providerId: z.enum(['netflix', 'prime-video', 'hotstar', 'fallback']),
    showTitle: z.string(),
    seasonNumber: z.number().nullable().optional(),
    episodeNumber: z.number().nullable().optional(),
    episodeTitle: z.string().nullable().optional(),
    canonicalContentId: z.string().nullable().optional(),
    detectionMethod: z.enum(['url', 'dom_metadata', 'dom_player', 'manual_confirmed', 'unverified']),
    confidence: z.number().min(0).max(1),
    lastDetectedAt: z.string(),
  }),
  isConfirmed: z.boolean().optional().default(false),
});
export type UpdateExtensionContextInput = z.infer<typeof UpdateExtensionContextSchema>;

export const DispatchExtensionCommandSchema = z.object({
  type: z.enum([
    'SET_ACTIVE_SESSION',
    'SET_CONTENT_CONTEXT',
    'REQUEST_RECAP',
    'REQUEST_CHARACTER_EXPLANATION',
    'SUBMIT_QUESTION',
    'SET_DISPLAY_DESTINATION',
    'DISCONNECT_EXTENSION',
  ]),
  payload: z.any().optional(),
  targetInstallationId: z.string().optional(),
});
export type DispatchExtensionCommandInput = z.infer<typeof DispatchExtensionCommandSchema>;
