import type { RatingChange } from "@/types/rating.types";
export function RatingChangeText({ change }: { change: RatingChange }) {
  return (
    <span className="whitespace-nowrap font-mono">
      {change.before} → {change.after}{" "}
      <span
        className={
          change.delta > 0
            ? "text-success"
            : change.delta < 0
              ? "text-danger"
              : "text-fg-muted"
        }
      >
        ({change.delta > 0 ? "+" : ""}
        {change.delta})
      </span>
    </span>
  );
}
