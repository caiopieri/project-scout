import {
  CreateResearchProject,
  ResearchProject,
  ResearchProjectRepository,
  UpdateResearchProject,
} from '@scout/domain';

export class InMemoryResearchProjectRepository implements ResearchProjectRepository {
  private projects: Map<string, ResearchProject> = new Map();

  constructor(initialProjects: ResearchProject[] = []) {
    for (const project of initialProjects) {
      this.projects.set(project.id, { ...project });
    }
  }

  async findById(id: string, userId: string): Promise<ResearchProject | null> {
    const project = this.projects.get(id);
    if (!project || project.userId !== userId || project.status === 'deleted') {
      return null;
    }
    return { ...project };
  }

  async findByUserId(userId: string, includeDeleted = false): Promise<ResearchProject[]> {
    return Array.from(this.projects.values())
      .filter((project) => project.userId === userId && (includeDeleted || project.status !== 'deleted'))
      .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
      .map((p) => ({ ...p }));
  }

  async create(userId: string, project: CreateResearchProject): Promise<ResearchProject> {
    const id = crypto.randomUUID();
    const now = new Date();
    const newProject: ResearchProject = {
      ...project,
      id,
      userId,
      category: project.structuredQuery.category ?? 'unknown',
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.projects.set(id, newProject);
    return { ...newProject };
  }

  async update(id: string, userId: string, data: UpdateResearchProject): Promise<ResearchProject> {
    const existing = await this.findById(id, userId);
    if (!existing) {
      throw new Error(`Project ${id} not found or access denied for user ${userId}`);
    }

    const updated: ResearchProject = {
      ...existing,
      ...data,
      id: existing.id,
      userId: existing.userId,
      category: data.structuredQuery?.category ?? existing.category,
      updatedAt: new Date(),
    };

    this.projects.set(id, updated);
    return { ...updated };
  }

  async archive(id: string, userId: string): Promise<ResearchProject> {
    return this.setStatus(id, userId, 'archived');
  }

  async restore(id: string, userId: string): Promise<ResearchProject> {
    return this.setStatus(id, userId, 'active');
  }

  async softDelete(id: string, userId: string): Promise<void> {
    const project = await this.findById(id, userId);
    if (!project) throw new Error(`Project ${id} not found or access denied for user ${userId}`);
    this.projects.set(id, { ...project, status: 'deleted', deletedAt: new Date(), updatedAt: new Date() });
  }

  private async setStatus(id: string, userId: string, status: 'active' | 'archived'): Promise<ResearchProject> {
    const project = await this.findById(id, userId);
    if (!project) throw new Error(`Project ${id} not found or access denied for user ${userId}`);
    const updated = { ...project, status, updatedAt: new Date() };
    this.projects.set(id, updated);
    return { ...updated };
  }
}
