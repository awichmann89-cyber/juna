import { Check, Clock3, X } from "lucide-react";
import { markAllPresent, setAttendance } from "@/app/(app)/leiterrunde/actions";
import type { AttendanceStatus } from "@/db/schema";
import { Avatar } from "@/components/ui/feedback";
import { attendanceLabels } from "@/lib/meetings-data";
import { cn } from "@/lib/utils";

const icons = { anwesend: Check, entschuldigt: Clock3, fehlt: X } as const;
const active: Record<AttendanceStatus, string> = {
  anwesend: "border-success bg-success-soft text-success",
  entschuldigt: "border-warning bg-warning-soft text-warning",
  fehlt: "border-danger bg-danger-soft text-danger",
};

export function Attendance({
  meetingId,
  members,
  attendance,
  currentUserId,
  canRecordOthers,
}: {
  meetingId: string;
  members: { id: string; name: string }[];
  attendance: Map<string, AttendanceStatus>;
  currentUserId: string;
  canRecordOthers: boolean;
}) {
  const present = members.filter((m) => attendance.get(m.id) === "anwesend").length;
  const open = members.filter((m) => !attendance.has(m.id)).length;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="font-semibold">
          {present} von {members.length} anwesend
        </span>
        {canRecordOthers && open > 0 && (
          <form action={markAllPresent}>
            <input type="hidden" name="meetingId" value={meetingId} />
            <button type="submit" className="font-semibold text-primary hover:underline">
              Übrige als anwesend
            </button>
          </form>
        )}
      </div>
      <ul className="flex flex-col divide-y divide-border">
        {members.map((m) => {
          const status = attendance.get(m.id);
          const editable = canRecordOthers || m.id === currentUserId;
          return (
            <li key={m.id} className="flex items-center gap-2.5 py-2">
              <Avatar name={m.name} className="size-8 text-xs" />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                {m.name}
                {m.id === currentUserId && <span className="font-normal text-muted"> (du)</span>}
              </span>
              {editable ? (
                <form action={setAttendance} className="flex gap-1">
                  <input type="hidden" name="meetingId" value={meetingId} />
                  <input type="hidden" name="userId" value={m.id} />
                  {(Object.keys(icons) as AttendanceStatus[]).map((s) => {
                    const Icon = icons[s];
                    const on = status === s;
                    return (
                      <button
                        key={s}
                        type="submit"
                        name="status"
                        value={on ? "" : s}
                        aria-pressed={on}
                        title={attendanceLabels[s]}
                        aria-label={`${m.name}: ${attendanceLabels[s]}`}
                        className={cn(
                          "grid size-8 place-items-center rounded-lg border transition-colors",
                          on ? active[s] : "border-border text-muted hover:bg-surface-2",
                        )}
                      >
                        <Icon className="size-4" aria-hidden />
                      </button>
                    );
                  })}
                </form>
              ) : (
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", status ? active[status] : "text-muted")}>
                  {status ? attendanceLabels[status] : "–"}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
