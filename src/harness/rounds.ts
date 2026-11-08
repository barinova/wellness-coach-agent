import type { ToolCallInfo } from "./collectToolCalls";
import type { Review } from "./validateReview";

export type RoundState = {
  round: number;
  plan: string;
  review: Review;
  toolCalls: ToolCallInfo[];
};

export function emptyRounds(): RoundState[] {
  return [];
}

export function appendRound(
  history: RoundState[],
  round: number,
  plan: string,
  review: Review,
  toolCalls: ToolCallInfo[] = [],
): RoundState[] {
  return [...history, { round, plan, review, toolCalls }];
}
