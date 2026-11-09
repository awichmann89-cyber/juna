import "server-only";
import { env } from "@/lib/env";

/** true, wenn echte Mails verschickt werden (RESEND_API_KEY gesetzt). */
export function mailEnabled() {
  return Boolean(env.resendApiKey);
}

type Mail = { to: string | string[]; subject: string; text: string; html?: string; replyTo?: string };

/**
 * Versand über Resend (REST). Ohne RESEND_API_KEY wird die Mail nur geloggt –
 * praktisch für die lokale Entwicklung (Einladungslinks erscheinen in der Konsole).
 */
export async function sendMail(mail: Mail): Promise<{ ok: boolean; error?: string }> {
  const apiKey = env.resendApiKey;
  if (!apiKey) {
    console.info(`\n[mail:dev] An: ${[mail.to].flat().join(", ")}\n[mail:dev] Betreff: ${mail.subject}\n${mail.text}\n`);
    return { ok: true };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.mailFrom,
      to: [mail.to].flat(),
      subject: mail.subject,
      text: mail.text,
      html: mail.html ?? renderHtml(mail.subject, mail.text),
      reply_to: mail.replyTo,
    }),
  });
  if (!res.ok) {
    const error = await res.text();
    console.error("[mail] Versand fehlgeschlagen", res.status, error);
    return { ok: false, error };
  }
  return { ok: true };
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Schlichtes, mailclient-taugliches HTML im juna-Look; URLs werden zu Buttons/Links. */
function renderHtml(subject: string, text: string) {
  const body = escapeHtml(text)
    .split(/\n{2,}/)
    .map((para) => {
      const trimmed = para.trim();
      if (/^https?:\/\/\S+$/.test(trimmed)) {
        return `<p style="margin:24px 0"><a href="${trimmed}" style="background:#E8553F;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:700;display:inline-block">Weiter zu juna</a></p><p style="font-size:12px;color:#8a7f78;word-break:break-all">${trimmed}</p>`;
      }
      return `<p style="margin:0 0 14px">${para.replace(/\n/g, "<br>")}</p>`;
    })
    .join("");
  return `<!doctype html><html lang="de"><body style="margin:0;background:#FFF8F3;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#2b211c">
<div style="max-width:520px;margin:0 auto;padding:32px 20px">
<div style="font-size:22px;font-weight:800;color:#E8553F;margin-bottom:20px">juna</div>
<div style="background:#fff;border-radius:16px;padding:28px;border:1px solid #f1e4da">
<h1 style="font-size:18px;margin:0 0 16px">${escapeHtml(subject)}</h1>${body}</div>
<p style="font-size:12px;color:#8a7f78;margin-top:20px">juna · Aktionsplanung für Leiterrunden · juna.app</p>
</div></body></html>`;
}
