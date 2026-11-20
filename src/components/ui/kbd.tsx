import { cn } from "@/lib/utils";

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd className={cn("ml-1.5 hidden rounded border border-border bg-muted px-1 font-mono text-[10px] font-medium leading-4 text-muted-foreground lg:inline-block", className)}>
      {children}
    </kbd>
  );
}
