// 「今週集まれそうな時間・曜日」サマリーゾーン
// マトリクス表を目で集計しなくても、一目で候補がわかるようにする

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
  // 上位6件を横3×2段で表示する
  const candidates = computeTopCandidates(entries, 6);
  if (candidates.length === 0) return null;

  const weekLabel = formatWeekRangeJp(getCurrentWeekRangeJst());
  const commented = entries.filter((entry) => entry.comment.trim().length > 0);

  return (
    <section className="section-card summary-card">
      <div className="summary-header">
        <p className="section-label">今週集まれそうな時間・曜日</p>
        <span className="summary-week-label">
          <span className="summary-week-tag">今週分</span>
          <span className="summary-week-range">{weekLabel}</span>
        </span>
      </div>
      {commented.length > 0 && (
        <div className="summary-comments">
          {commented.map((entry) => (
            <div key={entry.name} className="summary-comment">
              <p className="summary-comment-name">{entry.name}</p>
              <p className="summary-comment-body">{entry.comment}</p>
            </div>
          ))}
        </div>
      )}
      <div className="summary-chips">
        {candidates.map((candidate) => (
          <div
            key={`${candidate.slotId}-${candidate.weekday}`}
            className="summary-chip"
            data-slot={candidate.slotId}
          >
            <span className="summary-weekday">{candidate.weekday}</span>
            <span className="summary-slot">{slotLabel(candidate.slotId)}</span>
            <span className="summary-count">
              {candidate.count}/{candidate.total}人
            </span>
            {candidate.count === candidate.total && (
              <span className="summary-badge">全員OK</span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
