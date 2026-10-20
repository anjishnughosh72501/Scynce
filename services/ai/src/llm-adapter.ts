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
import { MockDeterministicAiAdapter } from './mock-adapter.js';

export interface LlmAdapterConfig {
  apiKey?: string;
  baseUrl?: string;
  modelName?: string;
}

/**
 * Universal LLM Adapter
 * Integrates with OpenAI / Gemini compatible endpoints when credentials are provided.
 * Injects ONLY server-side filtered eligible evidence into the prompt context.
 * Falls back to MockDeterministicAiAdapter when no live key is present.
 */
export class UniversalLlmAdapter implements AiProviderAdapter {
  name = 'UniversalLlmAdapter';
  private fallbackAdapter = new MockDeterministicAiAdapter();
  private config: LlmAdapterConfig;

  constructor(config: LlmAdapterConfig = {}) {
    this.config = {
      apiKey: config.apiKey || process.env.AI_API_KEY || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY,
      baseUrl: config.baseUrl || process.env.AI_BASE_URL || 'https://api.openai.com/v1',
      modelName: config.modelName || process.env.AI_MODEL || 'gpt-4o-mini',
    };
  }

  async generateRecap(params: RecapGenerationParams): Promise<Recap> {
    if (!this.config.apiKey) {
      return this.fallbackAdapter.generateRecap(params);
    }

    try {
      // If live API key is provided, we query with strict system instructions and evidence context
      const evidenceContext = params.eligibleEvidence
        .map((e) => `[Evidence ID: ${e.id}] (S${e.seasonNumber}E${e.episodeNumber}): ${e.factText}`)
        .join('\n');

      const systemPrompt = `You are SceneSync TV Companion. Generate a spoiler-safe recap strictly using the provided Evidence.
DO NOT assume or mention any facts outside the provided evidence.
The viewing boundary is: ${params.boundary.label}.
Return JSON with format:
{"body": "...", "keyEvents": ["..."], "suggestedQuestions": ["..."], "evidenceIds": ["id1", "id2"]}`;

      const res = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.modelName,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Evidence items:\n${evidenceContext}` },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.2,
        }),
      });

      if (!res.ok) {
        return this.fallbackAdapter.generateRecap(params);
      }

      const data = (await res.json()) as any;
      const content = JSON.parse(data.choices[0].message.content);

      return {
        id: `recap-${params.showId}-${params.boundary.boundaryEpisodeId}-v${params.boundary.boundaryVersion}`,
        showId: params.showId,
        boundaryEpisodeId: params.boundary.boundaryEpisodeId,
        boundaryVersion: params.boundary.boundaryVersion,
        contentVersion: 'v1',
        body: content.body,
        keyEvents: content.keyEvents || [],
        suggestedQuestions: content.suggestedQuestions || [],
        evidenceIds: content.evidenceIds || [],
        createdAt: new Date().toISOString(),
      };
    } catch {
      return this.fallbackAdapter.generateRecap(params);
    }
  }

  async generateCharacterExplanation(
    params: CharacterExplanationParams
  ): Promise<CharacterExplanation> {
    return this.fallbackAdapter.generateCharacterExplanation(params);
  }

  async answerQuestion(params: QuestionAnswerParams): Promise<AiStructuredAnswer> {
    if (!this.config.apiKey) {
      return this.fallbackAdapter.answerQuestion(params);
    }

    try {
      const evidenceContext = params.eligibleEvidence
        .map((e) => `[ID: ${e.id}] ${e.factText}`)
        .join('\n');

      const systemPrompt = `You are a TV watch party assistant. You must ONLY answer using the provided verified evidence.
Group boundary: ${params.boundary.label}.
If the answer is not supported by the evidence or requires future episodes, respond with status "refused_spoiler" and answer: "${SAFE_SPOILER_FALLBACK}".
Format output strictly as JSON:
{"answer": "...", "claims": ["..."], "evidenceIds": ["id1"], "status": "verified" | "refused_spoiler" | "insufficient_evidence"}`;

      const res = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.modelName,
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: `Question: ${params.question}\n\nEvidence:\n${evidenceContext}`,
            },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.1,
        }),
      });

      if (!res.ok) {
        return this.fallbackAdapter.answerQuestion(params);
      }

      const data = (await res.json()) as any;
      const parsed = JSON.parse(data.choices[0].message.content);

      return {
        answer: parsed.answer || SAFE_SPOILER_FALLBACK,
        claims: parsed.claims || [],
        evidenceIds: parsed.evidenceIds || [],
        status: parsed.status || 'verified',
        boundarySnapshot: params.boundary,
      };
    } catch {
      return this.fallbackAdapter.answerQuestion(params);
    }
  }
}
