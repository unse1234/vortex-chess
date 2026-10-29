"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useSocialAction } from "@/features/social/hooks/use-social";
import type { SocialAction } from "@/features/social/types/friend.types";

export function SocialActionButton({
  action,
  id,
  username,
  label,
  confirm,
}: SocialAction & { username: string; label: string; confirm?: string }) {
  const mutation = useSocialAction();
  const [open, setOpen] = useState(false);
  const run = () =>
    mutation.mutate({ action, id }, { onSuccess: () => setOpen(false) });
  return (
    <div className="inline-flex max-w-full flex-col items-start gap-1">
      <Button
        size="sm"
        variant={
          action === "block" || action === "remove" ? "danger" : "secondary"
        }
        disabled={mutation.isPending}
        onClick={
          confirm
            ? () => {
                mutation.reset();
                setOpen(true);
              }
            : run
        }
        aria-label={`${label} ${username}`}
      >
        {mutation.isPending ? "Saving..." : label}
      </Button>
      {!open && mutation.isError ? (
        <span role="alert" className="max-w-64 text-xs text-danger">
          {mutation.error.message}
        </span>
      ) : null}
      {confirm ? (
        <Dialog
          open={open}
          onOpenChange={(value) => {
            if (!mutation.isPending) setOpen(value);
          }}
          title={`${label} ${username}?`}
          description={confirm}
          footer={
            <>
              <Button
                onClick={() => setOpen(false)}
                disabled={mutation.isPending}
              >
                Keep account unchanged
              </Button>
              <Button
                variant="danger"
                onClick={run}
                disabled={mutation.isPending}
              >
                {mutation.isPending ? "Saving..." : label}
              </Button>
            </>
          }
        >
          <div className="p-5 text-sm text-fg-muted">
            {mutation.isError ? (
              <p role="alert" className="text-danger">
                {mutation.error.message}
              </p>
            ) : (
              <p>This applies to your relationship with {username}.</p>
            )}
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}
