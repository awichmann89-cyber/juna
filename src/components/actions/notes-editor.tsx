"use client";

import "@blocknote/mantine/style.css";
import { lazy, Suspense, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { BlockNoteSchema, defaultBlockSpecs, type BlockNoteEditor, type PartialBlock } from "@blocknote/core";
import { de } from "@blocknote/core/locales";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView, type Theme } from "@blocknote/mantine";
import { CircleAlert, Check, LoaderCircle } from "lucide-react";
import { saveNotes } from "@/app/(app)/aktionen/actions";
import { saveMeetingNotes } from "@/app/(app)/leiterrunde/actions";

// Medien (Bild/Video/Audio/Datei) kommen mit dem Tab „Dateien“ (Phase 4) – bis dahin aus dem Editor entfernt
const { image: _image, video: _video, audio: _audio, file: _file, ...blockSpecs } = defaultBlockSpecs;
void _image;
void _video;
void _audio;
void _file;
export const schema = BlockNoteSchema.create({ blockSpecs });

const shared = { borderRadius: 10, fontFamily: "var(--font-nunito), ui-sans-serif, system-ui, sans-serif" };
export const lightTheme: Theme = {
  ...shared,
  colors: {
    editor: { text: "#2b211c", background: "transparent" },
    menu: { text: "#2b211c", background: "#ffffff" },
    tooltip: { text: "#ffffff", background: "#2b211c" },
    hovered: { text: "#2b211c", background: "#f6efe9" },
    selected: { text: "#ffffff", background: "#e8553f" },
    disabled: { text: "#b0a198", background: "#f6efe9" },
    shadow: "#ece1d8",
    border: "#ece1d8",
    sideMenu: "#b0a198",
  },
};
export const darkTheme: Theme = {
  ...shared,
  colors: {
    editor: { text: "#f5ede7", background: "transparent" },
    menu: { text: "#f5ede7", background: "#2a211c" },
    tooltip: { text: "#1b120e", background: "#f5ede7" },
    hovered: { text: "#f5ede7", background: "#3a2e27" },
    selected: { text: "#1b120e", background: "#ff7a55" },
    disabled: { text: "#7d7069", background: "#2a211c" },
    shadow: "#000000",
    border: "#3a2e27",
    sideMenu: "#7d7069",
  },
};

export function useDarkMode() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
    () => false,
  );
}

const SAVE_DELAY_MS = 1200;
const LIVE_SAVE_DELAY_MS = 2500;

type SaveState = { kind: "saved"; at?: string } | { kind: "dirty" } | { kind: "saving" } | { kind: "error"; message: string } | { kind: "conflict"; message: string };

export type NotesEditorProps = {
  actionId?: string;
  /** Statt einer Aktion das Protokoll eines Treffens bearbeiten */
  meetingId?: string;
  placeholder?: string;
  initialBlocks: unknown[] | null;
  initialVersion: number;
  lastSavedLabel?: string;
  /** Gemeinsames Bearbeiten in Echtzeit über Liveblocks */
  live?: boolean;
  /** Liveblocks-Raum (nur im Live-Modus) */
  roomId?: string;
};

export function editorDictionary(placeholder?: string) {
  return {
    ...de,
    placeholders: { ...de.placeholders, emptyDocument: placeholder ?? "Notizen, Ablauf, Ideen … Tippe „/“ für Blöcke oder nutze Markdown wie # oder -" },
  };
}

export function initialContentOf(blocks: unknown[] | null) {
  return blocks && blocks.length > 0 ? (blocks as PartialBlock<typeof schema.blockSchema>[]) : undefined;
}

const LiveNotesEditor = lazy(() => import("./live-notes-editor"));

export default function NotesEditor(props: NotesEditorProps) {
  if (props.live) {
    return (
      <Suspense fallback={<div className="min-h-64" />}>
        <LiveNotesEditor {...props} />
      </Suspense>
    );
  }
  return <PlainNotesEditor {...props} />;
}

