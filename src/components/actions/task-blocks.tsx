"use client";

/**
 * Aufgaben als Blöcke in der Planung (BlockNote).
 * Der Block speichert nur die Aufgaben-ID; Titel, Deadline, Zuständige und Status kommen aus der Datenbank
 * (dieselben Aufgaben wie in „Meine Aufgaben“, Kalender und Erinnerungen).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { insertOrUpdateBlockForSlashMenu, type BlockNoteEditor } from "@blocknote/core";
import { createReactBlockSpec } from "@blocknote/react";
import { CalendarClock, ListChecks, Pencil, Plus, Trash2, X } from "lucide-react";
import { deleteTask, toggleTask } from "@/app/(app)/aktionen/planning-actions";
import { TaskForm } from "@/components/planning/task-form";
import type { TaskItem } from "@/lib/planning-data";
import { formatDueRelative } from "@/lib/planning";
import { cn } from "@/lib/utils";

export type TaskConfig = {
  actionId: string;
  hasDate: boolean;
  today: string;
  members: { id: string; name: string }[];
  tasks: TaskItem[];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEditor = BlockNoteEditor<any, any, any>;

type DialogState = { mode: "create"; blockId: string } | { mode: "edit"; taskId: string; blockId?: string } | null;

type Ctx = {
  config: TaskConfig;
  tasks: Map<string, TaskItem>;
  editor: AnyEditor;
  pending: Set<string>;
  openCreate: (blockId: string) => void;
  openEdit: (taskId: string, blockId?: string) => void;
  requestRefresh: (taskId: string) => boolean;
};

const TaskCtx = createContext<Ctx | null>(null);

export const TASK_BLOCK = "task";

export const TaskBlock = createReactBlockSpec(
  { type: TASK_BLOCK, propSchema: { taskId: { default: "" } }, content: "none" },
  { render: ({ block }) => <TaskBlockView blockId={block.id} taskId={String(block.props.taskId ?? "")} /> },
);

const dueFmt = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

function TaskLine({ task, today, onEdit, trailing }: { task: TaskItem; today: string; onEdit?: () => void; trailing?: React.ReactNode }) {
  const done = task.status === "erledigt";
  const overdue = !done && task.due != null && task.due < today;
  return (
    <div className="flex w-full items-start gap-2.5 rounded-xl border border-border bg-surface px-3 py-2">
      <form action={toggleTask} className="pt-0.5">
        <input type="hidden" name="taskId" value={task.id} />
        <input type="hidden" name="done" value={done ? "false" : "true"} />
        <button
          type="submit"
          aria-label={done ? `„${task.title}“ wieder öffnen` : `„${task.title}“ erledigt`}
          className={cn(
            "grid size-5 shrink-0 place-items-center rounded-md border-2 transition-colors",
            done ? "border-success bg-success text-white" : "border-border hover:border-primary",
          )}
        >
          {done && (
            <svg viewBox="0 0 16 16" className="size-3" aria-hidden>
              <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      </form>
      <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left" title="Aufgabe bearbeiten">
        <span className={cn("block font-semibold", done && "text-muted line-through")}>{task.title}</span>
        <span className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
          {done ? (
            <span className="text-muted">erledigt{task.doneByName ? ` von ${task.doneByName}` : ""}</span>
          ) : task.due ? (
            <span className={cn("inline-flex items-center gap-1", overdue ? "font-bold text-danger" : "text-muted")}>
              <CalendarClock className="size-3.5" aria-hidden />
              {dueFmt.format(new Date(`${task.due}T00:00:00Z`))} ({formatDueRelative(task.due, today)})
            </span>
          ) : (
            <span className="text-muted">ohne Deadline</span>
          )}
          {task.assignees.length > 0 ? (
            <span className="text-muted">{task.assignees.map((a) => a.name).join(", ")}</span>
          ) : (
            !done && <span className="text-warning">niemand zuständig</span>
          )}
        </span>
      </button>
      {trailing ?? (
        <button type="button" onClick={onEdit} aria-label={`„${task.title}“ bearbeiten`} className="grid size-7 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg">
          <Pencil className="size-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
}

function TaskBlockView({ blockId, taskId }: { blockId: string; taskId: string }) {
  const ctx = useContext(TaskCtx);
  const [gaveUp, setGaveUp] = useState(false);
  const task = taskId ? ctx?.tasks.get(taskId) : undefined;

  // Unbekannte ID (z. B. gerade von jemand anderem angelegt): einmal neu laden, dann als gelöscht anzeigen
  useEffect(() => {
    if (!ctx || !taskId || task) return;
    if (!ctx.requestRefresh(taskId)) {
      const t = setTimeout(() => setGaveUp(true), 4000);
      return () => clearTimeout(t);
    }
  }, [ctx, taskId, task]);

  const wrap = (children: React.ReactNode) => (
    <div contentEditable={false} className="my-0.5 w-full select-none" data-task-block={taskId || "neu"}>
      {children}
    </div>
  );

  if (!ctx) {
    return wrap(<div className="rounded-xl border border-dashed border-border px-3 py-2 text-sm text-muted">Aufgabe</div>);
  }
  if (!taskId) {
    return wrap(
      <div className="flex items-center gap-2 rounded-xl border border-dashed border-primary/50 px-3 py-2 text-sm">
        <ListChecks className="size-4 text-primary" aria-hidden />
        <span className="flex-1 text-muted">{ctx.pending.has(blockId) ? "Neue Aufgabe …" : "Aufgabe ohne Inhalt"}</span>
        <button type="button" onClick={() => ctx.openCreate(blockId)} className="font-semibold text-primary hover:underline">
          Ausfüllen
        </button>
        <button type="button" aria-label="Block entfernen" onClick={() => ctx.editor.removeBlocks([blockId])} className="text-muted hover:text-danger">
          <X className="size-4" aria-hidden />
        </button>
      </div>,
    );
  }
  if (!task) {
    return wrap(
      <div className="flex items-center gap-2 rounded-xl border border-dashed border-border px-3 py-2 text-sm text-muted">
        <span className="flex-1">{gaveUp ? "Diese Aufgabe wurde gelöscht." : "Aufgabe wird geladen …"}</span>
        {gaveUp && (
          <button type="button" aria-label="Block entfernen" onClick={() => ctx.editor.removeBlocks([blockId])} className="hover:text-danger">
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>,
    );
  }
  return wrap(<TaskLine task={task} today={ctx.config.today} onEdit={() => ctx.openEdit(task.id, blockId)} />);
}

/** IDs aller Aufgaben-Blöcke im Dokument */
function referencedTaskIds(blocks: unknown[], into = new Set<string>()) {
  for (const raw of blocks) {
    const b = raw as { type?: string; props?: { taskId?: string }; children?: unknown[] };
    if (b.type === TASK_BLOCK && b.props?.taskId) into.add(b.props.taskId);
    if (Array.isArray(b.children)) referencedTaskIds(b.children, into);
  }
  return into;
}

