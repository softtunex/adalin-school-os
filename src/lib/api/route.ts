import "server-only";
import { getDb } from "../db/client";
import { AppError } from "../errors";
import { ApiError, authenticateApiKey, type ApiContext } from "../services/api-keys";

const headers = { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" };

/** Wraps a public API route: checks the key, runs the read, and answers errors as JSON. */
export function apiRoute<P>(fn: (ctx: ApiContext, query: URLSearchParams, params: P) => Promise<unknown>) {
  return async (request: Request, { params }: { params: Promise<P> }) => {
    try {
      const db = getDb();
      const ctx = await authenticateApiKey(db, request.headers.get("authorization"));
      return Response.json(await fn(ctx, new URL(request.url).searchParams, await params), { headers });
    } catch (error) {
      if (error instanceof ApiError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status, headers });
      if (error instanceof AppError) return Response.json({ error: { code: error.code, message: error.message } }, { status: 400, headers });
      console.error("[api] unexpected error", error);
      return Response.json({ error: { code: "server_error", message: "Something went wrong on our side." } }, { status: 500, headers });
    }
  };
}
