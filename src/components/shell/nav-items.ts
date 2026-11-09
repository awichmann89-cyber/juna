export type NavKey = "uebersicht" | "aktionen" | "aufgaben" | "leiterrunde" | "einstellungen" | "admin";

export type NavItem = { key: NavKey; href: string; label: string; mobileLabel?: string };

export const orgNav: NavItem[] = [
  { key: "uebersicht", href: "/uebersicht", label: "Übersicht" },
  { key: "aktionen", href: "/aktionen", label: "Aktionen" },
  { key: "aufgaben", href: "/aufgaben", label: "Meine Aufgaben", mobileLabel: "Aufgaben" },
  { key: "leiterrunde", href: "/leiterrunde", label: "Leiterrunde" },
  { key: "einstellungen", href: "/einstellungen", label: "Einstellungen", mobileLabel: "Mehr" },
];

export const platformNav: NavItem = { key: "admin", href: "/admin", label: "Plattform" };
