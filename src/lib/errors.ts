/** An error whose message is safe and meant to be shown to the user. */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: "invalid" | "forbidden" | "not_found" | "conflict" | "limit" | "upgrade" | "rate_limited" = "invalid",
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function userMessage(error: unknown): string {
  if (error instanceof AppError) return error.message;
  console.error(error);
  return "Something went wrong on our side. Please try again.";
}
