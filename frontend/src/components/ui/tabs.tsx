"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { ComingSoon } from "@/components/display/coming-soon";
import { features, type FeatureId } from "@/config/capabilities";
import { cn } from "@/utils/cn";

export type TabItem<T extends string> = {
  value: T;
  label: string;
  icon?: ReactNode;
  feature?: FeatureId;
};

export function getTabIds(idPrefix: string, value: string) {
  return { tabId: `${idPrefix}-tab-${value}`, panelId: `${idPrefix}-panel-${value}` };
}

type TabListProps<T extends string> = {
  items: readonly TabItem<T>[];
  value: T;
  onValueChange: (value: T) => void;
  idPrefix: string;
  label: string;
  className?: string;
};

/** WAI-ARIA tab list with roving focus (arrow keys, Home and End). */
export function TabList<T extends string>({
  items,
  value,
  onValueChange,
  idPrefix,
  label,
  className,
}: TabListProps<T>) {
  const tabRefs = useRef(new Map<T, HTMLButtonElement>());

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const enabledItems = items.filter((item) => !item.feature || features[item.feature].available);
    if (!enabledItems.length) return;
    const index = enabledItems.findIndex((item) => item.value === value);
    const nextIndex = {
      ArrowRight: (index + 1) % enabledItems.length,
      ArrowLeft: (index - 1 + enabledItems.length) % enabledItems.length,
      Home: 0,
      End: enabledItems.length - 1,
    }[event.key];
    if (nextIndex === undefined) return;

    event.preventDefault();
    const next = enabledItems[nextIndex].value;
    onValueChange(next);
    tabRefs.current.get(next)?.focus();
  }

  return (
    <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className={cn("flex", className)}>
      {items.map((item) => {
        const disabled = !!item.feature && !features[item.feature].available;
        const selected = !disabled && item.value === value;
        const { tabId, panelId } = getTabIds(idPrefix, item.value);
        return (
          <button
            key={item.value}
            ref={(node) => {
              if (node) tabRefs.current.set(item.value, node);
              else tabRefs.current.delete(item.value);
            }}
            id={tabId}
            type="button"
            role="tab"
            disabled={disabled}
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            onClick={disabled ? undefined : () => onValueChange(item.value)}
            className={cn(
              "relative flex flex-1 items-center justify-center gap-2.5 py-4 text-[15px] font-bold uppercase tracking-[0.08em] transition-colors",
              selected ? "text-accent" : "text-fg-muted hover:text-fg",
            )}
          >
            {item.icon ? <span className="text-[22px]">{item.icon}</span> : null}
            <span>{item.label}{item.feature ? <span className="block"><ComingSoon feature={item.feature} /></span> : null}</span>
            <span
              aria-hidden
              className={cn(
                "absolute inset-x-0 bottom-0 h-[3px] transition-colors",
                selected ? "bg-accent" : "bg-transparent",
              )}
            />
          </button>
        );
      })}
    </div>
  );
}

type TabPanelProps = {
  idPrefix: string;
  value: string;
  children: ReactNode;
  className?: string;
};

export function TabPanel({ idPrefix, value, children, className }: TabPanelProps) {
  const { tabId, panelId } = getTabIds(idPrefix, value);
  return (
    <div id={panelId} role="tabpanel" aria-labelledby={tabId} className={className}>
      {children}
    </div>
  );
}
