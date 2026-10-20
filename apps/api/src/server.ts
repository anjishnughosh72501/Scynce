import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Server as SocketIOServer } from 'socket.io';
import { initSocketServer } from './ws/socket.js';
import { catalogRoutes } from './routes/catalog.routes.js';
import { sessionRoutes } from './routes/sessions.routes.js';

export function buildServer() {
  const fastify = Fastify({
    logger: false,
  });

  fastify.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  // Health check
  fastify.get('/health', async () => ({
    status: 'ok',
    service: 'SceneSync API',
    timestamp: new Date().toISOString(),
  }));

  // Register API routes
  fastify.register(catalogRoutes, { prefix: '/api' });
  fastify.register(sessionRoutes, { prefix: '/api' });

  // Socket.io initialization
  const io = new SocketIOServer(fastify.server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  initSocketServer(io);

  return fastify;
}
