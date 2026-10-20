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
  | 'answer.ready';

export interface RealTimeEventPayloads {
  'member.joined': { sessionId: string; member: SessionMember };
  'member.left': { sessionId: string; memberId: string; reason: string };
  'member.progress_updated': { sessionId: string; memberId: string; lastWatchedEpisodeId: string | null };
  'session.boundary_updated': { sessionId: string; boundary: BoundarySnapshot };
  'session.started': { sessionId: string; boundary: BoundarySnapshot };
  'session.ended': { sessionId: string };
  'question.submitted': { sessionId: string; questionId: string; question: string; memberId: string };
  'answer.ready': { sessionId: string; questionAnswer: QuestionAnswer };
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
}).refine(data => data.invitationToken || data.roomCode, {
  message: 'Either invitationToken or roomCode must be provided',
});
export type JoinSessionInput = z.infer<typeof JoinSessionSchema>;

export const UpdateProgressSchema = z.object({
  lastWatchedEpisodeId: z.string().nullable(),
});
export type UpdateProgressInput = z.infer<typeof UpdateProgressSchema>;

export const SubmitQuestionSchema = z.object({
  question: z.string().min(1, 'Question text cannot be empty').max(300),
});
export type SubmitQuestionInput = z.infer<typeof SubmitQuestionSchema>;
