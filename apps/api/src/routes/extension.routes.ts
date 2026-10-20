import { FastifyPluginAsync } from 'fastify';
import {
  LinkExtensionSchema,
  UpdateExtensionContextSchema,
  DispatchExtensionCommandSchema,
} from '@scenesync/shared-types';
import { extensionService } from '../services/extension.service.js';
import { sessionService } from '../services/session.service.js';

export const extensionRoutes: FastifyPluginAsync = async (fastify) => {
  // 1. Link an extension installation to a user/session
  fastify.post('/extensions/link', async (req, reply) => {
    const parse = LinkExtensionSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.status(400).send({ success: false, errors: parse.error.format() });
    }

    try {
      const linking = await extensionService.linkExtension(parse.data);
      let sessionState = null;
      if (linking.sessionId) {
        sessionState = await sessionService.getSessionState(linking.sessionId);
      }

      return reply.status(200).send({
        success: true,
        linking,
        sessionState,
      });
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  // 2. Revoke an extension installation
  fastify.post<{ Params: { installationId: string } }>(
    '/extensions/:installationId/revoke',
    async (req, reply) => {
      try {
        await extensionService.revokeExtension(req.params.installationId);
        return reply.send({ success: true, message: 'Extension installation revoked' });
      } catch (err: any) {
        return reply.status(400).send({ success: false, error: err.message });
      }
    }
  );

  // 3. Report detected or confirmed streaming content context
  fastify.post<{ Params: { installationId: string } }>(
    '/extensions/:installationId/context',
    async (req, reply) => {
      const parse = UpdateExtensionContextSchema.safeParse(req.body);
      if (!parse.success) {
        return reply.status(400).send({ success: false, errors: parse.error.format() });
      }

      try {
        const linking = await extensionService.updateContext(
          req.params.installationId,
          parse.data.context,
          parse.data.isConfirmed
        );

        return reply.send({ success: true, linking });
      } catch (err: any) {
        return reply.status(400).send({ success: false, error: err.message });
      }
    }
  );

  // 4. Get Extension State
  fastify.get<{ Params: { installationId: string } }>(
    '/extensions/:installationId',
    async (req, reply) => {
      const state = await extensionService.getExtensionState(req.params.installationId);
      if (!state) {
        return reply.status(404).send({ success: false, error: 'Extension not found' });
      }

      let sessionState = null;
      if (state.sessionId && state.connectionStatus !== 'revoked') {
        sessionState = await sessionService.getSessionState(state.sessionId);
      }

      return reply.send({ success: true, extension: state, sessionState });
    }
  );

  // 5. Get all active extensions for a session
  fastify.get<{ Params: { id: string } }>(
    '/sessions/:id/extensions',
    async (req, reply) => {
      try {
        const extensions = await extensionService.getSessionExtensions(req.params.id);
        return reply.send({ success: true, extensions });
      } catch (err: any) {
        return reply.status(400).send({ success: false, error: err.message });
      }
    }
  );

  // 6. Send authorized UI command to connected extensions (from Companion or TV)
  fastify.post<{
    Params: { id: string };
    Headers: { 'x-member-id'?: string };
  }>('/sessions/:id/extensions/command', async (req, reply) => {
    const memberId = req.headers['x-member-id'] || (req.body as any)?.memberId || 'anonymous';
    const parse = DispatchExtensionCommandSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.status(400).send({ success: false, errors: parse.error.format() });
    }

    try {
      const command = await extensionService.dispatchCommand(
        req.params.id,
        {
          type: parse.data.type,
          payload: parse.data.payload,
        },
        memberId
      );

      return reply.send({ success: true, command });
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });
};
