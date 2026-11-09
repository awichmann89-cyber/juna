"use client";

import type { ComponentProps } from "react";

/** Submit-Button mit Rückfrage (für Löschen o. Ä.) */
export function ConfirmSubmit({ confirm: message, ...props }: ComponentProps<"button"> & { confirm: string }) {
  return (
    <button
      type="submit"
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
      {...props}
    />
  );
}
