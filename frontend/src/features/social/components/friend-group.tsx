"use client";

import { useId, useState, type ReactNode } from "react";
import { ExpandMoreIcon } from "@/components/ui/icons";
import { cn } from "@/utils/cn";

type FriendGroupProps = {
  title: string;
  count: number;
  tone: "online" | "offline";
  children: ReactNode;
};

/** Collapsible presence group, e.g. "Online (4)". */
export function FriendGroup({ title, count, tone, children }: FriendGroupProps) {
  const [expanded, setExpanded] = useState(true);
  const listId = useId();

  return (
    <section>
      <h3>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => setExpanded((current) => !current)}
          className="flex w-full items-center gap-2.5 rounded-md py-2 text-left text-[14px] font-bold uppercase tracking-[0.07em]"
        >
          <span
            aria-hidden
            className={cn(
              "size-2.5 rounded-full",
              tone === "online"
                ? "bg-success shadow-[0_0_8px_1px_rgb(47_207_152/0.6)]"
                : "bg-fg-subtle",
            )}
          />
          <span className={cn("flex-1", tone === "online" ? "text-success" : "text-fg-muted")}>
            {title} ({count})
          </span>
          <ExpandMoreIcon
            className={cn("text-xl text-fg-muted transition-transform", !expanded && "-rotate-90")}
          />
        </button>
      </h3>
      <div id={listId} hidden={!expanded}>
        {children}
      </div>
    </section>
  );
}
