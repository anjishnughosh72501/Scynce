import {
  AiProviderAdapter,
  RecapGenerationParams,
  CharacterExplanationParams,
  QuestionAnswerParams,
} from './types.js';
import {
  Recap,
  CharacterExplanation,
  AiStructuredAnswer,
} from '@scenesync/shared-types';
import { SAFE_SPOILER_FALLBACK } from '@scenesync/spoiler-policy';

export class MockDeterministicAiAdapter implements AiProviderAdapter {
  name = 'MockDeterministicAI';

  async generateRecap(params: RecapGenerationParams): Promise<Recap> {
    const { showId, showTitle, boundary, eligibleEvidence } = params;

    if (!boundary.boundaryEpisodeId || eligibleEvidence.length === 0) {
      return {
        id: `recap-${showId}-not-started`,
        showId,
        boundaryEpisodeId: null,
        boundaryVersion: boundary.boundaryVersion,
        contentVersion: 'v1',
        body: `Welcome to ${showTitle}! Your group has participants who have not started yet. When everyone begins, recaps up to your shared progress will appear here.`,
        keyEvents: ['Session initialized with participants at the beginning.'],
        suggestedQuestions: ['What is the premise of this show?'],
        evidenceIds: [],
        createdAt: new Date().toISOString(),
      };
    }

    const citedEvidence = eligibleEvidence.slice(0, 5);
    const keyEvents = eligibleEvidence.map((e) => `[S${e.seasonNumber}E${e.episodeNumber}] ${e.factText}`);

    const body = `Catch-up recap for ${showTitle} (${boundary.label}): So far in the story, key milestones have unfolded through Season ${boundary.seasonNumber} Episode ${boundary.episodeNumber}. All group members are caught up through this point.`;

    const suggestedQuestions = [
      `What happened at the climax of S${boundary.seasonNumber} E${boundary.episodeNumber}?`,
      `Who is allied with the protagonist up to this point?`,
      `What clues were revealed in the latest safe episode?`,
    ];

    return {
      id: `recap-${showId}-${boundary.boundaryEpisodeId}-v${boundary.boundaryVersion}`,
      showId,
      boundaryEpisodeId: boundary.boundaryEpisodeId,
      boundaryVersion: boundary.boundaryVersion,
      contentVersion: 'v1',
      body,
      keyEvents: keyEvents.slice(0, 6),
      suggestedQuestions,
      evidenceIds: citedEvidence.map((e) => e.id),
      createdAt: new Date().toISOString(),
    };
  }

  async generateCharacterExplanation(
    params: CharacterExplanationParams
  ): Promise<CharacterExplanation> {
    const { character, boundary, eligibleEvidence, knownRelationships = [] } = params;

    // Filter evidence specifically for this character or mentioning this character
    const charNameLower = character.name.toLowerCase();
    const characterEvidence = eligibleEvidence.filter(
      (e) =>
        e.characterName?.toLowerCase() === charNameLower ||
        e.factText.toLowerCase().includes(charNameLower)
    );

    if (characterEvidence.length === 0) {
      return {
        characterId: character.id,
        name: character.name,
        knownSummary: `${character.name} has not made a significant verified appearance up to your group's viewing boundary (${boundary.label}).`,
        relationships: [],
        firstAppearanceEpisode: 'Not yet reached',
        evidenceIds: [],
        boundarySnapshot: boundary,
      };
    }

    const summary = `${character.name} as known through ${boundary.label}: Active participant in key verified events without revealing any future plot developments.`;

    return {
      characterId: character.id,
      name: character.name,
      knownSummary: summary,
      relationships: knownRelationships,
      firstAppearanceEpisode: `S${characterEvidence[0]?.seasonNumber} E${characterEvidence[0]?.episodeNumber}`,
      evidenceIds: characterEvidence.map((e) => e.id),
      boundarySnapshot: boundary,
    };
  }

  async answerQuestion(params: QuestionAnswerParams): Promise<AiStructuredAnswer> {
    const { question, boundary, eligibleEvidence } = params;
    const qLower = question.toLowerCase();

    // 1. Detect Adversarial Prompt Injection or explicit requests for future spoilers
    const isAdversarial =
      qLower.includes('ignore all') ||
      qLower.includes('system prompt') ||
      qLower.includes('ending') ||
      qLower.includes('who dies') ||
      qLower.includes('tell me the finale') ||
      qLower.includes('general knowledge') ||
      qLower.includes('future episode') ||
      qLower.includes('season finale');

    if (isAdversarial) {
      return {
        answer: SAFE_SPOILER_FALLBACK,
        claims: [],
        evidenceIds: [],
        status: 'refused_spoiler',
        boundarySnapshot: boundary,
      };
    }

    // 2. Score eligible evidence by keyword relevance
    const tokens = qLower
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 3);

    const matchingWithScores = eligibleEvidence
      .map((e) => {
        const factLower = e.factText.toLowerCase();
        const charLower = e.characterName?.toLowerCase() || '';
        let score = 0;
        for (const t of tokens) {
          if (factLower.includes(t)) score += 2;
          if (charLower.includes(t)) score += 1;
        }
        return { evidence: e, score };
      })
      .filter((item) => item.score > 0);

    if (matchingWithScores.length === 0) {
      return {
        answer: SAFE_SPOILER_FALLBACK,
        claims: [],
        evidenceIds: [],
        status: 'insufficient_evidence',
        boundarySnapshot: boundary,
      };
    }

    // Sort by highest score, then most recent safe episode
    matchingWithScores.sort(
      (a, b) => b.score - a.score || b.evidence.canonicalOrder - a.evidence.canonicalOrder
    );

    const topEvidence = matchingWithScores.slice(0, 3).map((item) => item.evidence);
    const answer = `Based on what your group has watched up to ${boundary.label}: ${topEvidence
      .map((e) => e.factText)
      .join(' ')}`;

    return {
      answer,
      claims: topEvidence.map((e) => e.factText),
      evidenceIds: topEvidence.map((e) => e.id),
      status: 'verified',
      boundarySnapshot: boundary,
    };
  }
}
