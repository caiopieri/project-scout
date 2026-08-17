import {
  InterpretIntentInput,
  InterpretIntentResult,
  ResearchCriteria,
  interpretIntentInputSchema,
  interpretIntentResultSchema,
} from '@scout/schemas';

export interface IntentInterpreter {
  interpret(input: InterpretIntentInput): Promise<InterpretIntentResult>;
}

export const INTENT_TAXONOMY_VERSION = '1.0.0';
export const INTENT_RULE_VERSION = '1.0.0';

const normalize = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const unique = <T>(values: T[]): T[] => [...new Set(values)];

const hasAny = (text: string, aliases: string[]): boolean =>
  aliases.some((alias) => text.includes(alias));

function extractMoney(text: string): {
  maximumPrice?: ResearchCriteria['maximumPrice'];
  warning?: string;
} {
  const prefixed = text.match(/(r\$|brl|us\$|usd|€|eur|cny|¥)\s*([\d.]+(?:,\d+)?)/);
  const suffixed = text.match(/([\d.]+(?:,\d+)?)\s*(brl|usd|eur|cny)\b/);
  const markerOnly = text.match(/(?:ate|maximo(?: de)?|no maximo)\s*([\d.]+(?:,\d+)?)/);
  const token = prefixed?.[1] ?? suffixed?.[2];
  const amount = prefixed?.[2] ?? suffixed?.[1] ?? markerOnly?.[1];
  if (!amount) return {};
  const currency =
    token === 'r$' || token === 'brl'
      ? 'BRL'
      : token === 'us$' || token === 'usd'
        ? 'USD'
        : token === '€' || token === 'eur'
          ? 'EUR'
          : token === 'cny' || token === '¥'
            ? 'CNY'
            : undefined;
  if (!currency) return { warning: 'Preço máximo identificado, mas a moeda não foi informada.' };
  const decimal = Number(amount.replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(decimal)) return {};
  return { maximumPrice: { amountMinor: Math.round(decimal * 100), currency } };
}

