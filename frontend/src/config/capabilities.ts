/** UI scope only. The backend remains responsible for authorization.
 * Keep preview session enforcement independent of product availability.
 */
import { env } from "@/config/env";

export const capabilities = { enforceSignIn: !env.apiMocking } as const;

type FeatureAvailability = { available: boolean; label: string };

/** Confirmed V1 scope. Deferred UI must not mount its interactive implementation. */
export const features = {
  emailPassword: { available: true, label: "Email and password" },
  invitations: { available: true, label: "Private invitations" },
  enginePlay: { available: true, label: "Play vs Engine" },
  roomSetup: { available: true, label: "Room setup" },
  matchStart: { available: true, label: "Match start" },
  history: { available: true, label: "Game history and replay" },
  manualAnalysis: { available: true, label: "Temporary manual post-game analysis" },
  matchmaking: { available: !env.apiMocking, label: "Find Players" },
  team: { available: false, label: "2v2" },
  tournaments: { available: false, label: "Tournaments" },
  leaderboard: { available: !env.apiMocking, label: "Leaderboard" },
  ratings: { available: !env.apiMocking, label: "Ratings and ranks" },
  rewards: { available: false, label: "Levels and XP" },
  seasons: { available: false, label: "Seasons" },
  publicRooms: { available: false, label: "Public rooms" },
  variants: { available: false, label: "Chess variants" },
  voice: { available: false, label: "Voice chat" },
  chat: { available: false, label: "Chat" },
  spectating: { available: false, label: "Spectating" },
  friends: { available: false, label: "Friends" },
  socialManagement: { available: false, label: "Friend management" },
  analysis: { available: false, label: "Engine evaluation and analysis" },
  telemetry: { available: false, label: "Advanced statistics" },
  profile: { available: false, label: "Profile customization" },
  settings: { available: false, label: "Settings" },
  playstyle: { available: false, label: "Playstyle preference" },
  marketing: { available: false, label: "Tournament updates" },
  alternativeAuth: { available: false, label: "Alternative sign-in" },
  /** Needs the real API; the mock demo never pretends to send or accept reset links. */
  passwordRecovery: { available: !env.apiMocking, label: "Password recovery" },
} as const satisfies Record<string, FeatureAvailability>;

export type FeatureId = keyof typeof features;
export const COMING_SOON = "Coming Soon";
