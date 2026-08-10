// 「今週集まれそうな時間・曜日」— 画面の主役。
// 上位候補を「曜日 × 時間帯」のカードで並べ、それぞれ誰が希望しているかまで見せる。

import { buildPersonColors } from "@/lib/personColor";
import { computeTopCandidates } from "@/lib/summary";
import { TIME_SLOTS } from "@/lib/timeSlots";
import type { MemberEntry, SlotId } from "@/lib/types";
import { formatWeekRangeJp, getCurrentWeekRangeJst } from "@/lib/weekRange";

interface ScheduleSummaryProps {
  entries: MemberEntry[];
}

function slotLabel(slotId: SlotId): string {
  return TIME_SLOTS.find((slot) => slot.id === slotId)?.label ?? slotId;
}

export default function ScheduleSummary({ entries }: ScheduleSummaryProps) {
  // 上位3件だけを横並びで見せる。全候補の一覧は下の AvailabilityGrid が持つので、
  // ここは「本命はどこか」に絞る
  const candidates = computeTopCandidates(entries, 3);
  if (candidates.length === 0) return null;

  const weekLabel = formatWeekRangeJp(getCurrentWeekRangeJst());

  // 全候補が同数のときは差がないので「最多」は出さない（バッジがただのノイズになる）
  const topCount = candidates[0].count;
  const hasTopStandout = candidates.some(
    (candidate) => candidate.count < topCount,
  );

  const personColors = buildPersonColors(entries.map((entry) => entry.name));

  return (
    <section className="summary">
      <div className="summary-header">
        <h2 className="summary-title">今週集まれそうな時間・曜日</h2>
        <span className="summary-week-label">
          <span className="summary-week-tag">今週分</span>
          <span className="summary-week-range">{weekLabel}</span>
        </span>
      </div>

      <div className="summary-chips">
        {candidates.map((candidate) => {
          const isTop = hasTopStandout && candidate.count === topCount;
          const wanted = entries.filter((entry) =>
            entry.preferences[candidate.slotId].includes(candidate.weekday),
          );
          return (
            <div
              key={`${candidate.slotId}-${candidate.weekday}`}
              className="summary-chip"
              data-slot={candidate.slotId}
              data-top={isTop ? "" : undefined}
            >
              <div className="summary-chip-head">
                <span className="summary-weekday">{candidate.weekday}</span>
                <span className="summary-badges">
                  {isTop && (
                    <span className="summary-badge summary-badge-top">最多</span>
                  )}
                  {candidate.count === candidate.total && (
                    <span className="summary-badge">全員OK</span>
                  )}
                </span>
              </div>

              <span className="summary-slot">{slotLabel(candidate.slotId)}</span>

              <p className="summary-count">
                <span className="summary-count-num">{candidate.count}</span>
                <span className="summary-count-total">
                  ／ {candidate.total}人が希望
                </span>
              </p>

              <span className="summary-bar" aria-hidden="true">
                {Array.from({ length: candidate.total }, (_, i) => (
                  <i
                    key={i}
                    className="summary-bar-seg"
                    data-on={i < candidate.count ? "" : undefined}
                  />
                ))}
              </span>

              <ul className="summary-people">
                {wanted.map((entry) => (
                  <li
                    key={entry.name}
                    className="summary-person"
                    style={{ backgroundColor: personColors.get(entry.name) }}
                  >
                    {entry.name}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
