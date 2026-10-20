import {
  BoundarySnapshot,
  EvidenceItem,
  Recap,
  Character,
  CharacterExplanation,
  AiStructuredAnswer,
} from '@scenesync/shared-types';

export interface RecapGenerationParams {
  showId: string;
  showTitle: string;
  boundary: BoundarySnapshot;
  eligibleEvidence: EvidenceItem[];
}

export interface CharacterExplanationParams {
  showTitle: string;
  character: Character;
  boundary: BoundarySnapshot;
  eligibleEvidence: EvidenceItem[];
  knownRelationships?: Array<{
    relatedCharacterName: string;
    relationshipType: string;
    description: string;
  }>;
}

export interface QuestionAnswerParams {
  showTitle: string;
  question: string;
  boundary: BoundarySnapshot;
  eligibleEvidence: EvidenceItem[];
}

export interface AiProviderAdapter {
  name: string;
  generateRecap(params: RecapGenerationParams): Promise<Recap>;
  generateCharacterExplanation(params: CharacterExplanationParams): Promise<CharacterExplanation>;
  answerQuestion(params: QuestionAnswerParams): Promise<AiStructuredAnswer>;
}
