import type { SelectorRepairProposer } from '@scout/ai';
import {
  classifyFailure,
  diffStructure,
  markupSkeleton,
  type FailureClass,
} from '@scout/collection';
import {
  DEFAULT_SWAPPA_SELECTORS,
  evaluateSwappaSelectorCandidate,
  selectorPatch,
  swappaSelectorMapSchema,
  type SwappaSelectorMap,
} from '@scout/swappa-connector';

export type OpsRest = <T>(path: string, init?: RequestInit) => Promise<T>;

export interface CanaryOutcome {
  ok: boolean;
  items: number;
  errorCode: string | null;
}

export interface HealProposalRow {
  id: string;
  incident_id: string | null;
  source_id: string;
  failure_class: FailureClass;
  status: string;
  base_selectors: SwappaSelectorMap | null;
  proposed_selectors: unknown;
  baseline_sha256: string | null;
  broken_sha256: string | null;
  autonomous: boolean;
  canary: unknown;
}

export interface SwappaSelfHealDeps {
  sourceId: string;
  rest: OpsRest;
  pages: R2Bucket;
  proposer: SelectorRepairProposer | null;
  /** Trial run with a candidate map; not recorded as a canary, so it cannot close incidents. */
  trialCanary: (selectors: SwappaSelectorMap) => Promise<CanaryOutcome>;
  /** The real canary with the map that is active now; recorded and fed to the circuit. */
  officialCanary: () => Promise<CanaryOutcome>;
  /** Level 3: apply without a human when every condition holds. Off unless configured. */
  autonomy: boolean;
  expectedMinItems: number;
}

export const pageKey = (sourceId: string, sha256: string) => `pages/${sourceId}/${sha256}.html`;

const sha256Hex = async (value: string) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

/** Stores a fetched page by content hash so a later diagnosis can diff it. */
export const storePage = async (pages: R2Bucket, sourceId: string, html: string) => {
  const sha = await sha256Hex(html);
  await pages.put(pageKey(sourceId, sha), html, { httpMetadata: { contentType: 'text/html' } });
  return sha;
};

const TERMINAL = new Set([
  'rejected',
  'rolled_back',
  'no_fix',
  'applied',
  'sandbox_failed',
  'canary_failed',
]);

/**
 * Self-heal for the Swappa selector map, in the three levels of docs/auto-cura.md: diagnose and
 * propose (never touching code), replay in a sandbox and measure with a trial canary, then apply
 * on human approval — or, with autonomy configured, on its own when every gate passed — always
 * followed by the real canary and an automatic rollback if it fails. Every step is audited.
 */
export class SwappaSelfHeal {
  constructor(private readonly deps: SwappaSelfHealDeps) {}

  async activeSelectors(): Promise<{ selectors: SwappaSelectorMap; version: number }> {
    const [row] = await this.deps.rest<Array<{ selectors: unknown; version: number }>>(
      `connector_selector_versions?source_id=eq.${this.deps.sourceId}&status=eq.active&select=selectors,version&limit=1`,
    );
    const parsed = swappaSelectorMapSchema.safeParse(row?.selectors);
    return parsed.success
      ? { selectors: parsed.data, version: row.version }
      : { selectors: DEFAULT_SWAPPA_SELECTORS, version: 0 };
  }

  private async audit(actor: string, action: string, details: Record<string, unknown>) {
    await this.deps.rest('ops_audit', {
      method: 'POST',
      body: JSON.stringify({ actor, action, source_id: this.deps.sourceId, details }),
    });
  }

