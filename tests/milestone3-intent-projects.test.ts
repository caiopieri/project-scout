import { describe, expect, it } from 'vitest';
import { DeterministicIntentInterpreter } from '@scout/ai';
import { InMemoryResearchProjectRepository } from '@scout/database';
import {
  createResearchProjectSchema,
  moneySchema,
  researchCriteriaSchema,
} from '@scout/schemas';

const interpreter = new DeterministicIntentInterpreter();
const userA = '11111111-1111-4111-a111-111111111111';
const userB = '99999999-9999-4999-a999-999999999999';

describe('Milestone 3 deterministic intent', () => {
  it('interprets iPhone storage, broken screen and BRL ceiling', async () => {
    const result = await interpreter.interpret({ query: 'iPhone 13 128 GB com tela quebrada até R$ 1.800.' });
    expect(result.criteria.models).toEqual(['iPhone 13']);
    expect(result.criteria.storageGb).toEqual([128]);
    expect(result.criteria.maximumPrice).toEqual({ amountMinor: 180000, currency: 'BRL' });
    expect(result.criteria.acceptedDefects).toContain('cracked_screen');
  });

  it('interprets MacBook memory and USD ceiling', async () => {
    const result = await interpreter.interpret({ query: 'MacBook Pro 16 com 64 GB e até US$ 2.000.' });
    expect(result.criteria.models).toEqual(['MacBook Pro 16']);
    expect(result.criteria.memoryGb).toEqual([64]);
    expect(result.criteria.maximumPrice).toEqual({ amountMinor: 200000, currency: 'USD' });
  });

  it.each([
    ['Aceito bateria ruim, mas não aceito iCloud.', 'acceptedDefects', 'degraded_battery'],
    ['Aparelho deve ligar.', 'requiredFunctionalStates', 'device'],
    ['Pode estar com traseira quebrada.', 'acceptedDefects', 'broken_back_glass'],
    ['Não quero defeito de placa.', 'rejectedDefects', 'logic_board_failure'],
    ['Somente para peças ou reparo.', 'acceptedConditions', 'parts_only'],
  ])('recognizes focused phrase: %s', async (query, field, expected) => {
    const result = await interpreter.interpret({ query });
    const value = result.criteria[field as keyof typeof result.criteria];
    expect(JSON.stringify(value)).toContain(expected);
  });

  it('reports absent model without inventing one', async () => {
    const result = await interpreter.interpret({ query: 'Quero notebook usado até R$ 2.000.' });
    expect(result.criteria.models).toEqual([]);
    expect(result.ambiguities.some((item) => item.field === 'models')).toBe(true);
  });

  it('warns when a maximum price has no currency', async () => {
    const result = await interpreter.interpret({ query: 'Quero notebook usado até 2.000.' });
    expect(result.criteria.maximumPrice).toBeUndefined();
    expect(result.warnings.some((item) => item.field === 'maximumPrice')).toBe(true);
  });

  it('resolves contradictory accepted/rejected defects conservatively', async () => {
    const result = await interpreter.interpret({ query: 'iPhone 13: aceito bateria ruim, mas não aceito bateria ruim.' });
    expect(result.criteria.acceptedDefects).not.toContain('degraded_battery');
    expect(result.criteria.rejectedDefects).toContain('degraded_battery');
    expect(result.ambiguities.some((item) => item.field === 'defects')).toBe(true);
  });
});

describe('Milestone 3 shared schemas', () => {
  it('accepts valid money and rejects negative or unknown currency', () => {
    expect(moneySchema.parse({ amountMinor: 180000, currency: 'BRL' })).toBeTruthy();
    expect(moneySchema.safeParse({ amountMinor: -1, currency: 'BRL' }).success).toBe(false);
    expect(moneySchema.safeParse({ amountMinor: 10, currency: 'BTC' }).success).toBe(false);
  });

  it('rejects empty criteria, unknown defects and contradictory states', () => {
    expect(researchCriteriaSchema.safeParse({}).success).toBe(false);
    expect(researchCriteriaSchema.safeParse({ models: ['iPhone 13'], acceptedDefects: ['water_damage'] }).success).toBe(false);
    expect(researchCriteriaSchema.safeParse({ models: ['iPhone 13'], acceptedDefects: ['cracked_screen'], rejectedDefects: ['cracked_screen'] }).success).toBe(false);
  });

  it('accepts positive storage and rejects invalid capacities', () => {
    expect(researchCriteriaSchema.safeParse({ models: ['iPhone 13'], storageGb: [128] }).success).toBe(true);
    expect(researchCriteriaSchema.safeParse({ models: ['iPhone 13'], storageGb: [0] }).success).toBe(false);
  });
});

describe('Milestone 3 project repository lifecycle and isolation', () => {
  it('creates, lists, edits, archives, restores and soft-deletes a project', async () => {
    const repository = new InMemoryResearchProjectRepository();
    const interpreted = await interpreter.interpret({ query: 'iPhone 13 128 GB com tela quebrada até R$ 1.800.' });
    const input = createResearchProjectSchema.parse({
      name: 'iPhone 13 para reparo',
      naturalLanguageQuery: 'iPhone 13 128 GB com tela quebrada até R$ 1.800.',
      structuredQuery: interpreted.criteria,
      interpretation: { ...interpreted, criteria: undefined },
      status: 'draft',
    });
    const created = await repository.create(userA, input);
    expect((await repository.findByUserId(userA))).toHaveLength(1);
    expect(await repository.findById(created.id, userB)).toBeNull();
    expect((await repository.update(created.id, userA, { name: 'iPhone 13 — revisado' })).name).toContain('revisado');
    expect((await repository.archive(created.id, userA)).status).toBe('archived');
    expect((await repository.restore(created.id, userA)).status).toBe('active');
    await repository.softDelete(created.id, userA);
    expect(await repository.findById(created.id, userA)).toBeNull();
    expect(await repository.findByUserId(userA)).toHaveLength(0);
    expect(await repository.findByUserId(userA, true)).toHaveLength(1);
  });

  it('does not allow another user to mutate a project', async () => {
    const repository = new InMemoryResearchProjectRepository();
    const interpreted = await interpreter.interpret({ query: 'MacBook Pro 16 até USD 2.000.' });
    const input = createResearchProjectSchema.parse({
      name: 'MacBook reparável', naturalLanguageQuery: 'MacBook Pro 16 até USD 2.000.',
      structuredQuery: interpreted.criteria, interpretation: { ...interpreted, criteria: undefined }, status: 'active',
    });
    const created = await repository.create(userA, input);
    await expect(repository.archive(created.id, userB)).rejects.toThrow();
    await expect(repository.softDelete(created.id, userB)).rejects.toThrow();
  });
});
