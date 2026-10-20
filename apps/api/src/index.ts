import { buildServer } from './server.js';

const PORT = parseInt(process.env.PORT || '4000', 10);
const HOST = process.env.HOST || '0.0.0.0';

const server = buildServer();

async function start() {
  try {
    await server.listen({ port: PORT, host: HOST });
    console.log(`[SceneSync API] Server listening on http://${HOST}:${PORT}`);
  } catch (err) {
    console.error('[SceneSync API Error]:', err);
    process.exit(1);
  }
}

start();
