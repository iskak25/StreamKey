import { z } from "zod";
import { MAX_CONCERT_MS, MAX_PRICE_KGS } from "@/lib/shared/concerts";
import { parseYoutubeVideoId } from "@/lib/shared/youtube";

const youtube = z
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
  });

const fields = {
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000),
  youtube,
  priceKgs: z.number().int().min(0).max(MAX_PRICE_KGS),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
};

export const checkWindow = (startsAt: Date, endsAt: Date): string | null =>
  endsAt <= startsAt ? "Окончание должно быть позже начала" : endsAt.getTime() - startsAt.getTime() > MAX_CONCERT_MS ? "Длительность не более 7 суток" : null;

export const createConcertSchema = z
  .object(fields)
  .strict()
  .superRefine((v, ctx) => {
    const err = checkWindow(v.startsAt, v.endsAt);
    if (err) ctx.addIssue({ code: "custom", message: err, path: ["endsAt"] });
  });

export const updateConcertSchema = z
  .object({ expectedVersion: z.number().int().min(0) })
  .extend({
    title: fields.title.optional(),
    description: fields.description.optional(),
    youtube: youtube.optional(),
    priceKgs: fields.priceKgs.optional(),
    startsAt: fields.startsAt.optional(),
    endsAt: fields.endsAt.optional(),
  })
  .strict();

export const publicationSchema = z.object({ status: z.enum(["published", "draft"]) }).strict();
