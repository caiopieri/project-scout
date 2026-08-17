import type { TextAnalyzer } from '@scout/domain';
import {
  textAnalysisInputSchema,
  textAnalysisResultSchema,
  type TextAnalysisOutput,
  type TextAnalysisResult,
} from '@scout/schemas';

export const TEXT_ANALYSIS_PROMPT_VERSION = 'text-analysis-v1.0.0';

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const DEFECT_RULES = [
  {
    defectType: 'activation_lock',
    component: 'activation',
    evidenceType: 'functional_state' as const,
    severity: 'critical' as const,
    pattern: /\b(activation lock|icloud lock(?:ed)?|icloud bloquead[oa])\b/,
  },
  {
    defectType: 'logic_board_failure',
    component: 'logic_board',
    evidenceType: 'functional_state' as const,
    severity: 'critical' as const,
    pattern:
      /\b(logic board (?:failure|faulty|bad)|defeito (?:na |de )?placa|placa (?:ruim|com defeito))\b/,
  },
  {
    defectType: 'no_power',
    component: 'device',
    evidenceType: 'functional_state' as const,
    severity: 'critical' as const,
    pattern: /\b(does not power on|doesn't power on|no power|won't turn on|nao liga|sem ligar)\b/,
  },
  {
    defectType: 'cracked_screen',
    component: 'display',
    evidenceType: 'cosmetic_defect' as const,
    severity: 'high' as const,
    pattern:
      /\b(cracked|broken|shattered|trincad[ao]|quebrad[ao])\s+(?:front )?(?:screen|display|tela)\b|\b(?:screen|display|tela)\s+(?:is )?(?:cracked|broken|shattered|trincad[ao]|quebrad[ao])\b/,
  },
  {
    defectType: 'broken_back_glass',
    component: 'back_glass',
    evidenceType: 'cosmetic_defect' as const,
    severity: 'medium' as const,
    pattern:
      /\b(back glass|rear glass|vidro traseiro|traseira)\s+(?:is )?(?:cracked|broken|quebrad[ao]|trincad[ao])\b/,
  },
  {
    defectType: 'degraded_battery',
    component: 'battery',
    evidenceType: 'functional_state' as const,
    severity: 'medium' as const,
    pattern:
      /\b(bad battery|weak battery|battery degraded|service battery|bateria (?:ruim|degradada))\b/,
  },
  {
    defectType: 'missing_logic_board',
    component: 'logic_board',
    evidenceType: 'missing_part' as const,
    severity: 'critical' as const,
    pattern: /\b(no logic board|without logic board|sem placa)\b/,
  },
  {
    defectType: 'empty_box',
    component: 'device',
    evidenceType: 'missing_part' as const,
    severity: 'critical' as const,
    pattern: /\b(box only|empty box|it is empty|caixa vazia|somente caixa)\b/,
  },
] as const;

const WORKING_PATTERN =
  /\b(powers on|turns on|working|fully functional|liga|funcionando|funcional)\b/;
const UNTESTED_PATTERN = /\b(untested|not tested|unable to test|nao testad[oa]|sem testar)\b/;

export class DeterministicTextAnalyzer implements TextAnalyzer {
  readonly model = 'rules-en-pt';
  readonly promptVersion = TEXT_ANALYSIS_PROMPT_VERSION;

  constructor(readonly provider = 'deterministic') {}

