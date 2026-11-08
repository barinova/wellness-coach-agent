/** Run-scoped flag: only the harness flips this after reviewer approve. */
export type SavePlanGate = {
  allowSavePlan: boolean;
};

export function createSavePlanGate(): SavePlanGate {
  return { allowSavePlan: false };
}