  private async update(id: string, patch: Record<string, unknown>) {
    const [row] = await this.deps.rest<HealProposalRow[]>(`heal_proposals?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
    });
    return row;
  }

  async find(id: string) {
    const [row] = await this.deps.rest<HealProposalRow[]>(`heal_proposals?id=eq.${id}&select=*`);
    if (!row) throw new Error('Heal proposal not found.');
    return row;
  }

  private async page(sha: string | null) {
    if (!sha) return null;
    const object = await this.deps.pages.get(pageKey(this.deps.sourceId, sha));
    return object ? object.text() : null;
  }

  /** Level 1: classify, diff the last good page against the broken one and propose a map. */
  async diagnose(incidentId: string | null, actor: string): Promise<HealProposalRow> {
    const { sourceId, rest } = this.deps;
    if (incidentId) {
      const [latest] = await rest<Array<HealProposalRow & { created_at: string }>>(
        `heal_proposals?incident_id=eq.${incidentId}&select=*&order=created_at.desc&limit=1`,
      );
      // One proposal in flight per incident; automatic runs (cron canaries) also wait 6 h after a
      // finished one instead of paying the model again for the same breakage. People can re-ask.
      const recent = latest && Date.now() - Date.parse(latest.created_at) < 6 * 60 * 60 * 1000;
      if (latest && (!TERMINAL.has(latest.status) || (recent && !actor.startsWith('user:'))))
        return latest;
    }
    const [failed] = await rest<
      Array<{ error_code: string | null; raw_sha256: string | null; checked_at: string }>
    >(
      `canary_runs?source_id=eq.${sourceId}&ok=is.false&select=error_code,raw_sha256,checked_at&order=checked_at.desc&limit=1`,
    );
    const [good] = failed
      ? await rest<Array<{ raw_sha256: string | null }>>(
          `canary_runs?source_id=eq.${sourceId}&ok=is.true&raw_sha256=not.is.null&checked_at=lt.${encodeURIComponent(failed.checked_at)}&select=raw_sha256&order=checked_at.desc&limit=1`,
        )
      : [];
    const health = await rest<Array<{ diagnostics: string[] }>>(
      `collector_health_checks?source_id=eq.${sourceId}&state=neq.NORMAL&select=diagnostics&order=checked_at.desc&limit=5`,
    );
    const codes = [
      failed?.error_code ?? null,
      ...health.flatMap((row) => row.diagnostics.slice(0, 1)),
    ];
    const failureClass = failed ? classifyFailure([failed.error_code]) : classifyFailure(codes);
    const { selectors: current } = await this.activeSelectors();
    const baseline = await this.page(good?.raw_sha256 ?? null);
    const broken = await this.page(failed?.raw_sha256 ?? null);

    const base = {
      incident_id: incidentId,
      source_id: sourceId,
      failure_class: failureClass,
      base_selectors: current,
      baseline_sha256: good?.raw_sha256 ?? null,
      broken_sha256: failed?.raw_sha256 ?? null,
    };
    const insert = async (row: Record<string, unknown>) => {
      const [created] = await rest<HealProposalRow[]>('heal_proposals', {
        method: 'POST',
        body: JSON.stringify({ ...base, ...row }),
      });
      await this.audit(actor, 'heal.diagnosed', {
        proposalId: created.id,
        failureClass,
        status: created.status,
      });
      return created;
    };

    if (failureClass !== 'parser')
      return insert({
        status: 'no_fix',
        evidence: { codes },
        report: `Failure class ${failureClass}: not a markup change, so no selector repair applies. ${
          failureClass === 'source_block'
            ? 'The source refused us; the circuit waits out the cool-down and a human decides.'
            : 'Needs a human to look at the source or the configuration.'
        }`,
      });
    if (!baseline || !broken)
      return insert({
        status: 'no_fix',
        evidence: { codes },
        report:
          'Parser failure, but the last good page or the broken page was not recorded; nothing to diff.',
      });

    const diff = diffStructure(baseline, broken);
    const anchor =
      diff.appeared
        .find((entry) => entry.token.startsWith('class:'))
        ?.token.slice('class:'.length) ?? '';
    const evidence = {
      source: 'swappa',
      failureClass,
      errorCodes: codes.filter((code): code is string => Boolean(code)),
      currentSelectors: current,
      disappeared: diff.disappeared,
      appeared: diff.appeared,
      skeleton: anchor ? markupSkeleton(broken, anchor) : [],
      expectedCards: this.deps.expectedMinItems,
    };
    const summary = `Markup changed: ${diff.disappeared.length} tokens disappeared (${diff.disappeared
      .slice(0, 4)
      .map((entry) => `${entry.token}×${entry.count}`)
      .join(', ')}), ${diff.appeared.length} appeared (${diff.appeared
      .slice(0, 4)
      .map((entry) => `${entry.token}×${entry.count}`)
      .join(', ')}).`;
    if (!this.deps.proposer)
      return insert({ status: 'no_fix', evidence, report: `${summary} No proposer configured.` });
    try {
      const proposal = await this.deps.proposer.propose(evidence);
      const candidate = swappaSelectorMapSchema.safeParse(proposal.selectors);
      return insert({
        status: candidate.success ? 'diagnosed' : 'no_fix',
        evidence: { ...evidence, usage: proposal.usage },
        report: `${summary} ${proposal.rationale}${candidate.success ? '' : ' (proposal rejected: not a valid selector map)'}`,
        proposed_selectors: proposal.selectors,
        patch: candidate.success ? selectorPatch(current, candidate.data) : null,
        proposer: `${this.deps.proposer.model} ${this.deps.proposer.promptVersion}`,
      });
    } catch (error) {
      return insert({
        status: 'no_fix',
        evidence,
        report: `${summary} Proposer failed: ${error instanceof Error ? error.message : 'unknown error'}.`,
      });
    }
  }

  /** Level 2, first half: replay both recorded pages, then measure with a trial canary. */
  async sandbox(id: string, actor: string): Promise<HealProposalRow> {
    const proposal = await this.find(id);
    if (proposal.status !== 'diagnosed')
      throw new Error(`Proposal is ${proposal.status}, not diagnosed.`);
    const [baselineHtml, brokenHtml] = await Promise.all([
      this.page(proposal.baseline_sha256),
      this.page(proposal.broken_sha256),
    ]);
    if (!baselineHtml || !brokenHtml) throw new Error('Recorded pages are gone; diagnose again.');
    const { selectors: current } = await this.activeSelectors();
    const replay = evaluateSwappaSelectorCandidate({
      baselineHtml,
      brokenHtml,
      current,
      candidate: proposal.proposed_selectors,
      expectedMinItems: this.deps.expectedMinItems,
    });
    const sandbox = { passed: replay.passed, checks: replay.checks };
    if (!replay.passed || !replay.candidate) {
      await this.audit(actor, 'heal.sandbox_failed', { proposalId: id, checks: replay.checks });
      return this.update(id, { status: 'sandbox_failed', sandbox });
    }
    const canary = await this.deps.trialCanary(replay.candidate);
    const passed = canary.ok && canary.items >= this.deps.expectedMinItems;
    await this.audit(actor, passed ? 'heal.canary_passed' : 'heal.canary_failed', {
      proposalId: id,
      canary,
    });
    return this.update(id, { status: passed ? 'canary_passed' : 'canary_failed', sandbox, canary });
  }

  /**
   * Applies a measured proposal (human approval, or level 3), then runs the real canary; if it
   * fails, the previous map is reactivated at once.
   */
  async apply(id: string, actor: string, autonomous = false): Promise<HealProposalRow> {
    const proposal = await this.find(id);
    if (proposal.status !== 'canary_passed')
      throw new Error(`Proposal is ${proposal.status}, not canary_passed.`);
    const candidate = swappaSelectorMapSchema.parse(proposal.proposed_selectors);
    const { selectors: previous, version } = await this.activeSelectors();
    await this.deps.rest('rpc/activate_selector_version', {
      method: 'POST',
      body: JSON.stringify({
        p_source_id: this.deps.sourceId,
        p_selectors: candidate,
        p_proposal_id: id,
        p_actor: actor,
      }),
    });
    await this.audit(actor, autonomous ? 'heal.auto_applied' : 'heal.applied', {
      proposalId: id,
      fromVersion: version,
    });
    const after = await this.deps.officialCanary();
    if (after.ok)
      return this.update(id, {
        status: 'applied',
        autonomous,
        decided_by: actor,
        canary: { trial: proposal.canary, after },
      });
    await this.deps.rest('rpc/activate_selector_version', {
      method: 'POST',
      body: JSON.stringify({
        p_source_id: this.deps.sourceId,
        p_selectors: previous,
        p_proposal_id: id,
        p_actor: 'rollback',
      }),
    });
    await this.audit('rollback', 'heal.rolled_back', {
      proposalId: id,
      canary: after,
      restoredFrom: version,
    });
    return this.update(id, { status: 'rolled_back', autonomous, decided_by: actor });
  }

  async reject(id: string, actor: string) {
    const proposal = await this.find(id);
    if (TERMINAL.has(proposal.status)) throw new Error(`Proposal is already ${proposal.status}.`);
    await this.audit(actor, 'heal.rejected', { proposalId: id });
    return this.update(id, { status: 'rejected', decided_by: actor });
  }

  /**
   * Called when a canary fails: diagnosis always runs (level 1); sandbox and trial canary run
   * too; the change is applied without a human only with autonomy on, which requires an additive
   * map change that kept the old page identical — guaranteed by the sandbox checks.
   */
  async onCanaryFailure(incidentId: string | null) {
    const diagnosed = await this.diagnose(incidentId, 'self-heal');
    if (diagnosed.status !== 'diagnosed') return diagnosed;
    const measured = await this.sandbox(diagnosed.id, 'self-heal');
    if (measured.status !== 'canary_passed' || !this.deps.autonomy) return measured;
    // A repair that was rolled back once for this incident never goes autonomous again.
    const rolledBack = incidentId
      ? await this.deps.rest<unknown[]>(
          `heal_proposals?incident_id=eq.${incidentId}&status=eq.rolled_back&select=id&limit=1`,
        )
      : [];
    if (rolledBack.length) return measured;
    return this.apply(measured.id, 'self-heal', true);
  }
}
