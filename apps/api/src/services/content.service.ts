import { pool } from '../db/client.js';
import {
  Show,
  Episode,
  Character,
  Fact,
  Recap,
  CharacterExplanation,
  QuestionAnswer,
  BoundarySnapshot,
} from '@scenesync/shared-types';
import {
  filterEligibleEvidence,
  validateAiAnswer,
  generateRecapCacheKey,
  generateQuestionCacheKey,
  generateCharacterCacheKey,
} from '@scenesync/spoiler-policy';
import { MockDeterministicAiAdapter, UniversalLlmAdapter, AiProviderAdapter } from '@scenesync/ai';
import { nanoid } from 'nanoid';

// In-memory response cache keyed strictly with showId + boundary + contentVersion
const responseCache = new Map<string, any>();

export class ContentService {
  private aiAdapter: AiProviderAdapter;

  constructor() {
    // If live key is provided, UniversalLlmAdapter is used, else MockDeterministicAiAdapter
    this.aiAdapter = process.env.AI_API_KEY
      ? new UniversalLlmAdapter()
      : new MockDeterministicAiAdapter();
  }

  async getAllShows(): Promise<Show[]> {
    const res = await pool.query<any>(
      `SELECT id, title, description, poster_url as "posterUrl", status FROM shows WHERE status = 'active'`
    );
    return res.rows;
  }

  async getShowById(showId: string): Promise<Show | null> {
    const res = await pool.query<any>(
      `SELECT id, title, description, poster_url as "posterUrl", status FROM shows WHERE id = $1`,
      [showId]
    );
    return res.rows[0] || null;
  }

  async getEpisodesForShow(showId: string): Promise<Episode[]> {
    const res = await pool.query<any>(
      `SELECT id, show_id as "showId", season_number as "seasonNumber",
              episode_number as "episodeNumber", title, canonical_order as "canonicalOrder",
              content_status as "contentStatus"
       FROM episodes
       WHERE show_id = $1
       ORDER BY canonical_order ASC`,
      [showId]
    );
    return res.rows;
  }

  async getCharactersForShow(showId: string): Promise<Character[]> {
    const res = await pool.query<any>(
      `SELECT id, show_id as "showId", name, image_url as "imageUrl",
              first_appearance_episode_id as "firstAppearanceEpisodeId"
       FROM characters
       WHERE show_id = $1`,
      [showId]
    );
    return res.rows;
  }

  async getFactsForShow(showId: string): Promise<Fact[]> {
    const res = await pool.query<any>(
      `SELECT id, show_id as "showId", episode_id as "episodeId", character_id as "characterId",
              fact_text as "factText", source_id as "sourceId", verification_status as "verificationStatus"
       FROM facts
       WHERE show_id = $1`,
      [showId]
    );
    return res.rows;
  }

  async getRecapForBoundary(showId: string, boundary: BoundarySnapshot): Promise<Recap> {
    const cacheKey = generateRecapCacheKey(showId, boundary, 'v1');
    if (responseCache.has(cacheKey)) {
      return responseCache.get(cacheKey);
    }

    // Check DB cache
    const dbRes = await pool.query<any>(
      `SELECT id, show_id as "showId", boundary_episode_id as "boundaryEpisodeId",
              boundary_version as "boundaryVersion", content_version as "contentVersion",
              body, key_events as "keyEvents", suggested_questions as "suggestedQuestions",
              evidence_ids as "evidenceIds", created_at as "createdAt"
       FROM recaps
       WHERE show_id = $1 AND boundary_episode_id IS NOT DISTINCT FROM $2 AND boundary_version = $3`,
      [showId, boundary.boundaryEpisodeId, boundary.boundaryVersion]
    );

    if (dbRes.rows.length > 0) {
      const cached = dbRes.rows[0];
      responseCache.set(cacheKey, cached);
      return cached;
    }

    const [show, episodes, characters, facts] = await Promise.all([
      this.getShowById(showId),
      this.getEpisodesForShow(showId),
      this.getCharactersForShow(showId),
      this.getFactsForShow(showId),
    ]);

    if (!show) {
      throw new Error(`Show ${showId} not found`);
    }

    // Filter evidence strictly up to boundary
    const eligibleEvidence = filterEligibleEvidence(facts, episodes, boundary, characters);

    const recap = await this.aiAdapter.generateRecap({
      showId,
      showTitle: show.title,
      boundary,
      eligibleEvidence,
    });

    // Save to DB and cache
    await pool.query(
      `INSERT INTO recaps (id, show_id, boundary_episode_id, boundary_version, content_version, body, key_events, suggested_questions, evidence_ids)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO NOTHING`,
      [
        recap.id,
        recap.showId,
        recap.boundaryEpisodeId,
        recap.boundaryVersion,
        recap.contentVersion,
        recap.body,
        JSON.stringify(recap.keyEvents),
        JSON.stringify(recap.suggestedQuestions),
        JSON.stringify(recap.evidenceIds),
      ]
    );

    responseCache.set(cacheKey, recap);
    return recap;
  }