export function TaskBlocksProvider({ editor, config, children }: { editor: AnyEditor; config: TaskConfig; children: React.ReactNode }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [pending] = useState(() => new Set<string>());
  const [refreshed] = useState(() => new Set<string>());
  const tasks = useMemo(() => new Map(config.tasks.map((t) => [t.id, t])), [config.tasks]);
  const [referenced, setReferenced] = useState<Set<string>>(() => referencedTaskIds(editor.document));

  useEffect(() => {
    const update = () => setReferenced(referencedTaskIds(editor.document));
    update();
    return editor.onChange(update);
  }, [editor]);

  const requestRefresh = useCallback(
    (taskId: string) => {
      if (refreshed.has(taskId)) return false;
      refreshed.add(taskId);
      router.refresh();
      return true;
    },
    [refreshed, router],
  );

  const ctx = useMemo<Ctx>(
    () => ({
      config,
      tasks,
      editor,
      pending,
      openCreate: (blockId) => setDialog({ mode: "create", blockId }),
      openEdit: (taskId, blockId) => setDialog({ mode: "edit", taskId, blockId }),
      requestRefresh,
    }),
    [config, tasks, editor, pending, requestRefresh],
  );

  const blockExists = (id: string) => Boolean(editor.getBlock(id));
  const closeDialog = (cancelled: boolean) => {
    if (cancelled && dialog?.mode === "create" && blockExists(dialog.blockId)) {
      const block = editor.getBlock(dialog.blockId);
      if (block && !block.props?.taskId) editor.removeBlocks([dialog.blockId]);
    }
    if (dialog?.mode === "create") pending.delete(dialog.blockId);
    setDialog(null);
  };

  const others = config.tasks.filter((t) => !referenced.has(t.id));
  const othersOpen = others.filter((t) => t.status === "offen");
  const othersDone = others.filter((t) => t.status === "erledigt");

  const insertAtEnd = (taskId: string) => {
    const doc = editor.document;
    const last = doc[doc.length - 1];
    if (last) editor.insertBlocks([{ type: TASK_BLOCK, props: { taskId } }], last, "after");
  };

  return (
    <TaskCtx.Provider value={ctx}>
      {children}

      {others.length > 0 && (
        <section className="mt-4 rounded-2xl border border-border bg-surface-2/60 p-3" aria-label="Weitere Aufgaben">
          <h3 className="mb-1 px-1 text-sm font-bold">Weitere Aufgaben dieser Aktion</h3>
          <p className="mb-2 px-1 text-xs text-muted">
            Stehen noch nicht in der Planung (z. B. übernommen oder aus „Aus dem letzten Mal“). Mit „Einfügen“ ans Ende setzen oder per
            „/Aufgabe“ an eine bestimmte Stelle.
          </p>
          <div className="flex flex-col gap-1.5">
            {othersOpen.map((t) => (
              <TaskLine
                key={t.id}
                task={t}
                today={config.today}
                onEdit={() => setDialog({ mode: "edit", taskId: t.id })}
                trailing={
                  <button type="button" onClick={() => insertAtEnd(t.id)} className="inline-flex shrink-0 items-center gap-1 self-center text-xs font-semibold text-primary hover:underline">
                    <Plus className="size-3.5" aria-hidden /> Einfügen
                  </button>
                }
              />
            ))}
            {othersDone.length > 0 && (
              <details>
                <summary className="cursor-pointer px-1 text-xs font-semibold text-muted">{othersDone.length} erledigt</summary>
                <div className="mt-1.5 flex flex-col gap-1.5">
                  {othersDone.map((t) => (
                    <TaskLine key={t.id} task={t} today={config.today} onEdit={() => setDialog({ mode: "edit", taskId: t.id })} />
                  ))}
                </div>
              </details>
            )}
          </div>
        </section>
      )}

      {dialog && (
        <TaskDialog
          key={dialog.mode === "create" ? `neu-${dialog.blockId}` : dialog.taskId}
          config={config}
          task={dialog.mode === "edit" ? tasks.get(dialog.taskId) : undefined}
          onClose={closeDialog}
          onSaved={(taskId) => {
            if (dialog.mode === "create" && blockExists(dialog.blockId)) {
              editor.updateBlock(dialog.blockId, { props: { taskId } });
            }
            closeDialog(false);
          }}
          onDeleted={() => {
            if (dialog.mode === "edit") {
              // Alle Blöcke mit dieser Aufgabe entfernen
              const ids: string[] = [];
              editor.forEachBlock((b) => {
                if (b.type === TASK_BLOCK && (b.props as { taskId?: string }).taskId === dialog.taskId) ids.push(b.id);
                return true;
              });
              if (ids.length) editor.removeBlocks(ids);
            }
            setDialog(null);
          }}
        />
      )}
    </TaskCtx.Provider>
  );
}

