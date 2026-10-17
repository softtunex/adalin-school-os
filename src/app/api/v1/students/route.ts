import { apiRoute } from "@/lib/api/route";
import { getDb } from "@/lib/db/client";
import { apiStudents } from "@/lib/services/public-api";

export const GET = apiRoute((ctx, q) => apiStudents(getDb(), ctx, q));
