import type { Evidence } from "@dre/core";

export interface Collected<T> {
  items: T[];
  evidence: Evidence[];
  warnings: string[];
}

export interface PlanCandidate {
  name: string;
  priceText: string;
  line: string;
}

export interface TermsPassage {
  sourceUrl: string;
  text: string;
}
