import Image from "next/image";
import { cn } from "@/lib/utils";

export function Logo({ className, size = 36, withText = true }: { className?: string; size?: number; withText?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <Image src="/brand/juna-logo.svg" alt={withText ? "" : "juna"} width={size} height={size} priority unoptimized />
      {withText && (
        <span className="text-[1.6em] leading-none font-extrabold tracking-tight text-fg" style={{ fontSize: size * 0.72 }}>
          juna
        </span>
      )}
    </span>
  );
}
