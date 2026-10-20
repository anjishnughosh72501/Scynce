import { FastifyPluginAsync } from 'fastify';
import {
  CreateSessionSchema,
  JoinSessionSchema,
  UpdateProgressSchema,
  SubmitQuestionSchema,
} from '@scenesync/shared-types';
import { sessionService } from '../services/session.service.js';
import { contentService } from '../services/content.service.js';
import { realTimeBus } from '../ws/socket.js';

export const sessionRoutes: FastifyPluginAsync = async (fastify) => {
  // 1. Create Session
  fastify.post('/sessions', async (req, reply) => {
    const parse = CreateSessionSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.status(400).send({ success: false, errors: parse.error.format() });
    }

    try {
      const result = await sessionService.createSession(
        parse.data.showId,
        parse.data.hostDisplayName
      );

      return reply.status(201).send({
        success: true,
        session: result.session,
        roomCode: result.session.roomCode,
        hostMember: result.hostMember,
        invitationToken: result.invitationToken,
        joinUrl: result.joinUrl,
        qrCodeDataUrl: result.qrCodeDataUrl,
        boundary: result.boundary,
      });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // 2. Join Session
  fastify.post('/sessions/join', async (req, reply) => {
    const parse = JoinSessionSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.status(400).send({ success: false, errors: parse.error.format() });
    }

    try {
      const result = await sessionService.joinSession({
        invitationToken: parse.data.invitationToken,
        roomCode: parse.data.roomCode,
        displayName: parse.data.displayName,
        initialEpisodeId: parse.data.initialEpisodeId,
      });

      // Broadcast join and new boundary to all party participants
      realTimeBus.memberJoined(result.session.id, result.member);
      realTimeBus.boundaryUpdated(result.session.id, result.boundary);

      return reply.send({
        success: true,
        session: result.session,
        member: result.member,
        boundary: result.boundary,
      });
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  // 3. Get Session State
  fastify.get<{ Params: { id: string } }>('/sessions/:id', async (req, reply) => {
    try {
      const state = await sessionService.getSessionState(req.params.id);
      return reply.send({
        success: true,
        session: state.session,
        members: state.members,
        boundary: state.boundary,
        episodes: state.episodes,
      });
    } catch (err: any) {
      return reply.status(404).send({ success: false, error: err.message });
    }
  });

  // 4. Update Member Viewing Progress
  fastify.patch<{ Params: { id: string }; Headers: { 'x-member-id'?: string } }>(
    '/sessions/:id/progress',
    async (req, reply) => {
      const memberId = req.headers['x-member-id'] || (req.body as any)?.memberId;
      if (!memberId) {
        return reply.status(401).send({ success: false, error: 'Missing member identification' });
      }

      const parse = UpdateProgressSchema.safeParse(req.body);
      if (!parse.success) {
        return reply.status(400).send({ success: false, errors: parse.error.format() });
      }

      try {
        const { boundary, member } = await sessionService.updateMemberProgress(
          req.params.id,
          memberId,
          parse.data.lastWatchedEpisodeId
        );

        // Broadcast to TV and all companion clients
        realTimeBus.progressUpdated(
          req.params.id,
          memberId,
          parse.data.lastWatchedEpisodeId,
          boundary
        );

        return reply.send({ success: true, boundary, member });
      } catch (err: any) {
        return reply.status(400).send({ success: false, error: err.message });
      }
    }
  );

  // 5. Start Session
  fastify.post<{ Params: { id: string } }>('/sessions/:id/start', async (req, reply) => {
    try {
      await sessionService.startSession(req.params.id);
      const state = await sessionService.getSessionState(req.params.id);
      realTimeBus.sessionStarted(req.params.id, state.boundary);
      return reply.send({ success: true, boundary: state.boundary });
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  // 6. Get or Generate Shared Recap
  fastify.post<{ Params: { id: string } }>('/sessions/:id/recap', async (req, reply) => {
    try {
      const state = await sessionService.getSessionState(req.params.id);
      const recap = await contentService.getRecapForBoundary(
        state.session.showId,
        state.boundary
      );
      return reply.send({ success: true, recap, boundary: state.boundary });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // 7. Submit Q&A
  fastify.post<{ Params: { id: string }; Headers: { 'x-member-id'?: string } }>(
    '/sessions/:id/questions',
    async (req, reply) => {
      const memberId = req.headers['x-member-id'] || (req.body as any)?.memberId;
      if (!memberId) {
        return reply.status(401).send({ success: false, error: 'Missing member identification' });
      }

      const parse = SubmitQuestionSchema.safeParse(req.body);
      if (!parse.success) {
        return reply.status(400).send({ success: false, errors: parse.error.format() });
      }

      try {
        const state = await sessionService.getSessionState(req.params.id);

        // Answer using strict spoiler boundary and 2-stage claim validation
        const answer = await contentService.answerQuestion({
          sessionId: req.params.id,
          showId: state.session.showId,
          memberId,
          question: parse.data.question,
          currentBoundary: state.boundary,
          destination: parse.data.destination,
          sourceClient: parse.data.sourceClient,
        });

        // Broadcast question and verified answer
        realTimeBus.questionSubmitted(
          req.params.id,
          answer.id,
          parse.data.question,
          memberId,
          parse.data.destination,
          parse.data.sourceClient
        );
        realTimeBus.answerReady(req.params.id, answer);

        return reply.status(201).send({ success: true, answer });
      } catch (err: any) {
        return reply.status(500).send({ success: false, error: err.message });
      }
    }
  );

  // 8. End Session
  fastify.post<{ Params: { id: string } }>('/sessions/:id/end', async (req, reply) => {
    try {
      await sessionService.endSession(req.params.id);
      realTimeBus.sessionEnded(req.params.id);
      return reply.send({ success: true });
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  // 9. Leave Session
  fastify.post<{ Params: { id: string }; Headers: { 'x-member-id'?: string } }>(
    '/sessions/:id/leave',
    async (req, reply) => {
      const memberId = req.headers['x-member-id'] || (req.body as any)?.memberId;
      if (!memberId) {
        return reply.status(401).send({ success: false, error: 'Missing member identification' });
      }

      try {
        const { boundary } = await sessionService.removeMember(req.params.id, memberId);
        realTimeBus.memberLeft(req.params.id, memberId, 'User left party');
        realTimeBus.boundaryUpdated(req.params.id, boundary);
        return reply.send({ success: true, boundary });
      } catch (err: any) {
        return reply.status(400).send({ success: false, error: err.message });
      }
    }
  );

  // 10. Remove Member (Host action)
  fastify.delete<{ Params: { id: string; memberId: string } }>(
    '/sessions/:id/members/:memberId',
    async (req, reply) => {
      try {
        const { boundary } = await sessionService.removeMember(
          req.params.id,
          req.params.memberId
        );
        realTimeBus.memberLeft(req.params.id, req.params.memberId, 'Removed by host');
        realTimeBus.boundaryUpdated(req.params.id, boundary);
        return reply.send({ success: true, boundary });
      } catch (err: any) {
        return reply.status(400).send({ success: false, error: err.message });
      }
    }
  );
};
