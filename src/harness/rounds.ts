import type { Review } from "./validateReview";

export type RoundState = {
  round: number;
  plan: string;
  review: Review;
};

export function emptyRounds(): RoundState[] {
  return [];
}

export function appendRound(
  history: RoundState[],
  round: number,
  plan: string,
  review: Review,
): RoundState[] {
  return [...history, { round, plan, review }];
}
