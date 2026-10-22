import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";

/**
 * Design-system fonts for the console-style screens (auth and arena), loaded
 * only by the route groups that use them so the launcher doesn't pay for them.
 */
const spaceGrotesk = Space_Grotesk({ variable: "--font-space-grotesk", subsets: ["latin"] });
const jetBrainsMono = JetBrains_Mono({ variable: "--font-jetbrains-mono", subsets: ["latin"] });
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

/** Class names that define the CSS variables the Tailwind `font-display/mono/body` utilities use. */
export const designFontClassName = `${spaceGrotesk.variable} ${jetBrainsMono.variable} ${inter.variable}`;
