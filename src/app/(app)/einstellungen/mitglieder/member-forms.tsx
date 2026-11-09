"use client";

import { useActionState } from "react";
import { MoreHorizontal } from "lucide-react";
import { inviteMember, memberAction, type MemberState } from "./actions";
import { Field, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/feedback";
import { ManualLink } from "@/components/manual-link";

export function InviteForm() {
  const [state, action] = useActionState<MemberState, FormData>(inviteMember, {});
  return (
    <form action={action} className="flex flex-col gap-4" key={state.ok ?? JSON.stringify(state.values ?? {})}>
      {state.ok && <Alert tone="success">{state.ok}</Alert>}
      {state.link && <ManualLink url={state.link} label="Einladungslink" />}
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <Field label="Name" htmlFor="displayName" error={state.fieldErrors?.displayName}>
        <Input id="displayName" name="displayName" defaultValue={state.values?.displayName} required maxLength={80} autoComplete="off" />
      </Field>
      <Field label="E-Mail" htmlFor="email" error={state.fieldErrors?.email}>
        <Input id="email" name="email" type="email" defaultValue={state.values?.email} required inputMode="email" autoComplete="off" />
      </Field>
      <Field label="Rolle" htmlFor="role" hint="Admins können Mitglieder verwalten und die Organisation bearbeiten.">
        <Select id="role" name="role" defaultValue={state.values?.role ?? "member"}>
          <option value="member">Mitglied</option>
          <option value="admin">Admin</option>
        </Select>
      </Field>
      <SubmitButton pendingText="Einladen …">Einladung senden</SubmitButton>
    </form>
  );
}

type Member = { id: string; role: "admin" | "member"; status: "invited" | "active" | "deactivated" };

export function MemberMenu({ member, isSelf }: { member: Member; isSelf: boolean }) {
  const [state, action] = useActionState<MemberState, FormData>(memberAction, {});
  const ops: { op: string; label: string; danger?: boolean }[] = [];
  if (member.status === "invited") ops.push({ op: "resend", label: "Einladung erneut senden" });
  if (member.status !== "deactivated") {
    ops.push(member.role === "admin" ? { op: "make-member", label: "Zum Mitglied machen" } : { op: "make-admin", label: "Zum Admin machen" });
    if (!isSelf) ops.push({ op: "deactivate", label: "Deaktivieren", danger: true });
  } else {
    ops.push({ op: "reactivate", label: "Reaktivieren" });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <details className="group relative">
        <summary
          className="grid size-9 cursor-pointer list-none place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg [&::-webkit-details-marker]:hidden"
          aria-label="Aktionen"
        >
          <MoreHorizontal className="size-5" aria-hidden />
        </summary>
        <div className="absolute right-0 z-10 mt-1 w-56 rounded-xl border border-border bg-surface p-1 shadow-lg">
          {ops.map((o) => (
            <form key={o.op} action={action}>
              <input type="hidden" name="memberId" value={member.id} />
              <input type="hidden" name="op" value={o.op} />
              <button
                type="submit"
                className={`w-full rounded-lg px-3 py-2 text-left text-sm font-semibold hover:bg-surface-2 ${o.danger ? "text-danger" : ""}`}
              >
                {o.label}
              </button>
            </form>
          ))}
        </div>
      </details>
      {state.error && <span className="max-w-56 text-right text-xs text-danger">{state.error}</span>}
      {state.ok && <span className="max-w-56 text-right text-xs text-success">{state.ok}</span>}
      {state.link && (
        <div className="w-64 max-w-[65vw]">
          <ManualLink url={state.link} label="Einladungslink" />
        </div>
      )}
    </div>
  );
}
