import type { FeedbackKind } from "@/db/schema";

export const feedbackKinds: { value: FeedbackKind; label: string; emoji: string; description: string }[] = [
  { value: "gut", label: "Lief gut", emoji: "👍", description: "Das behalten wir bei" },
  { value: "verbessern", label: "Verbessern", emoji: "🛠", description: "Das hat nicht so gut geklappt" },
  { value: "naechstes_mal", label: "Fürs nächste Mal", emoji: "📌", description: "Erscheint bei der nächsten Durchführung der Reihe" },
];
