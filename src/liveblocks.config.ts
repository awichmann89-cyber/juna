// Typen für Liveblocks (Präsenz und Nutzerinfos im Editor)
declare global {
  interface Liveblocks {
    Presence: Record<string, never>;
    UserMeta: {
      id: string;
      info: { name: string; color: string };
    };
  }
}

export {};
