import {
  AnalysisRepository,
  AnalysisRun,
  Defect,
  Evidence,
  ListingScore,
} from '@scout/domain';

export class InMemoryAnalysisRepository implements AnalysisRepository {
  private analysisRuns: AnalysisRun[] = [];
  private evidences: Evidence[] = [];
  private defects: Defect[] = [];
  private defectEvidences: Map<string, string[]> = new Map();

  constructor(
    initialEvidences: Evidence[] = [],
    initialDefects: Defect[] = [],
    initialScores: ListingScore[] = []
  ) {
    this.evidences = [...initialEvidences];
    this.defects = [...initialDefects];
    this.scores = [...initialScores];
  }

  private scores: ListingScore[] = [];

  async saveAnalysisRun(run: Omit<AnalysisRun, 'id' | 'createdAt'>): Promise<AnalysisRun> {
    const created: AnalysisRun = {
      ...run,
      id: crypto.randomUUID(),
      createdAt: new Date(),
    };
    this.analysisRuns.push(created);
    return { ...created };
  }

  async saveEvidences(evidences: Omit<Evidence, 'id' | 'createdAt'>[]): Promise<Evidence[]> {
    const now = new Date();
    const created: Evidence[] = evidences.map((ev) => ({
      ...ev,
      id: crypto.randomUUID(),
      createdAt: now,
    }));
    this.evidences.push(...created);
    return created.map((e) => ({ ...e }));
  }

  async saveDefects(defects: (Omit<Defect, 'id' | 'createdAt'> & { evidenceIds?: string[] })[]): Promise<Defect[]> {
    const now = new Date();
    const created: Defect[] = defects.map((df) => {
      const id = crypto.randomUUID();
      const evidenceIds = df.evidenceIds;
      if (evidenceIds && evidenceIds.length > 0) {
        this.defectEvidences.set(id, [...evidenceIds]);
      }
      const defectObj: Defect = {
        id,
        listingId: df.listingId,
        component: df.component,
        defectType: df.defectType,
        status: df.status,
        confidence: df.confidence,
        severity: df.severity,
        declared: df.declared || false,
        visible: df.visible || false,
        inferred: df.inferred || false,
        estimatedRepairCost: df.estimatedRepairCost,
        repairCostCurrency: df.repairCostCurrency || 'BRL',
        createdAt: now,
      };
      return defectObj;
    });
    this.defects.push(...created);
    return created.map((d) => ({ ...d }));
  }

  async linkDefectEvidence(defectId: string, evidenceId: string): Promise<void> {
    const existing = this.defectEvidences.get(defectId) || [];
    if (!existing.includes(evidenceId)) {
      this.defectEvidences.set(defectId, [...existing, evidenceId]);
    }
  }

  async saveScore(score: Omit<ListingScore, 'id' | 'createdAt'> & { id?: string }): Promise<ListingScore> {
    const saved: ListingScore = {
      ...score,
      id: score.id || crypto.randomUUID(),
      createdAt: new Date(),
    };
    this.scores.push(saved);
    return { ...saved };
  }

  async getEvidencesByListingId(listingId: string): Promise<Evidence[]> {
    return this.evidences
      .filter((e) => e.listingId === listingId)
      .map((e) => ({ ...e }));
  }

  async getDefectsByListingId(listingId: string): Promise<Defect[]> {
    return this.defects
      .filter((d) => d.listingId === listingId)
      .map((d) => ({ ...d }));
  }

  async getScoreByListingId(listingId: string): Promise<ListingScore | null> {
    const listingScores = this.scores.filter((s) => s.listingId === listingId);
    if (listingScores.length === 0) return null;
    listingScores.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return { ...listingScores[0] };
  }
}
