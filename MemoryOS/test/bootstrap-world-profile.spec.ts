import { describe, expect, it } from 'vitest';
import { resolveBootstrapWorldProfile } from '../src/memory-bootstrap/bootstrap-world-profile';
import type { ColdStartDocument, ColdStartSourceBundle } from '../src/memory-bootstrap';

function buildBundle(): ColdStartSourceBundle {
    return {
        reason: 'bootstrap',
        characterCard: {
            name: 'Mage',
            description: 'A caster in academy',
            personality: 'careful',
            scenario: 'magic academy',
            firstMessage: 'Welcome to the academy',
            messageExample: 'Mana is unstable',
            creatorNotes: 'Focus magic setting',
            tags: ['magic', 'academy'],
        },
        semantic: {
            systemPrompt: 'This world has mana and spells',
            firstMessage: 'Hi',
            authorNote: '',
            jailbreak: '',
            instruct: '',
            activeLorebooks: ['magic_system'],
        },
        user: {
            userName: 'u',
            counterpartName: 'c',
            personaDescription: 'apprentice',
            metadataPersona: '',
        },
        worldbooks: {
            mainBook: 'magic_lore',
            extraBooks: [],
            activeBooks: ['magic_lore'],
            entries: [
                {
                    book: 'magic_lore',
                    entryId: '1',
                    entry: 'Mana Circle',
                    keywords: ['mana'],
                    content: 'Spells require mana circle and chant',
                },
            ],
        },
        recentEvents: ['The character cast a spell'],
    };
}

describe('resolveBootstrapWorldProfile', () => {
    it('falls back to local detector when model detection is incomplete', () => {
        const document: ColdStartDocument = {
            schemaVersion: '1.0.0',
            identity: {
                actorKey: 'char_mage',
                displayName: 'Mage',
                aliases: [],
                identityFacts: [],
                originFacts: [],
                traits: [],
            },
            actorCards: [],
            worldProfileDetection: {
                primaryProfile: 'urban_modern',
                secondaryProfiles: [],
                confidence: Number.NaN,
                reasonCodes: [],
            },
            worldBase: [],
            relationships: [],
            memoryRecords: [],
        };
        const resolved = resolveBootstrapWorldProfile(document, buildBundle());
        expect(resolved.reasonCodes.length).toBeGreaterThan(0);
        expect(resolved.confidence).toBeGreaterThanOrEqual(0);
    });

    it('uses model result when model detection is complete', () => {
        const document: ColdStartDocument = {
            schemaVersion: '1.0.0',
            identity: {
                actorKey: 'char_mage',
                displayName: 'Mage',
                aliases: [],
                identityFacts: [],
                originFacts: [],
                traits: [],
            },
            actorCards: [],
            worldProfileDetection: {
                primaryProfile: 'supernatural_hidden',
                secondaryProfiles: ['urban_modern'],
                confidence: 0.75,
                reasonCodes: ['model:detected'],
            },
            worldBase: [],
            relationships: [],
            memoryRecords: [],
        };
        const resolved = resolveBootstrapWorldProfile(document, buildBundle());
        expect(resolved.primaryProfile).toBe('supernatural_hidden');
        expect(resolved.reasonCodes).toEqual(['model:detected']);
    });
});
