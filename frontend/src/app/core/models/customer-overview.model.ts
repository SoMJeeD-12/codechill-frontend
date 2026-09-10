import { CustomerLifetimeValue } from './report.model';
import { Project } from './project.model';
import { Warranty } from './warranty.model';
import { MaContract } from './ma.model';
import { Ticket } from './ticket.model';
import { FollowUp } from './follow-up.model';

/** CustomerOverviewDto — GET /customers/:id/overview */
export interface CustomerOverview {
  customerId: number;
  customerName: string;
  customerCode: string | null;
  customerStatus: string;
  lastContactedAt: string | null;
  idleDays: number | null;
  projects: Project[] | OverviewLite[];
  warranties: Warranty[] | OverviewLite[];
  maContracts: MaContract[] | OverviewLite[];
  tickets: Ticket[] | OverviewLite[];
  followUps: FollowUp[] | OverviewLite[];
  lifetimeValue?: CustomerLifetimeValue | null;
}

export interface OverviewLite {
  id: number;
  [key: string]: unknown;
}
