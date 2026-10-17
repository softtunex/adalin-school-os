import { apiRoute } from "@/lib/api/route";
import { getDb } from "@/lib/db/client";
import { apiAttendance } from "@/lib/services/public-api";

export const GET = apiRoute((ctx, q) => apiAttendance(getDb(), ctx, q));
