import { apiRoute } from "@/lib/api/route";
import { getDb } from "@/lib/db/client";
import { apiStaff } from "@/lib/services/public-api";

export const GET = apiRoute((ctx) => apiStaff(getDb(), ctx));
