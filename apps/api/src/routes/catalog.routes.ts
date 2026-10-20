import { FastifyPluginAsync } from 'fastify';
import { contentService } from '../services/content.service.js';
import { BoundarySnapshot } from '@scenesync/shared-types';

export const catalogRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/shows', async (_req, reply) => {
    const shows = await contentService.getAllShows();
    return reply.send({ success: true, shows });
  });

  fastify.get<{ Params: { id: string } }>('/shows/:id', async (req, reply) => {
    const show = await contentService.getShowById(req.params.id);
    if (!show) {
      return reply.status(404).send({ success: false, error: 'Show not found' });
    }

    const [episodes, characters] = await Promise.all([
      contentService.getEpisodesForShow(req.params.id),
      contentService.getCharactersForShow(req.params.id),
    ]);

    return reply.send({
      success: true,
      show,
      episodes,
      characters,
    });
  });

  fastify.get<{
    Params: { id: string; characterId: string };
    Querystring: { boundaryOrder?: string };
  }>('/shows/:id/characters/:characterId', async (req, reply) => {
    const { id, characterId } = req.params;
    const order = req.query.boundaryOrder ? parseInt(req.query.boundaryOrder, 10) : null;

    const boundary: BoundarySnapshot = {
      boundaryEpisodeId: null,
      seasonNumber: null,
      episodeNumber: null,
      canonicalOrder: order,
      boundaryVersion: 1,
      calculatedAt: new Date().toISOString(),
      eligibleMemberCount: 1,
      isSafe: true,
      label: order !== null ? `Safe through Order ${order}` : 'Not Started',
    };

    try {
      const explanation = await contentService.getCharacterExplanation(id, characterId, boundary);
      return reply.send({ success: true, explanation });
    } catch (err: any) {
      return reply.status(404).send({ success: false, error: err.message });
    }
  });
};