  async getCharacterExplanation(
    showId: string,
    characterId: string,
    boundary: BoundarySnapshot
  ): Promise<CharacterExplanation> {
    const cacheKey = generateCharacterCacheKey(showId, characterId, boundary, 'v1');
    if (responseCache.has(cacheKey)) {
      return responseCache.get(cacheKey);
    }

    const [show, episodes, characters, facts] = await Promise.all([
      this.getShowById(showId),
      this.getEpisodesForShow(showId),
      this.getCharactersForShow(showId),
      this.getFactsForShow(showId),
    ]);

    const character = characters.find((c) => c.id === characterId);
    if (!character) {
      throw new Error(`Character ${characterId} not found`);
    }

    // Fetch relationships
    const relRes = await pool.query<any>(
      `SELECT r.relationship_type as "relationshipType", r.description, c.name as "relatedCharacterName",
              e.canonical_order as "canonicalOrder"
       FROM relationships r
       JOIN characters c ON r.related_character_id = c.id
       JOIN episodes e ON r.established_episode_id = e.id
       WHERE r.character_id = $1`,
      [characterId]
    );

    // Filter relationships established strictly <= boundary
    const safeRelationships = relRes.rows
      .filter((r) => boundary.canonicalOrder !== null && r.canonicalOrder <= boundary.canonicalOrder)
      .map((r) => ({
        relatedCharacterName: r.relatedCharacterName,
        relationshipType: r.relationshipType,
        description: r.description,
      }));

    const eligibleEvidence = filterEligibleEvidence(facts, episodes, boundary, characters);

    const explanation = await this.aiAdapter.generateCharacterExplanation({
      showTitle: show?.title || 'Watch Party',
      character,
      boundary,
      eligibleEvidence,
      knownRelationships: safeRelationships,
    });

    responseCache.set(cacheKey, explanation);
    return explanation;
  }

  async answerQuestion(params: {
    sessionId: string;
    showId: string;
    memberId: string;
    question: string;
    currentBoundary: BoundarySnapshot;
    destination?: 'all' | 'sidepanel' | 'tv' | 'phone';
    sourceClient?: 'phone' | 'extension' | 'fire-tv';
  }): Promise<QuestionAnswer> {
    const {
      sessionId,
      showId,
      memberId,
      question,
      currentBoundary,
      destination = 'all',
      sourceClient = 'phone',
    } = params;
    const questionId = `qa_${nanoid(12)}`;

    // Cache check
    const cacheKey = generateQuestionCacheKey(showId, currentBoundary, question, 'v1');
    if (responseCache.has(cacheKey)) {
      const cached = responseCache.get(cacheKey);
      return {
        ...cached,
        id: questionId,
        sessionId,
        memberId,
        destination,
        sourceClient,
        createdAt: new Date().toISOString(),
      };
    }

    const [show, episodes, characters, facts] = await Promise.all([
      this.getShowById(showId),
      this.getEpisodesForShow(showId),
      this.getCharactersForShow(showId),
      this.getFactsForShow(showId),
    ]);

    // 1. Retrieve ONLY eligible evidence under the authoritative boundary
    const eligibleEvidence = filterEligibleEvidence(facts, episodes, currentBoundary, characters);

    // 2. Stage 1: AI generation
    const rawAnswer = await this.aiAdapter.answerQuestion({
      showTitle: show?.title || 'Watch Party',
      question,
      boundary: currentBoundary,
      eligibleEvidence,
    });

    // 3. Stage 2: Claim & Evidence Validation against server-side ground truth
    const validation = validateAiAnswer(rawAnswer, eligibleEvidence, currentBoundary, {
      sessionId,
      memberId,
      questionId,
      question,
    });

    const finalAnswer: QuestionAnswer = {
      ...validation.sanitizedAnswer,
      destination,
      sourceClient,
    };

    // 4. Persist QA record into database
    await pool.query(
      `INSERT INTO questions_and_answers (
        id, session_id, member_id, question, boundary_snapshot, answer_status, answer_body, claims, evidence_ids, destination, source_client
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        finalAnswer.id,
        finalAnswer.sessionId,
        finalAnswer.memberId,
        finalAnswer.question,
        JSON.stringify(finalAnswer.boundarySnapshot),
        finalAnswer.answerStatus,
        finalAnswer.answerBody,
        JSON.stringify(finalAnswer.claims),
        JSON.stringify(finalAnswer.evidenceIds),
        finalAnswer.destination,
        finalAnswer.sourceClient,
      ]
    );

    // Cache verified answers
    if (finalAnswer.answerStatus === 'verified') {
      responseCache.set(cacheKey, finalAnswer);
    }

    return finalAnswer;
  }
}

export const contentService = new ContentService();
