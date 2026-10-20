import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool, withTransaction } from './client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runSeed() {
  console.log('[Seed] Seeding SceneSync catalog...');
  const seedPath = path.resolve(__dirname, '../../../../content/seed-data.json');
  const data = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));

  await withTransaction(async (client) => {
    // 1. Shows
    for (const s of data.shows) {
      await client.query(
        `INSERT INTO shows (id, title, description, poster_url, status)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE
         SET title = EXCLUDED.title, description = EXCLUDED.description, poster_url = EXCLUDED.poster_url`,
        [s.id, s.title, s.description, s.posterUrl, s.status]
      );
    }

    // 2. Episodes
    for (const ep of data.episodes) {
      await client.query(
        `INSERT INTO episodes (id, show_id, season_number, episode_number, title, canonical_order, content_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE
         SET title = EXCLUDED.title, canonical_order = EXCLUDED.canonical_order`,
        [ep.id, ep.showId, ep.seasonNumber, ep.episodeNumber, ep.title, ep.canonicalOrder, ep.contentStatus]
      );
    }

    // 3. Characters
    for (const c of data.characters) {
      await client.query(
        `INSERT INTO characters (id, show_id, name, image_url, first_appearance_episode_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE
         SET name = EXCLUDED.name, image_url = EXCLUDED.image_url`,
        [c.id, c.showId, c.name, c.imageUrl, c.firstAppearanceEpisodeId]
      );
    }

    // 4. Relationships
    for (const r of data.relationships) {
      await client.query(
        `INSERT INTO relationships (id, character_id, related_character_id, relationship_type, established_episode_id, description)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE
         SET description = EXCLUDED.description`,
        [r.id, r.characterId, r.relatedCharacterId, r.relationshipType, r.establishedEpisodeId, r.description]
      );
    }

    // 5. Facts
    for (const f of data.facts) {
      await client.query(
        `INSERT INTO facts (id, show_id, episode_id, character_id, fact_text, source_id, verification_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE
         SET fact_text = EXCLUDED.fact_text, verification_status = EXCLUDED.verification_status`,
        [f.id, f.showId, f.episodeId, f.characterId, f.factText, f.sourceId, f.verificationStatus]
      );
    }
  });

  console.log('[Seed] Database seeded successfully with curated catalog & episodes.');
  await pool.end();
}

runSeed().catch((err) => {
  console.error('[Seed Error]:', err);
  process.exit(1);
});
