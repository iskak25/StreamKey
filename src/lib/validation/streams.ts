import { z } from "zod";
import { parseYoutubeVideoId } from "@/lib/shared/youtube";

const MAX_WINDOW_MS = 7 * 24 * 3600 * 1000;

export const createStreamSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().max(2000).optional(),
    youtube: z
      .string()
      .trim()
      .min(1)
      .transform((v, ctx) => {
        const id = parseYoutubeVideoId(v);
        if (!id) {
          ctx.addIssue({ code: "custom", message: "Некорректная ссылка или ID YouTube" });
          return z.NEVER;
        }
        return id;
      }),
    accessStartsAt: z.coerce.date(),
    accessEndsAt: z.coerce.date(),
  })
  .strict()
  .refine((v) => v.accessEndsAt > v.accessStartsAt, { message: "Окончание должно быть позже начала", path: ["accessEndsAt"] })
  .refine((v) => v.accessEndsAt.getTime() - v.accessStartsAt.getTime() <= MAX_WINDOW_MS, {
    message: "Окно доступа не более 7 суток",
    path: ["accessEndsAt"],
  });

export const createLinkSchema = z
  .object({ label: z.string().trim().max(120).optional(), expiresAt: z.coerce.date() })
  .strict();

export const activateSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict();
