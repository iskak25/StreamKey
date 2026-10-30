import { csrfResponse, route } from "@/lib/server/http";

export const runtime = "nodejs";

export const GET = route({}, async () => csrfResponse());
