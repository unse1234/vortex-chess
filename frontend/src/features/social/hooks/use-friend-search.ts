"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { friendsQueryOptions } from "@/features/social/queries/social.queries";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

const SEARCH_DEBOUNCE_MS = 250;

/** Search input state plus the friends query for the debounced term. */
export function useFriendSearch() {
  const [term, setTerm] = useState("");
  const search = useDebouncedValue(term.trim(), SEARCH_DEBOUNCE_MS);
  const query = useQuery(friendsQueryOptions(search));

  return {
    term,
    setTerm,
    search,
    query,
    /** True while the visible results don't match the typed term yet. */
    isSearching: term.trim() !== search || query.isPlaceholderData,
  };
}
