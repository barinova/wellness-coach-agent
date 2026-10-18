import type { RoundState } from "./rounds";

export function finalScore(rounds: RoundState[]): number | null {
  for (let i = rounds.length - 1; i >= 0; i--) {
    if (rounds[i].review.verdict === "approve") return rounds[i].review.score;
  }
  return null;
}

export function improved(rounds: RoundState[]): boolean {
  for (let i = 1; i < rounds.length; i++) {
    if (rounds[i].review.score > rounds[i - 1].review.score) return true;
  }
  return false;
}
