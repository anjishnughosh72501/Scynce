import {
  AiStructuredAnswer,
  EvidenceItem,
  BoundarySnapshot,
  QuestionAnswer,
} from '@scenesync/shared-types';

export const SAFE_SPOILER_FALLBACK =
  "I can't verify an answer using information your group has watched so far.";

export interface ClaimValidationResult {
  isValid: boolean;
  sanitizedAnswer: QuestionAnswer;
  violationReason?: string;
}

/**
 * Validates AI structured answers against server-side eligible evidence and boundary state.
 * Implements Stage 2 verification:
 * - Checks boundary snapshot parity
 * - Checks evidence ID provenance
 * - Rejects any citations not in the authorized retrieval package
 * - Neutralizes any leakage in refusal messages
 */
export function validateAiAnswer(
  rawAnswer: AiStructuredAnswer,
  eligibleEvidence: EvidenceItem[],
  currentBoundary: BoundarySnapshot,
  metadata: { sessionId: string; memberId: string; questionId: string; question: string }
): ClaimValidationResult {
  const eligibleIdSet = new Set(eligibleEvidence.map((e) => e.id));

  // 1. Boundary version and canonical order match
  const boundaryStale =
    rawAnswer.boundarySnapshot.boundaryEpisodeId !== currentBoundary.boundaryEpisodeId ||
    rawAnswer.boundarySnapshot.canonicalOrder !== currentBoundary.canonicalOrder;

  if (boundaryStale) {
    return {
      isValid: false,
      sanitizedAnswer: {
        id: metadata.questionId,
        sessionId: metadata.sessionId,
        memberId: metadata.memberId,
        question: metadata.question,
        boundarySnapshot: currentBoundary,
        answerStatus: 'insufficient_evidence',
        answerBody:
          'The group viewing boundary changed while generating your answer. Please ask again.',
        claims: [],
        evidenceIds: [],
        createdAt: new Date().toISOString(),
      },
      violationReason: 'Boundary changed during generation',
    };
  }

  // 2. If refused spoiler or insufficient evidence, sanitize answer
  if (rawAnswer.status === 'refused_spoiler' || rawAnswer.status === 'insufficient_evidence') {
    // Ensure no leakage in refusal text (e.g. "Wait until episode 8 to find out!")
    const leaksFutureEpisode = /episode\s*\d+|season\s*\d+|in\s*S\d+|later\s*in/i.test(
      rawAnswer.answer
    );
    const safeBody = leaksFutureEpisode ? SAFE_SPOILER_FALLBACK : rawAnswer.answer || SAFE_SPOILER_FALLBACK;

    return {
      isValid: true,
      sanitizedAnswer: {
        id: metadata.questionId,
        sessionId: metadata.sessionId,
        memberId: metadata.memberId,
        question: metadata.question,
        boundarySnapshot: currentBoundary,
        answerStatus: rawAnswer.status,
        answerBody: safeBody,
        claims: [],
        evidenceIds: [],
        createdAt: new Date().toISOString(),
      },
    };
  }

  // 3. Check for empty evidence when claims are made
  if (rawAnswer.evidenceIds.length === 0 && rawAnswer.claims.length > 0) {
    return {
      isValid: false,
      sanitizedAnswer: {
        id: metadata.questionId,
        sessionId: metadata.sessionId,
        memberId: metadata.memberId,
        question: metadata.question,
        boundarySnapshot: currentBoundary,
        answerStatus: 'insufficient_evidence',
        answerBody: SAFE_SPOILER_FALLBACK,
        claims: [],
        evidenceIds: [],
        createdAt: new Date().toISOString(),
      },
      violationReason: 'Answer made claims without citing any eligible evidence IDs',
    };
  }

  // 4. Verify all cited evidence IDs exist in eligibleEvidence
  const invalidEvidenceIds: string[] = [];
  for (const id of rawAnswer.evidenceIds) {
    if (!eligibleIdSet.has(id)) {
      invalidEvidenceIds.push(id);
    }
  }

  if (invalidEvidenceIds.length > 0) {
    return {
      isValid: false,
      sanitizedAnswer: {
        id: metadata.questionId,
        sessionId: metadata.sessionId,
        memberId: metadata.memberId,
        question: metadata.question,
        boundarySnapshot: currentBoundary,
        answerStatus: 'insufficient_evidence',
        answerBody: SAFE_SPOILER_FALLBACK,
        claims: [],
        evidenceIds: [],
        createdAt: new Date().toISOString(),
      },
      violationReason: `Cited unverified or future evidence IDs: ${invalidEvidenceIds.join(', ')}`,
    };
  }

  // All checks pass
  return {
    isValid: true,
    sanitizedAnswer: {
      id: metadata.questionId,
      sessionId: metadata.sessionId,
      memberId: metadata.memberId,
      question: metadata.question,
      boundarySnapshot: currentBoundary,
      answerStatus: 'verified',
      answerBody: rawAnswer.answer,
      claims: rawAnswer.claims,
      evidenceIds: rawAnswer.evidenceIds,
      createdAt: new Date().toISOString(),
    },
  };
}
