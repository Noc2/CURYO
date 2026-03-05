"use client";

interface CategoryStat {
  id: string;
  categoryName: string | null;
  categoryId: string;
  winRate: number;
  totalWins: number;
  totalLosses: number;
}

/**
 * Horizontal stacked bars showing win/loss ratio per category.
 * Green = wins, red = losses. Category name on left, win rate + record on right.
 */
export function CategoryBars({ categories }: { categories: CategoryStat[] }) {
  if (categories.length === 0) return null;

  const formatRate = (rate: number) => `${(rate * 100).toFixed(1)}%`;

  return (
    <div className="space-y-1.5">
      <span className="text-base text-base-content/40">By category</span>
      <div className="space-y-2">
        {categories.map(cat => {
          const total = cat.totalWins + cat.totalLosses;
          const winPct = total > 0 ? (cat.totalWins / total) * 100 : 0;
          const lossPct = total > 0 ? (cat.totalLosses / total) * 100 : 0;

          return (
            <div key={cat.id} className="space-y-0.5">
              {/* Label row */}
              <div className="flex items-center justify-between text-base">
                <span className="text-base-content/60 truncate mr-2">{cat.categoryName ?? `#${cat.categoryId}`}</span>
                <span className="font-mono tabular-nums text-base-content/50 shrink-0">
                  {formatRate(cat.winRate)}
                  <span className="text-base-content/30 ml-1.5">
                    ({cat.totalWins}W / {cat.totalLosses}L)
                  </span>
                </span>
              </div>

              {/* Stacked bar */}
              <div className="flex h-2 w-full rounded-full overflow-hidden bg-base-content/[0.06]">
                {winPct > 0 && (
                  <div className="h-full bg-success/70 transition-all duration-300" style={{ width: `${winPct}%` }} />
                )}
                {lossPct > 0 && (
                  <div className="h-full bg-error/50 transition-all duration-300" style={{ width: `${lossPct}%` }} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
