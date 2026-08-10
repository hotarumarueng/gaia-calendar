// 「誰がどこに入れたか」— 縦=名前 × 横=（時間帯 × 曜日）
//
// モックの重なり表と同じ作り: 罫線を一切引かず、角丸のタイルを隙間を空けて敷き詰める。
// 塗りは人の色（roster と同じ）なので、行がそのままその人の帯になる。

import { computeTopCandidates } from "@/lib/summary";
import { buildPersonColors } from "@/lib/personColor";
import { TIME_SLOTS } from "@/lib/timeSlots";
import type { MemberEntry, SlotId, Weekday } from "@/lib/types";

interface AvailabilityGridProps {
  entries: MemberEntry[];
}

interface Column {
  slotId: SlotId;
  weekday: Weekday;
}

/** TIME_SLOTS を (時間帯 × 選べる曜日) の列に展開する */
function buildColumns(): Column[] {
  return TIME_SLOTS.flatMap((slot) =>
    slot.weekdays.map((weekday) => ({ slotId: slot.id, weekday })),
  );
}

/** グリッドの下に出す一文。「結局どこなのか」を言葉でも言う（モックの overlapNote と同じ役割） */
function buildNote(entries: MemberEntry[]): string {
  const top = computeTopCandidates(entries, 1)[0];
  if (top === undefined) {
    return "まだ誰も曜日を選んでいません。";
  }
  // 同数タイは全部並べる（「ここしかない」のか「どれでもいい」のかが分かるように）
  const places = computeTopCandidates(entries, columnCount())
    .filter((candidate) => candidate.count === top.count)
    .map((candidate) => {
      const slotLabel =
        TIME_SLOTS.find((slot) => slot.id === candidate.slotId)?.label ?? "";
      return `${candidate.weekday} ${slotLabel}`;
    })
    .join("・");

  return top.count === top.total
    ? `${places} なら全員そろいます（${top.count}人）。`
    : `いちばん集まるのは ${places}（${top.count}／${top.total}人）。`;
}

/** 候補になりうる (時間帯 × 曜日) の総数 */
function columnCount(): number {
  return TIME_SLOTS.reduce((total, slot) => total + slot.weekdays.length, 0);
}

export default function AvailabilityGrid({ entries }: AvailabilityGridProps) {
  if (entries.length === 0) return null;

  const columns = buildColumns();
  const counts = columns.map(
    (column) =>
      entries.filter((entry) =>
        entry.preferences[column.slotId].includes(column.weekday),
      ).length,
  );
  const maxCount = Math.max(...counts);
  const personColors = buildPersonColors(entries.map((entry) => entry.name));

  return (
    <section className="avail">
      <h2 className="avail-title">誰がどこに入れたか</h2>

      <div className="avail-wrap">
        <table className="avail-table">
          <thead>
            <tr>
              <td className="avail-corner" />
              {TIME_SLOTS.map((slot) => (
                <th
                  key={slot.id}
                  scope="colgroup"
                  colSpan={slot.weekdays.length}
                  className="avail-slot-head"
                >
                  {slot.label}
                </th>
              ))}
            </tr>
            <tr>
              <td className="avail-corner" />
              {columns.map((column) => (
                <th
                  key={`${column.slotId}-${column.weekday}`}
                  scope="col"
                  className="avail-day-head"
                >
                  {column.weekday}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {entries.map((entry) => {
              const color = personColors.get(entry.name);
              return (
                <tr key={entry.name}>
                  <th
                    scope="row"
                    className="avail-name"
                    style={{ backgroundColor: color }}
                  >
                    {entry.name}
                  </th>
                  {columns.map((column) => {
                    const on = entry.preferences[column.slotId].includes(
                      column.weekday,
                    );
                    return (
                      <td
                        key={`${column.slotId}-${column.weekday}`}
                        className="avail-cell"
                        data-on={on ? "" : undefined}
                        style={on ? { backgroundColor: color } : undefined}
                      >
                        {/* 色だけに頼らず ○ も出す（色覚に依存させない） */}
                        {on ? "○" : ""}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>

          <tfoot>
            <tr>
              <th scope="row" className="avail-name avail-total-label">合計</th>
              {columns.map((column, index) => (
                <td
                  key={`${column.slotId}-${column.weekday}`}
                  className="avail-total"
                  data-top={counts[index] === maxCount ? "" : undefined}
                >
                  {counts[index]}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="avail-note">{buildNote(entries)}</p>
    </section>
  );
}
