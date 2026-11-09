"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

/** BlockNote läuft nur im Browser – daher ohne SSR nachladen. */
export const NotesEditorLoader = dynamic(() => import("./notes-editor"), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col gap-3 pt-7">
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="h-5 w-1/2" />
      <Skeleton className="h-5 w-3/5" />
    </div>
  ),
});
