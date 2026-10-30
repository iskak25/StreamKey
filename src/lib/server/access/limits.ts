import "server-only";
import { SETTINGS } from "../config";
import { rateLimit } from "../ratelimit";

export const ratelimitCreate = (uid: string) => rateLimit(`create-link:${uid}`, SETTINGS.rate.createLinkPerMinute, 60);
export const ratelimitActivate = (browserKey: string) => rateLimit(`activate:${browserKey}`, SETTINGS.rate.activatePerMinute, 60);
