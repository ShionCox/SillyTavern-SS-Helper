import { describe, expect, it } from 'vitest';
import { buildColdStartSourceBundle } from '../src/sdk/memory-sdk';

describe('cold start source bundle', () => {
    it('assembles structured bundle with required source slices', () => {
        const bundle = buildColdStartSourceBundle({
            reason: 'manual_bootstrap',
            currentCharacter: {
                name: 'Erin',
                description: 'A royal intelligence agent.',
                personality: 'Calm',
                scenario: 'War city',
                first_mes: 'We finally meet.',
                mes_example: 'Stay alert.',
                creator_notes: 'Observe first.',
                tags: ['spy', 'spy', 'royal'],
            },
            semanticSnapshot: {
                systemPrompt: 'World has strict curfew.',
                firstMessage: 'Hello there.',
                authorNote: 'Keep tension.',
                jailbreak: 'none',
                instruct: 'be concise',
                activeLorebooks: ['kingdom', 'curfew', 'kingdom'],
            },
            userSnapshot: {
                userName: 'Player',
                counterpartName: 'Erin',
                personaDescription: 'A traveler.',
                metadataPersona: 'cautious',
            },
            worldbookBinding: {
                mainBook: 'kingdom',
                extraBooks: ['city_rules', 'city_rules'],
                allBooks: ['kingdom', 'city_rules'],
            },
            worldbookEntries: [
                {
                    book: 'kingdom',
                    entryId: '1',
                    entry: 'Curfew Law',
                    keywords: ['law', 'curfew', 'law'],
                    content: 'No civilians can leave at night.',
                },
            ],
            recentEvents: ['User asked about curfew', 'User asked about curfew'],
        });

        expect(bundle.reason).toBe('manual_bootstrap');
        expect(bundle.characterCard.tags).toEqual(['spy', 'royal']);
        expect(bundle.semantic.activeLorebooks).toEqual(['kingdom', 'curfew']);
        expect(bundle.worldbooks.extraBooks).toEqual(['city_rules']);
        expect(bundle.worldbooks.entries[0].entry).toBe('Curfew Law');
        expect(bundle.recentEvents).toEqual(['User asked about curfew']);
    });
});
