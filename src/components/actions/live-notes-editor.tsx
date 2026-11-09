"use client";

import "@liveblocks/react-ui/styles.css";
import "@liveblocks/react-blocknote/styles.css";
import { useEffect, useRef, useState } from "react";
import { ClientSideSuspense, LiveblocksProvider, RoomProvider, useOthers, useSelf, useStatus } from "@liveblocks/react/suspense";
import { useCreateBlockNoteWithLiveblocks, useIsEditorReady } from "@liveblocks/react-blocknote";
import { CloudOff } from "lucide-react";
import { EditorWithAutosave, editorDictionary, actionSchema, initialContentOf, schema, type NotesEditorProps } from "./notes-editor";

export default function LiveNotesEditor(props: NotesEditorProps) {
  if (!props.roomId) return null;
  return (
    <LiveblocksProvider authEndpoint="/api/liveblocks-auth" throttle={50}>
      <RoomProvider id={props.roomId} initialPresence={{}}>
        <ClientSideSuspense fallback={<div className="min-h-64" />}>
          <LiveEditor {...props} />
        </ClientSideSuspense>
      </RoomProvider>
    </LiveblocksProvider>
  );
}

function LiveEditor(props: NotesEditorProps) {
  const editor = useCreateBlockNoteWithLiveblocks(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { schema: (props.tasks ? actionSchema : schema) as any, dictionary: editorDictionary(props.placeholder) },
    { mentions: false, comments: false },
  );
  const ready = useIsEditorReady();
  const others = useOthers();
  const self = useSelf();
  const seededFrom = useRef<unknown>(null);

  // Leerer Raum (erstes Öffnen oder nach „Von früherer Durchführung übernehmen“):
  // mit dem in juna gespeicherten Stand befüllen. Damit der Inhalt nicht doppelt eingefügt wird,
  // übernimmt das nur der Client mit der kleinsten Verbindungs-ID im Raum.
  useEffect(() => {
    if (!ready || seededFrom.current === props.initialBlocks) return;
    const initial = initialContentOf(props.initialBlocks);
    if (!initial) return;
    const leader = others.every((o) => o.connectionId > self.connectionId);
    if (!leader) return;
    seededFrom.current = props.initialBlocks;
    const doc = editor.document;
    const empty = doc.length === 0 || (doc.length === 1 && Array.isArray(doc[0]!.content) && doc[0]!.content.length === 0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (empty) editor.replaceBlocks(doc, initial as any);
  }, [ready, editor, others, self.connectionId, props.initialBlocks]);

  return (
    <EditorWithAutosave editor={editor} {...props}>
      <Presence />
    </EditorWithAutosave>
  );
}

function Presence() {
  const others = useOthers();
  const status = useStatus();
  const [showOffline, setShowOffline] = useState(false);
  useEffect(() => {
    // Kurze Verbindungsabbrüche nicht sofort anzeigen
    const t = setTimeout(() => setShowOffline(status === "disconnected" || status === "reconnecting"), 3000);
    return () => clearTimeout(t);
  }, [status]);

  if (showOffline) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-warning">
        <CloudOff className="size-3.5" aria-hidden /> Verbindung unterbrochen – Änderungen werden nachgereicht
      </span>
    );
  }
  const people = [...new Map(others.map((o) => [o.id, o.info])).values()];
  if (!people.length) return null;
  return (
    <div className="flex items-center gap-2" aria-label="Gerade dabei">
      <div className="flex -space-x-1.5">
        {people.slice(0, 5).map((p) => (
          <span
            key={p.name}
            title={p.name}
            className="grid size-6 place-items-center rounded-full text-[10px] font-bold text-white ring-2 ring-surface"
            style={{ background: p.color }}
          >
            {p.name.slice(0, 1).toUpperCase()}
          </span>
        ))}
      </div>
      <span className="truncate text-xs font-semibold text-muted">
        {people.length === 1 ? `${people[0]!.name} schreibt mit` : `${people.length} schreiben mit`}
      </span>
    </div>
  );
}
