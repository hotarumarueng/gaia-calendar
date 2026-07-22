// 「今週集まれそうな時間・曜日」サマリーゾーン
// マトリクス表を目で集計しなくても、一目で候補がわかるようにする

import { computeTopCandidates } from "@/lib/summary";
import { TIME_SLOTS } from "@/lib/timeSlots";
import type { MemberEntry, SlotId } from "@/lib/types";

interface ScheduleSummaryProps {
  entries: MemberEntry[];
}

function slotLabel(slotId: SlotId): string {
  return TIME_SLOTS.find((slot) => slot.id === slotId)?.label ?? slotId;
}

export default function ScheduleSummary({ entries }: ScheduleSummaryProps) {
  const candidates = computeTopCandidates(entries);
  if (candidates.length === 0) return null;

  return (
    <section className="section-card summary-card">
      <p className="section-label">今週集まれそうな時間・曜日</p>
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
