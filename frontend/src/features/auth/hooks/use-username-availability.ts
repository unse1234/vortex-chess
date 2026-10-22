"use client";

import { useQuery } from "@tanstack/react-query";
import { usernameAvailabilityQueryOptions } from "@/features/auth/queries/auth.queries";
import { USERNAME_PATTERN } from "@/features/auth/schemas/sign-up.schema";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

const CHECK_DEBOUNCE_MS = 350;

export type UsernameAvailabilityState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available"; tag: string | null }
  | { status: "taken" }
  | { status: "unknown" };

/** Asks the server whether a well-formed call sign is free, after typing pauses. */
export function useUsernameAvailability(username: string): UsernameAvailabilityState {
  const trimmed = username.trim();
  const debounced = useDebouncedValue(trimmed, CHECK_DEBOUNCE_MS);
  const wellFormed = USERNAME_PATTERN.test(debounced);

  const query = useQuery({
    ...usernameAvailabilityQueryOptions(debounced),
    enabled: wellFormed,
  });

  if (!USERNAME_PATTERN.test(trimmed)) return { status: "idle" };
  if (trimmed !== debounced || query.isPending) return { status: "checking" };
  if (query.isError) return { status: "unknown" };
  return query.data.available
    ? { status: "available", tag: query.data.tag }
    : { status: "taken" };
}
