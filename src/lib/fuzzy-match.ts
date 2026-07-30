function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function levenshtein(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0));

  for (let i = 0; i < rows; i++) dp[i][0] = i;
  for (let j = 0; j < cols; j++) dp[0][j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }

  return dp[rows - 1][cols - 1];
}

function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  if (a.includes(b) || b.includes(a)) return 0.85;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

/** Encontra a pessoa cujo nome mais se parece com o texto falado (pt-BR, tolera acento/ruído). */
export function findBestPersonMatch<T extends { name: string }>(
  spoken: string,
  people: T[],
  threshold = 0.55
): T | null {
  const target = normalize(spoken);
  if (!target) return null;

  let best: T | null = null;
  let bestScore = -Infinity;

  for (const person of people) {
    const score = similarity(target, normalize(person.name));
    if (score > bestScore) {
      bestScore = score;
      best = person;
    }
  }

  return bestScore >= threshold ? best : null;
}
