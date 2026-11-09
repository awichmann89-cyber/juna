import { Suspense, type ReactNode } from "react";
import { EmptyState, PageHeader } from "@/components/ui/feedback";
import { requireOrgUser } from "@/lib/auth";

async function Guard({ children }: { children: ReactNode }) {
  await requireOrgUser();
  return children;
}

export function ComingSoon({
  title,
  description,
  icon,
  emptyTitle,
  children,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  emptyTitle: string;
  children: ReactNode;
}) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <Suspense fallback={null}>
        <Guard>
          <EmptyState icon={icon} title={emptyTitle}>
            {children}
          </EmptyState>
        </Guard>
      </Suspense>
    </>
  );
}