export class DeterministicIntentInterpreter implements IntentInterpreter {
  async interpret(rawInput: InterpretIntentInput): Promise<InterpretIntentResult> {
    const { query } = interpretIntentInputSchema.parse(rawInput);
    const text = normalize(query);
    const isIphone = text.includes('iphone');
    const isMacBook = text.includes('macbook');
    const capacityValues = [...text.matchAll(/\b(\d+)\s*(gb|tb)\b/g)].map(
      (match) => Number(match[1]) * (match[2] === 'tb' ? 1024 : 1),
    );
    const storageGb = isMacBook ? capacityValues.filter((value) => value >= 256) : capacityValues;
    const memoryGb = isMacBook ? capacityValues.filter((value) => value < 256) : [];
    const money = extractMoney(text);
    const acceptedDefects: ResearchCriteria['acceptedDefects'] = unique([
      ...(hasAny(text, ['tela quebrada', 'tela trincada']) ? ['cracked_screen' as const] : []),
      ...(hasAny(text, ['traseira quebrada', 'vidro traseiro quebrado'])
        ? ['broken_back_glass' as const]
        : []),
      ...(hasAny(text, ['bateria ruim', 'bateria degradada']) ? ['degraded_battery' as const] : []),
      ...(hasAny(text, ['para pecas', 'somente para pecas']) ? ['parts_only' as const] : []),
    ]);
    const rejectedDefects: ResearchCriteria['rejectedDefects'] = unique([
      ...(hasAny(text, ['icloud', 'activation lock', 'bloqueado no icloud'])
        ? ['activation_lock' as const]
        : []),
      ...(hasAny(text, ['nao liga', 'nao ligue', 'nao liguem', 'sem ligar'])
        ? ['no_power' as const]
        : []),
      ...(hasAny(text, ['defeito de placa', 'placa ruim', 'placa mae com defeito'])
        ? ['logic_board_failure' as const]
        : []),
      ...(/nao\s+(?:aceito|quero)[^.]*bateria (?:ruim|degradada)/.test(text)
        ? ['degraded_battery' as const]
        : []),
      ...(/nao\s+(?:aceito|quero)[^.]*tela (?:quebrada|trincada)/.test(text)
        ? ['cracked_screen' as const]
        : []),
    ]);
    const ambiguities: InterpretIntentResult['ambiguities'] = [];
    const contradictions = acceptedDefects.filter((defect) => rejectedDefects.includes(defect));
    if (contradictions.length) {
      ambiguities.push({
        field: 'defects',
        message: `Critério contraditório: ${contradictions.join(', ')}. A rejeição prevaleceu.`,
        severity: 'ambiguity',
      });
    }
    const acceptedWithoutContradictions = acceptedDefects.filter(
      (defect) => !rejectedDefects.includes(defect),
    );
    const models =
      isIphone && /iphone\s*13/.test(text)
        ? ['iPhone 13']
        : isMacBook && /macbook\s+pro\s+16/.test(text)
          ? ['MacBook Pro 16']
          : isMacBook && text.includes('macbook pro')
            ? ['MacBook Pro']
            : isMacBook
              ? ['MacBook']
              : [];
    if (!models.length)
      ambiguities.push({
        field: 'models',
        message: 'Nenhum modelo identificável.',
        severity: 'ambiguity',
      });
    const warnings: InterpretIntentResult['warnings'] = money.warning
      ? [{ field: 'maximumPrice', message: money.warning, severity: 'warning' }]
      : [];
    const working = hasAny(text, [
      'deve ligar',
      'que ligue',
      'que liguem',
      'funcionando',
      'funcional',
      'provavelmente funcionando',
    ]);
    const criteria: ResearchCriteria = {
      category: isIphone
        ? 'smartphone'
        : isMacBook || text.includes('notebook')
          ? 'laptop'
          : undefined,
      brands: isIphone || isMacBook ? ['Apple'] : [],
      models,
      variants: [],
      storageGb,
      memoryGb,
      maximumPrice: money.maximumPrice,
      acceptedDefects: acceptedWithoutContradictions,
      rejectedDefects,
      acceptedConditions: unique([
        ...(text.includes('usado') ? ['used' as const] : []),
        ...(text.includes('recondicionado') ? ['refurbished' as const] : []),
        ...(text.includes('para reparo') ? ['for_repair' as const] : []),
        ...(hasAny(text, ['para pecas', 'somente para pecas']) ? ['parts_only' as const] : []),
      ]),
      countries: [],
      regions: [],
      requiredFunctionalStates: working
        ? [{ component: 'device', minimumStatus: 'probably_working' }]
        : [],
      preferredEvidence: working
        ? ['device_powered_on', 'seller_declares_other_functions_working']
        : [],
      additionalKeywords: [],
      excludedKeywords: [],
    };
    return interpretIntentResultSchema.parse({
      criteria,
      confidence: Math.max(0.3, 0.92 - ambiguities.length * 0.2 - warnings.length * 0.12),
      ambiguities,
      warnings,
      unidentifiedFields: [],
      provider: 'deterministic',
      model: 'rules-pt-BR',
      promptOrRuleVersion: INTENT_RULE_VERSION,
      taxonomyVersion: INTENT_TAXONOMY_VERSION,
      interpretedAt: new Date().toISOString(),
    });
  }
}

export class MockIntentInterpreter extends DeterministicIntentInterpreter {}

export class AiIntentInterpreter implements IntentInterpreter {
  async interpret(_input: InterpretIntentInput): Promise<InterpretIntentResult> {
    throw new Error(
      'AI intent interpretation is disabled: no provider is configured for Milestone 3.',
    );
  }
}

export * from './text-analysis';
export * from './processor';

export const AI_PACKAGE_MARKER = '@scout/ai';
