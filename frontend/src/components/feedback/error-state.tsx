import { ErrorIcon, RefreshIcon } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";

type ErrorStateProps = {
  title: string;
  message?: string;
  onRetry?: () => void;
  retrying?: boolean;
  className?: string;
};

export function ErrorState({ title, message, onRetry, retrying = false, className }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center gap-2 rounded-md border border-danger-line/60 bg-danger-soft/40 px-4 py-5 text-center",
        className,
      )}
    >
      <ErrorIcon className="text-2xl text-danger" />
      <p className="text-sm font-semibold text-fg">{title}</p>
      {message ? <p className="max-w-xs text-[13px] text-fg-muted">{message}</p> : null}
      {onRetry ? (
        <Button size="sm" onClick={onRetry} disabled={retrying} className="mt-1">
          <RefreshIcon className={cn("text-base", retrying && "animate-spin")} />
          {retrying ? "Retrying…" : "Try again"}
        </Button>
      ) : null}
    </div>
  );
}
