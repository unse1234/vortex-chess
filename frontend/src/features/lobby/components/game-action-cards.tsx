"use client";

import type { ReactNode } from "react";
import { AppLink } from "@/components/ui/app-link";
import {
  AddIcon,
  ChessKingIcon,
  ChessKnightIcon,
  ChessPawnIcon,
  ChessRookIcon,
  DoubleChevronRightIcon,
  GlobeIcon,
  GroupIcon,
  InfoIcon,
  PersonIcon,
} from "@/components/ui/icons";
import { routes } from "@/config/routes";
import { cn } from "@/utils/cn";

type CardTone = "sapphire" | "gold";

const toneClasses: Record<CardTone, { card: string; divider: string; badge: string; title: string; text: string; chevron: string }> = {
  sapphire: {
    card: "border-[#24406f] bg-linear-to-b from-(--vc-card-blue-from) to-(--vc-card-blue-to) hover:border-[#3a5f9e] hover:shadow-[0_0_26px_-8px_rgb(91_156_245/0.55)]",
    divider: "border-[#1b2a45]",
    badge: "bg-info-soft text-info",
    title: "text-fg",
    text: "text-[#94a0b8]",
    chevron: "text-[#9aa6bd]",
  },
  gold: {
    card: "border-(--vc-card-gold-line) bg-linear-to-b from-(--vc-card-gold-from) to-(--vc-card-gold-to) shadow-gold-glow hover:border-accent hover:shadow-[0_0_36px_-4px_rgb(232_174_76/0.6)]",
    divider: "border-[#f4d9a0]/15",
    badge: "bg-black/35 text-accent",
    title: "text-[#f6e3b4]",
    text: "text-[#d8c39a]",
    chevron: "text-accent",
  },
};

type ActionCardProps = {
  tone: CardTone;
  art: ReactNode;
  badge: ReactNode;
  title: string;
  description: string;
};

function ActionCardContent({ tone, art, badge, title, description }: ActionCardProps) {
  const styles = toneClasses[tone];
  return (
    <>
      <span aria-hidden className="flex flex-1 items-center justify-center py-4 md:py-0">
        {art}
      </span>
      <span className={cn("mx-4 flex items-end gap-3.5 border-t pb-5 pt-4 sm:mx-5 sm:gap-4", styles.divider)}>
        <span aria-hidden className={cn("flex size-[34px] shrink-0 items-center justify-center self-center rounded-md text-xl", styles.badge)}>
          {badge}
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className={cn("block text-[15px] font-extrabold uppercase tracking-[0.06em] lg:text-[17px]", styles.title)}>
            {title}
          </span>
          <span className={cn("mt-0.5 block text-[13px] leading-snug lg:text-[13.5px]", styles.text)}>
            {description}
          </span>
        </span>
        <DoubleChevronRightIcon
          aria-hidden
          className={cn("shrink-0 text-lg transition-transform group-hover:translate-x-1", styles.chevron)}
        />
      </span>
    </>
  );
}

const cardClassName =
  "group disabled:relative [&:disabled>span:last-child]:absolute [&:disabled>span:last-child]:right-3 [&:disabled>span:last-child]:top-3 flex min-h-[156px] flex-col rounded-lg border-[1.5px] text-left transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 md:min-h-[215px]";

type GameActionCardsProps = {
  onPlayWithFriends: () => void;
};

/** Primary launcher actions: play with friends, create a room, find players. */
export function GameActionCards({ onPlayWithFriends }: GameActionCardsProps) {
  return (
    <section aria-label="Start a game" className="grid gap-4 md:grid-cols-3 md:gap-5 xl:gap-[25px]">
      <button
        type="button"
        onClick={onPlayWithFriends}
        aria-haspopup="dialog"
        className={cn(cardClassName, toneClasses.sapphire.card)}
      >
        <ActionCardContent
          tone="sapphire"
          title="Play with Friends"
          description="Challenge your friends"
          badge={<GroupIcon />}
          art={
            <span className="flex items-end gap-5">
              <ChessKingIcon className="text-[46px] text-cyan drop-shadow-[0_0_12px_rgb(150_221_233/0.45)]" />
              <ChessKnightIcon className="text-[34px] text-[#556479]" />
            </span>
          }
        />
      </button>

      <AppLink
        href={routes.createRoom()}
        destinationLabel="Room setup"
        className={cn(cardClassName, toneClasses.gold.card)}
      >
        <ActionCardContent
          tone="gold"
          title="Create Room"
          description="Set up a custom game and invite others"
          badge={<PersonIcon />}
          art={
            <span className="relative">
              <ChessRookIcon className="text-[56px] text-accent-strong drop-shadow-[0_0_16px_rgb(246_196_67/0.5)]" />
              <AddIcon className="absolute -right-3.5 -top-1 text-xl text-white" />
            </span>
          }
        />
      </AppLink>

      <AppLink
        href={routes.matchmaking({ mode: "standard" })}
        destinationLabel="Find Players"
        className={cn(cardClassName, toneClasses.sapphire.card)}
      >
        <ActionCardContent
          tone="sapphire"
          title="Find Players"
          description="Find a human opponent for a casual, unrated game"
          badge={<InfoIcon />}
          art={
            <span className="flex items-center gap-6">
              <GlobeIcon className="text-[48px] text-info drop-shadow-[0_0_14px_rgb(91_156_245/0.6)]" />
              <ChessPawnIcon className="text-[32px] text-[#556479]" />
            </span>
          }
        />
      </AppLink>
    </section>
  );
}
