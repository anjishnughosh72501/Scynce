import { Server as SocketIOServer } from 'socket.io';
import {
  RealTimeEventName,
  RealTimeEventPayloads,
  SessionMember,
  BoundarySnapshot,
  QuestionAnswer,
  ExtensionDeviceState,
  DetectedStreamingContext,
  ExtensionCommand,
  Recap,
  ResponseDestination,
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

    socket.on('join-extension', (installationId: string) => {
      socket.join(`extension:${installationId}`);
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
    emitSessionEvent(sessionId, 'extension.boundary.updated', { sessionId, boundary });
  },
  sessionStarted(sessionId: string, boundary: BoundarySnapshot) {
    emitSessionEvent(sessionId, 'session.started', { sessionId, boundary });
  },
  sessionEnded(sessionId: string) {
    emitSessionEvent(sessionId, 'session.ended', { sessionId });
  },
  questionSubmitted(
    sessionId: string,
    questionId: string,
    question: string,
    memberId: string,
    destination: ResponseDestination = 'all',
    sourceClient: string = 'phone'
  ) {
    emitSessionEvent(sessionId, 'question.submitted', {
      sessionId,
      questionId,
      question,
      memberId,
      destination,
      sourceClient,
    });
  },
  answerReady(sessionId: string, questionAnswer: QuestionAnswer) {
    emitSessionEvent(sessionId, 'answer.ready', { sessionId, questionAnswer });
    emitSessionEvent(sessionId, 'extension.answer.ready', { sessionId, questionAnswer });
  },
  recapReady(sessionId: string, recap: Recap) {
    emitSessionEvent(sessionId, 'extension.recap.ready', { sessionId, recap });
  },

  // Extension specific events
  extensionConnected(sessionId: string, extension: ExtensionDeviceState) {
    emitSessionEvent(sessionId, 'extension.connected', { sessionId, extension });
  },
  extensionDisconnected(sessionId: string, installationId: string) {
    emitSessionEvent(sessionId, 'extension.disconnected', { sessionId, installationId });
  },
  extensionContextDetected(
    sessionId: string,
    installationId: string,
    context: DetectedStreamingContext
  ) {
    emitSessionEvent(sessionId, 'extension.context.detected', {
      sessionId,
      installationId,
      context,
    });
  },
  extensionContextConfirmed(
    sessionId: string,
    installationId: string,
    context: DetectedStreamingContext
  ) {
    emitSessionEvent(sessionId, 'extension.context.confirmed', {
      sessionId,
      installationId,
      context,
    });
  },
  extensionCommandDispatched(sessionId: string, command: ExtensionCommand) {
    emitSessionEvent(sessionId, 'extension.command.dispatched', {
      sessionId,
      command,
    });
  },
};