function PlainNotesEditor(props: NotesEditorProps) {
  const editor = useCreateBlockNote({
    schema,
    dictionary: editorDictionary(props.placeholder),
    initialContent: initialContentOf(props.initialBlocks),
  });
  return <EditorWithAutosave editor={editor} {...props} />;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEditor = BlockNoteEditor<any, any, any>;

/**
 * Editor-Ansicht mit Autosave.
 * - Einzelmodus: optimistische Versionierung, Konflikt wird angezeigt
 * - Live-Modus: das Dokument ist geteilt; jeder Client speichert nur nach eigenen Änderungen einen Schnappschuss (ohne Versionsprüfung)
 */
export function EditorWithAutosave({
  editor,
  actionId,
  meetingId,
  initialVersion,
  lastSavedLabel,
  live,
  children,
}: NotesEditorProps & { editor: AnyEditor; children?: React.ReactNode }) {
  const dark = useDarkMode();
  const delay = live ? LIVE_SAVE_DELAY_MS : SAVE_DELAY_MS;
  const [state, setState] = useState<SaveState>({ kind: "saved" });
  const version = useRef(initialVersion);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const pending = useRef(false);
  const stopped = useRef(false);

  const retryRef = useRef<() => void>(() => {});

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (stopped.current) return;
    if (inFlight.current) {
      pending.current = true;
      return;
    }
    inFlight.current = true;
    try {
      // Solange während des Speicherns weitere Änderungen eintreffen, erneut speichern
      do {
        pending.current = false;
        setState({ kind: "saving" });
        const expected = live ? -1 : version.current;
        const result = await (meetingId
          ? saveMeetingNotes(meetingId, editor.document, expected)
          : saveNotes(actionId!, editor.document, expected)
        ).catch(() => ({
          ok: false as const,
          reason: "error" as const,
          message: "Keine Verbindung – wir versuchen es gleich noch einmal.",
        }));
        if (result.ok) {
          version.current = result.version;
          if (!pending.current) setState({ kind: "saved", at: result.savedAt });
        } else if (result.reason === "conflict") {
          stopped.current = true;
          setState({ kind: "conflict", message: result.message });
          return;
        } else {
          setState({ kind: "error", message: result.message });
          if (result.reason === "error") timer.current = setTimeout(() => retryRef.current(), 5000);
          return;
        }
      } while (pending.current && !stopped.current);
    } finally {
      inFlight.current = false;
    }
  }, [actionId, meetingId, editor, live]);

  useEffect(() => {
    retryRef.current = () => void flush();
  }, [flush]);

  const schedule = useCallback(() => {
    if (stopped.current) return;
    setState((s) => (s.kind === "saving" ? s : { kind: "dirty" }));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), delay);
  }, [flush, delay]);

  // Live: nur lokale Änderungen lösen das Speichern aus (sonst würden alle Clients dasselbe speichern)
  useEffect(() => {
    if (!live) return;
    return editor.onChange(() => schedule(), false);
  }, [editor, live, schedule]);

  // Beim Verlassen/Wechseln der App sofort speichern; Warnung bei ungespeicherten Änderungen
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden" && timer.current) void flush();
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (timer.current || inFlight.current) {
        void flush();
        e.preventDefault();
      }
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (timer.current) void flush();
    };
  }, [flush]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">{children}</div>
        <SaveIndicator state={state} lastSavedLabel={lastSavedLabel} />
      </div>
      {state.kind === "conflict" && (
        <div role="alert" className="flex flex-col gap-2 rounded-xl bg-warning-soft p-3 text-sm text-warning sm:flex-row sm:items-center">
          <span className="flex-1">{state.message} Deine letzten Änderungen wurden nicht gespeichert.</span>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg bg-surface px-3 py-1.5 font-semibold text-fg"
          >
            Neu laden
          </button>
        </div>
      )}
      <div className="juna-editor -mx-3 min-h-64 rounded-xl sm:-mx-6">
        <BlockNoteView
          editor={editor}
          theme={dark ? darkTheme : lightTheme}
          onChange={live ? undefined : schedule}
          editable={state.kind !== "conflict"}
        />
      </div>
    </div>
  );
}

const timeFmt = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" });

function SaveIndicator({ state, lastSavedLabel }: { state: SaveState; lastSavedLabel?: string }) {
  let content: React.ReactNode;
  switch (state.kind) {
    case "saving":
      content = (
        <>
          <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> Speichert …
        </>
      );
      break;
    case "dirty":
      content = "Ungespeicherte Änderungen";
      break;
    case "error":
      content = (
        <span className="inline-flex items-center gap-1.5 text-danger">
          <CircleAlert className="size-3.5" aria-hidden /> {state.message}
        </span>
      );
      break;
    case "conflict":
      content = (
        <span className="inline-flex items-center gap-1.5 text-warning">
          <CircleAlert className="size-3.5" aria-hidden /> Nicht gespeichert
        </span>
      );
      break;
    default:
      content = (
        <>
          <Check className="size-3.5 text-success" aria-hidden />
          {state.at ? `Gespeichert um ${timeFmt.format(new Date(state.at))}` : lastSavedLabel ?? "Alles gespeichert"}
        </>
      );
  }
  return (
    <div className="flex min-h-5 items-center justify-end gap-1.5 text-xs font-semibold text-muted" aria-live="polite" data-save-state={state.kind}>
      {content}
    </div>
  );
}
