/** DataCompletenessDto */
export interface DataCompleteness {
  total: number;
  withData: number;
  withoutData: number;
  completeness: number;
}

export interface CustomerContractValueRow {
  customerId: number;
  customerName: string;
  customerCode: string | null;
  projectContractValue: string;
  maContractValue: string;
  maAddonValue: string;
  oneTimeChargeValue: string;
  totalContractValue: string;
  overlappingContractCount: number;
}

export interface ContractValueByCustomerReport {
  disclaimer: string;
  dateFrom: string | null;
  dateTo: string | null;
  grandTotalContractValue: string;
  items: CustomerContractValueRow[];
  oneTimeCompleteness: DataCompleteness;
  excludedCancelledValue: string;
  excludedCancelledCount: number;
}

export interface ContractValueByTypeReport {
  disclaimer: string;
  dateFrom: string | null;
  dateTo: string | null;
  projectContractValue: string;
  projectCount: number;
  maContractValue: string;
  maContractCount: number;
  maAddonValue: string;
  maAddonCount: number;
  oneTimeChargeValue: string;
  oneTimeCompleteness: DataCompleteness;
  totalContractValue: string;
  excludedCancelledValue: string;
  excludedCancelledCount: number;
}

export interface UpcomingContractItem {
  contractId: number;
  customerId: number;
  customerName?: string | null;
  contractNo?: string | null;
  price: string;
  startDate: string;
  endDate: string;
  daysUntilExpiry?: number;
}

export interface UpcomingContractValueReport {
  disclaimer: string;
  totalContractValue: string;
  contractCount: number;
  overlappingContractCount: number;
  items: UpcomingContractItem[];
}

export interface CustomerServiceCostRow {
  customerId: number;
  customerName: string;
  totalHours: string;
  completeness: DataCompleteness;
}

export interface ServiceCostReport {
  disclaimer: string;
  dateFrom: string | null;
  dateTo: string | null;
  totalHours: string;
  completeness: DataCompleteness;
  items: CustomerServiceCostRow[];
}

export interface ContractOverlapReport {
  disclaimer: string;
  customerCount: number;
  contractCount: number;
  items: Array<{
    customerId: number;
    customerName?: string | null;
    contracts?: unknown[];
  }>;
}

export interface CustomerLifetimeValue {
  disclaimer: string;
  projectContractValue: string;
  maContractValue: string;
  maAddonValue: string;
  oneTimeChargeValue: string;
  totalContractValue: string;
  excludedCancelledValue: string;
  excludedCancelledCount: number;
  oneTimeCompleteness: DataCompleteness;
  overlappingContractCount: number;
}

export function formatCompleteness(c: DataCompleteness | null | undefined): string {
  if (!c) {
    return '';
  }
  return `กรอกครบ ${c.completeness}% (${c.withData}/${c.total})`;
}
