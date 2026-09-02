export function calculateFreshnessScore(latestMeaningfulSignalAt: string | null, now = new Date()): number {
  if (!latestMeaningfulSignalAt) return 0;
  const ageDays = Math.max(0, (now.getTime() - new Date(latestMeaningfulSignalAt).getTime()) / 86400000);
  if (ageDays <= 3) return 100;
  if (ageDays <= 7) return 85;
  if (ageDays <= 14) return 65;
  if (ageDays <= 30) return 40;
  if (ageDays <= 60) return 20;
  return 0;
}

export function calculateFinalRankScore(businessScore: number, freshnessScore: number): number {
  return businessScore * 0.8 + freshnessScore * 0.2;
}
