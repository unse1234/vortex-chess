"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { Skeleton } from "@/components/feedback/skeleton";
import { Button } from "@/components/ui/button";
import { LockIcon, MailIcon } from "@/components/ui/icons";
import { routes } from "@/config/routes";
import { useSessionQuery } from "@/features/auth/hooks/use-session-query";
import { useSignOut } from "@/features/auth/hooks/use-sign-out";
import { InvitationResponseCard } from "@/features/invitations/components/invitation-response-card";
import { useInvitationQuery } from "@/features/invitations/hooks/use-invitations";
import { ApiError } from "@/lib/http/api-error";
import { RoomPageHeader } from "@/screens/rooms/room-page-header";

/**
 * Invitation landing page. The link only identifies the invitation; the
 * backend lets the intended signed-in account respond, nobody else.
 */
export function JoinInvitationScreen({ invitationId }: { invitationId: string }) {
  const router = useRouter();
  const query = useInvitationQuery(invitationId);
  const error = query.error instanceof ApiError ? query.error : null;

  return (
    <>
      <RoomPageHeader />
      <main id="main-content" tabIndex={-1} className="flex flex-1 items-start justify-center px-4 py-10 focus:outline-none sm:py-16">
        {query.data ? (
          <InvitationResponseCard invitation={query.data} onOpenRoom={(roomId) => router.push(routes.room(roomId))} />
        ) : error?.code === "invitation_wrong_account" ? (
          <WrongAccount invitationId={invitationId} message={error.message} />
        ) : error?.status === 404 || error?.status === 400 ? (
          <EmptyState
            icon={<MailIcon />}
            title="Invitation not found"
            description="Check that the link is complete. Invitations can be cancelled by the host."
            action={<Link href={routes.play} className="font-semibold text-accent hover:underline">Back to the lobby</Link>}
            className="py-12"
          />
        ) : query.isError ? (
          <ErrorState title="Couldn't load the invitation" message={query.error.message} onRetry={() => query.refetch()} retrying={query.isRefetching} />
        ) : (
          <div className="w-full max-w-lg rounded-lg border border-line bg-surface/95 p-6" aria-busy="true" aria-label="Loading invitation">
            <Skeleton className="h-14 w-3/4" />
            <Skeleton className="mt-5 h-16 w-full" />
            <Skeleton className="mt-6 ml-auto h-10 w-40" />
          </div>
        )}
      </main>
    </>
  );
}

/** Forwarded or opened in the wrong account: no details, only a way to switch. */
function WrongAccount({ invitationId, message }: { invitationId: string; message: string }) {
  const router = useRouter();
  const { data: account } = useSessionQuery();
  const signOut = useSignOut({
    onSuccess: () =>
      router.replace(`${routes.signIn}?next=${encodeURIComponent(routes.invitation(invitationId))}`),
  });
  return (
    <section className="w-full max-w-lg rounded-lg border border-line-strong bg-surface/95 p-6 text-center shadow-panel">
      <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-surface-raised text-2xl text-accent">
        <LockIcon />
      </span>
      <h1 className="mt-3 text-xl font-bold text-fg">This invitation is for another account</h1>
      <p className="mt-2 text-[14px] text-fg-muted">{message}</p>
      {account ? <p className="mt-2 text-[13px] text-fg-subtle">You&apos;re signed in as {account.username}.</p> : null}
      {signOut.isError ? <p role="alert" className="mt-3 text-[13px] text-danger">{signOut.error.message}</p> : null}
      <div className="mt-5 flex justify-center gap-2">
        <Link href={routes.play} className="inline-flex h-10 items-center rounded-md px-4 text-sm font-semibold text-fg-muted hover:bg-surface-hover hover:text-fg">
          Back to the lobby
        </Link>
        <Button variant="primary" onClick={() => signOut.mutate()} disabled={signOut.isPending}>
          {signOut.isPending ? "Signing out…" : "Switch account"}
        </Button>
      </div>
    </section>
  );
}
