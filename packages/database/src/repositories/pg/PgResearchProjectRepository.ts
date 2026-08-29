import {
  CreateResearchProject,
  ResearchProject,
  ResearchProjectRepository,
  UpdateResearchProject,
} from '@scout/domain';
import { SqlExecutor } from '../../sql/SqlExecutor';

const projectColumns = `id, user_id as "userId", name, description, category,
  natural_language_query as "naturalLanguageQuery", structured_query as "structuredQuery",
  jsonb_build_object(
    'confidence', interpretation_confidence,
    'ambiguities', interpretation_ambiguities,
    'warnings', interpretation_warnings,
    'unidentifiedFields', unidentified_fields,
    'provider', interpreter_provider,
    'model', interpreter_model,
    'promptOrRuleVersion', interpreter_version,
    'taxonomyVersion', taxonomy_version,
    'interpretedAt', interpreted_at
  ) as interpretation,
  status, deleted_at as "deletedAt", created_at as "createdAt", updated_at as "updatedAt"`;

export class PgResearchProjectRepository implements ResearchProjectRepository {
  constructor(private readonly sql: SqlExecutor) {}

  async findById(id: string, userId: string): Promise<ResearchProject | null> {
    const result = await this.sql.query<ResearchProject>(
      `SELECT ${projectColumns} FROM research_projects
       WHERE id = $1 AND user_id = $2 AND status <> 'deleted'`,
      [id, userId],
    );
    return result.rows[0] ?? null;
  }

  async findByUserId(userId: string, includeDeleted = false): Promise<ResearchProject[]> {
    const result = await this.sql.query<ResearchProject>(
      `SELECT ${projectColumns} FROM research_projects
       WHERE user_id = $1 AND ($2::boolean OR status <> 'deleted')
       ORDER BY updated_at DESC`,
      [userId, includeDeleted],
    );
    return result.rows;
  }

  async create(userId: string, project: CreateResearchProject): Promise<ResearchProject> {
    const metadata = project.interpretation;
    const result = await this.sql.query<ResearchProject>(
      `INSERT INTO research_projects (
         user_id, name, description, category, natural_language_query, structured_query, status,
         interpretation_schema_version, taxonomy_version, interpreter_provider, interpreter_model,
         interpreter_version, interpreted_at, interpretation_confidence,
         interpretation_ambiguities, interpretation_warnings, unidentified_fields
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,'1.0.0',$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING ${projectColumns}`,
      [
        userId,
        project.name,
        project.description ?? null,
        project.structuredQuery.category ?? 'unknown',
        project.naturalLanguageQuery,
        JSON.stringify(project.structuredQuery),
        project.status,
        metadata.taxonomyVersion,
        metadata.provider,
        metadata.model,
        metadata.promptOrRuleVersion,
        metadata.interpretedAt,
        metadata.confidence,
        JSON.stringify(metadata.ambiguities),
        JSON.stringify(metadata.warnings),
        JSON.stringify(metadata.unidentifiedFields),
      ],
    );
    return result.rows[0];
  }

  async update(id: string, userId: string, data: UpdateResearchProject): Promise<ResearchProject> {
    const existing = await this.requireProject(id, userId);
    const next = { ...existing, ...data };
    const metadata = next.interpretation;
    const result = await this.sql.query<ResearchProject>(
      `UPDATE research_projects SET name=$1, description=$2, category=$3,
         natural_language_query=$4, structured_query=$5, taxonomy_version=$6,
         interpreter_provider=$7, interpreter_model=$8, interpreter_version=$9,
         interpreted_at=$10, interpretation_confidence=$11, interpretation_ambiguities=$12,
         interpretation_warnings=$13, unidentified_fields=$14, updated_at=NOW()
       WHERE id=$15 AND user_id=$16 AND status <> 'deleted'
       RETURNING ${projectColumns}`,
      [
        next.name,
        next.description ?? null,
        next.structuredQuery.category ?? 'unknown',
        next.naturalLanguageQuery,
        JSON.stringify(next.structuredQuery),
        metadata.taxonomyVersion,
        metadata.provider,
        metadata.model,
        metadata.promptOrRuleVersion,
        metadata.interpretedAt,
        metadata.confidence,
        JSON.stringify(metadata.ambiguities),
        JSON.stringify(metadata.warnings),
        JSON.stringify(metadata.unidentifiedFields),
        id,
        userId,
      ],
    );
    return result.rows[0];
  }

  archive(id: string, userId: string): Promise<ResearchProject> {
    return this.setStatus(id, userId, 'archived');
  }

  restore(id: string, userId: string): Promise<ResearchProject> {
    return this.setStatus(id, userId, 'active');
  }

  async softDelete(id: string, userId: string): Promise<void> {
    const result = await this.sql.query(
      `UPDATE research_projects SET status='deleted', deleted_at=NOW(), updated_at=NOW()
       WHERE id=$1 AND user_id=$2 AND status <> 'deleted'`,
      [id, userId],
    );
    if (result.rowCount === 0) throw new Error('Project not found or access denied.');
  }

  private async setStatus(
    id: string,
    userId: string,
    status: 'active' | 'archived',
  ): Promise<ResearchProject> {
    const result = await this.sql.query<ResearchProject>(
      `UPDATE research_projects SET status=$1, updated_at=NOW()
       WHERE id=$2 AND user_id=$3 AND status <> 'deleted' RETURNING ${projectColumns}`,
      [status, id, userId],
    );
    if (!result.rows[0]) throw new Error('Project not found or access denied.');
    return result.rows[0];
  }

  private async requireProject(id: string, userId: string): Promise<ResearchProject> {
    const project = await this.findById(id, userId);
    if (!project) throw new Error('Project not found or access denied.');
    return project;
  }
}
