import { apiRoute } from "@/lib/api/route";
import { getDb } from "@/lib/db/client";
import { apiTerms } from "@/lib/services/public-api";

export const GET = apiRoute((ctx) => apiTerms(getDb(), ctx));