  async analyze(rawInput: Parameters<TextAnalyzer['analyze']>[0]): Promise<TextAnalysisResult> {
    const input = textAnalysisInputSchema.parse(rawInput);
    const evidences: TextAnalysisOutput['evidences'] = [];
    const defects: TextAnalysisOutput['defects'] = [];
    const contradictions: string[] = [];
    const sources = [
      { reference: 'title' as const, text: normalize(input.title), confidence: 0.92 },
      { reference: 'description' as const, text: normalize(input.description), confidence: 0.88 },
    ];

    for (const rule of DEFECT_RULES) {
      const evidenceKeys: string[] = [];
      for (const source of sources) {
        if (!rule.pattern.test(source.text)) continue;
        const key = `${rule.defectType}_${source.reference}`;
        evidenceKeys.push(key);
        evidences.push({
          key,
          component: rule.component,
          evidenceType: rule.evidenceType,
          assessmentKind: 'fact',
          sourceType: source.reference,
          sourceReference: source.reference,
          claim: `O vendedor declara ${rule.defectType}.`,
          status: 'confirmed_defective',
          confidence: source.confidence,
          explanation: `Expressão compatível com ${rule.defectType} encontrada no ${source.reference}.`,
          limitations: ['Declaração textual do anúncio; não verificada fisicamente.'],
          severity: rule.severity,
        });
      }
      if (evidenceKeys.length) {
        defects.push({
          key: rule.defectType,
          component: rule.component,
          defectType: rule.defectType,
          status: 'declared',
          confidence: Math.max(
            ...evidences
              .filter((evidence) => evidenceKeys.includes(evidence.key))
              .map((evidence) => evidence.confidence),
          ),
          severity: rule.severity,
          declared: true,
          inferred: false,
          evidenceKeys,
        });
      }
    }

    const workingSources = sources.filter((source) => WORKING_PATTERN.test(source.text));
    const untestedSources = sources.filter((source) => UNTESTED_PATTERN.test(source.text));
    for (const source of workingSources) {
      evidences.push({
        key: `device_working_${source.reference}`,
        component: 'device',
        evidenceType: 'functional_state',
        assessmentKind: 'fact',
        sourceType: source.reference,
        sourceReference: source.reference,
        claim: 'O vendedor declara que o aparelho liga ou funciona.',
        status: 'probably_working',
        confidence: source.confidence,
        explanation: `Declaração de funcionamento encontrada no ${source.reference}.`,
        limitations: ['Não comprova todas as funções nem substitui teste físico.'],
        severity: 'none',
      });
    }
    for (const source of untestedSources) {
      evidences.push({
        key: `device_untested_${source.reference}`,
        component: 'device',
        evidenceType: 'functional_state',
        assessmentKind: 'unknown',
        sourceType: source.reference,
        sourceReference: source.reference,
        claim: 'O funcionamento não foi testado.',
        status: 'unknown',
        confidence: source.confidence,
        explanation: `Ausência explícita de teste declarada no ${source.reference}.`,
        limitations: ['Não permite concluir se o aparelho funciona ou está defeituoso.'],
        severity: 'medium',
      });
    }

    const noPower = defects.find((defect) => defect.defectType === 'no_power');
    if (noPower && workingSources.length) {
      const message = 'O anúncio declara simultaneamente funcionamento e ausência de energia.';
      contradictions.push(message);
      evidences.push({
        key: 'device_power_contradiction',
        component: 'device',
        evidenceType: 'inconsistency',
        assessmentKind: 'inference',
        sourceType: 'system_inferred',
        sourceReference: 'title+description',
        claim: message,
        status: 'unknown',
        confidence: 0.95,
        explanation: 'Foram encontradas afirmações textuais incompatíveis sobre energia.',
        limitations: ['A contradição pode decorrer de contexto incompleto ou revisão do anúncio.'],
        severity: 'high',
      });
    }
    if (!workingSources.length && !untestedSources.length && !noPower) {
      evidences.push({
        key: 'device_function_unknown',
        component: 'device',
        evidenceType: 'functional_state',
        assessmentKind: 'unknown',
        sourceType: 'system_inferred',
        sourceReference: 'title+description',
        claim: 'O funcionamento do aparelho não foi informado.',
        status: 'unknown',
        confidence: 1,
        explanation: 'Nenhuma declaração textual reconhecida sobre funcionamento foi encontrada.',
        limitations: [
          'Regras determinísticas cobrem apenas vocabulário inicial em inglês e português.',
        ],
        severity: 'medium',
      });
    }

    return textAnalysisResultSchema.parse({
      evidences,
      defects,
      contradictions,
      provider: this.provider,
      model: this.model,
      promptVersion: this.promptVersion,
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    });
  }
}

export class MockTextAnalyzer extends DeterministicTextAnalyzer {
  constructor() {
    super('mock');
  }
}
