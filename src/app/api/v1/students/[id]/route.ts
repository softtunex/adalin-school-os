import { apiRoute } from "@/lib/api/route";
import { getDb } from "@/lib/db/client";
import { apiStudent } from "@/lib/services/public-api";

export const GET = apiRoute<{ id: string }>((ctx, _q, { id }) => apiStudent(getDb(), ctx, id));