function TaskDialog({
  config,
  task,
  onClose,
  onSaved,
  onDeleted,
}: {
  config: TaskConfig;
  task?: TaskItem;
  onClose: (cancelled: boolean) => void;
  onSaved: (taskId: string) => void;
  onDeleted: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [deleting, setDeleting] = useState(false);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose(true);
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose(true);
      }}
      aria-label={task ? "Aufgabe bearbeiten" : "Neue Aufgabe"}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-border bg-surface p-0 text-fg shadow-xl backdrop:bg-black/40"
    >
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <h2 className="font-bold">{task ? "Aufgabe bearbeiten" : "Neue Aufgabe"}</h2>
        <button type="button" onClick={() => onClose(true)} aria-label="Schließen" className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2">
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <div className="max-h-[75vh] overflow-y-auto px-5 py-4">
        <TaskForm
          actionId={config.actionId}
          hasDate={config.hasDate}
          members={config.members}
          task={task ? { ...task, assignees: task.assignees.map((a) => a.id) } : undefined}
          onSaved={onSaved}
          autoFocus
        />
        {task && (
          <button
            type="button"
            disabled={deleting}
            onClick={async () => {
              if (!window.confirm(`Aufgabe „${task.title}“ löschen?`)) return;
              setDeleting(true);
              const fd = new FormData();
              fd.set("taskId", task.id);
              fd.set("actionId", config.actionId);
              await deleteTask(fd);
              onDeleted();
            }}
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-danger hover:underline disabled:opacity-50"
          >
            <Trash2 className="size-3.5" aria-hidden /> Aufgabe löschen
          </button>
        )}
      </div>
    </dialog>
  );
}

/** Eintrag fürs Slash-Menü: „/Aufgabe“ */
export function taskSlashItem(editor: AnyEditor, onCreate: (blockId: string) => void, pending?: Set<string>) {
  return {
    title: "Aufgabe",
    subtext: "Mit Zuständigen und Deadline – erscheint in „Meine Aufgaben“",
    aliases: ["aufgabe", "todo", "task", "to-do", "erledigen"],
    group: "Planung",
    icon: <ListChecks size={18} />,
    onItemClick: () => {
      // Leere Zeile wird ersetzt, sonst wird der Block darunter eingefügt
      const block = insertOrUpdateBlockForSlashMenu(editor, { type: TASK_BLOCK, props: { taskId: "" } });
      const id = block.id;
      pending?.add(id);
      onCreate(id);
    },
  };
}

/** Kontext für das Slash-Menü (außerhalb der Blöcke) */
export function useTaskBlocks() {
  return useContext(TaskCtx);
}
