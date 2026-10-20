import seedDataJson from './seed-data.json' with { type: 'json' };
import { Show, Episode, Character, CharacterRelationship, Fact } from '@scenesync/shared-types';

export interface SpoilerTestCase {
  id: string;
  description: string;
  question: string;
  maxAllowedEpisode: number;
  expectedStatus: string;
  mustContainEvidence?: string[];
  mustNotContainEvidence?: string[];
}

export interface CuratedDataset {
  shows: Show[];
  episodes: Episode[];
  characters: Character[];
  relationships: CharacterRelationship[];
  facts: Fact[];
  spoilerTestCases: SpoilerTestCase[];
}

export const seedData = seedDataJson as CuratedDataset;
