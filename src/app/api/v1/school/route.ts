import { apiRoute } from "@/lib/api/route";
import { getDb } from "@/lib/db/client";
import { apiSchool } from "@/lib/services/public-api";

export const GET = apiRoute((ctx) => apiSchool(getDb(), ctx));
