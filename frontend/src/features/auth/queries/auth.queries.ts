import { queryOptions } from "@tanstack/react-query";
import { getUsernameAvailability } from "@/features/auth/services/auth.service";

export const authKeys = {
  usernameAvailability: (username: string) =>
    ["auth", "username-availability", username.toLowerCase()] as const,
};

export function usernameAvailabilityQueryOptions(username: string) {
  return queryOptions({
    queryKey: authKeys.usernameAvailability(username),
    queryFn: ({ signal }) => getUsernameAvailability(username, signal),
    staleTime: 30_000,
    retry: false,
  });
}
