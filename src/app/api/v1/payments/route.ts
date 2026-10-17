import { apiRoute } from "@/lib/api/route";
import { getDb } from "@/lib/db/client";
import { apiPayments } from "@/lib/services/public-api";

export const GET = apiRoute((ctx, q) => apiPayments(getDb(), ctx, q));
