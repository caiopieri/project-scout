import { type RepairProposalBuilder as RepairProposalBuilderPort } from '@scout/domain';
import {
  repairProposalInputSchema,
  repairProposalSchema,
  type RepairProposal,
} from '@scout/schemas';

export const REPAIR_PROPOSAL_VERSION = 'repair-proposal.v1' as const;

export class RepairProposalBuilder implements RepairProposalBuilderPort {
  build(rawInput: unknown): RepairProposal {
    const input = repairProposalInputSchema.parse(rawInput);

    return repairProposalSchema.parse({
      ...input,
      version: REPAIR_PROPOSAL_VERSION,
      status: 'PROPOSED',
      requiresHumanApproval: true,
      executable: false,
    });
  }
}
