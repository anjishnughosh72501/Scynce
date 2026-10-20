import { Server as SocketIOServer } from 'socket.io';
import {
  RealTimeEventName,
  RealTimeEventPayloads,
  SessionMember,
  BoundarySnapshot,
  QuestionAnswer,
} from '@scenesync/shared-types';

let ioInstance: SocketIOServer | null = null;

export function initSocketServer(io: SocketIOServer) {
  ioInstance = io;

  io.on('connection', (socket) => {
    socket.on('join-session', (sessionId: string) => {
      socket.join(`session:${sessionId}`);
    });

    socket.on('leave-session', (sessionId: string) => {
      socket.leave(`session:${sessionId}`);
    });
  });
}

export function emitSessionEvent<T extends RealTimeEventName>(
  sessionId: string,
  event: T,
  payload: RealTimeEventPayloads[T]
) {
  if (!ioInstance) return;
  ioInstance.to(`session:${sessionId}`).emit(event, {
    event,
    data: payload,
    timestamp: new Date().toISOString(),
  });
}

export const realTimeBus = {
  memberJoined(sessionId: string, member: SessionMember) {
    emitSessionEvent(sessionId, 'member.joined', { sessionId, member });
  },
  memberLeft(sessionId: string, memberId: string, reason: string) {
    emitSessionEvent(sessionId, 'member.left', { sessionId, memberId, reason });
  },
  progressUpdated(
    sessionId: string,
    memberId: string,
    lastWatchedEpisodeId: string | null,
    boundary: BoundarySnapshot
  ) {
    emitSessionEvent(sessionId, 'member.progress_updated', {
      sessionId,
      memberId,
      lastWatchedEpisodeId,
    });
    emitSessionEvent(sessionId, 'session.boundary_updated', {
      sessionId,
      boundary,
    });
  },
  boundaryUpdated(sessionId: string, boundary: BoundarySnapshot) {
    emitSessionEvent(sessionId, 'session.boundary_updated', { sessionId, boundary });
  },
  sessionStarted(sessionId: string, boundary: BoundarySnapshot) {
    emitSessionEvent(sessionId, 'session.started', { sessionId, boundary });
  },
  sessionEnded(sessionId: string) {
    emitSessionEvent(sessionId, 'session.ended', { sessionId });
  },
  questionSubmitted(sessionId: string, questionId: string, question: string, memberId: string) {
    emitSessionEvent(sessionId, 'question.submitted', {
      sessionId,
      questionId,
      question,
      memberId,
    });
  },
  answerReady(sessionId: string, questionAnswer: QuestionAnswer) {
    emitSessionEvent(sessionId, 'answer.ready', { sessionId, questionAnswer });
  },
};
