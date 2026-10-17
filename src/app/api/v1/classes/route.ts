import { apiRoute } from "@/lib/api/route";
import { getDb } from "@/lib/db/client";
import { apiClasses } from "@/lib/services/public-api";

export const GET = apiRoute((ctx) => apiClasses(getDb(), ctx));
