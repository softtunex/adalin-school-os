import { apiRoute } from "@/lib/api/route";
import { getDb } from "@/lib/db/client";
import { apiInvoices } from "@/lib/services/public-api";

export const GET = apiRoute((ctx, q) => apiInvoices(getDb(), ctx, q));
