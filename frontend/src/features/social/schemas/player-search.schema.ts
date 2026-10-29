import { z } from "zod";
export const playerSearchSchema = z.string().regex(/^[a-zA-Z0-9_]{2,20}$/);
