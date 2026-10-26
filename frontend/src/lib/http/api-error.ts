import { isAxiosError } from "axios";

type ApiErrorBody = {
  code?: string;
  message?: string;
  fieldErrors?: Record<string, string[]>;
  [extra: string]: unknown;
};

/** Transport-independent error shape that feature services expose to the UI. */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number | null;
  readonly retryable: boolean;
  readonly fieldErrors: Record<string, string[]>;
  /** Other fields of the error body, e.g. the id of a conflicting resource. */
  readonly details: Record<string, unknown>;

  constructor(options: {
    code: string;
    message: string;
    status: number | null;
    retryable: boolean;
    fieldErrors?: Record<string, string[]>;
    details?: Record<string, unknown>;
  }) {
    super(options.message);
    this.name = "ApiError";
    this.code = options.code;
    this.status = options.status;
    this.retryable = options.retryable;
    this.fieldErrors = options.fieldErrors ?? {};
    this.details = options.details ?? {};
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (isAxiosError<ApiErrorBody>(error)) {
    const status = error.response?.status ?? null;
    const body = error.response?.data;
    const isServerSide = status === null || status >= 500 || status === 429;
    const details = Object.fromEntries(
      Object.entries(body ?? {}).filter(([key]) => !["code", "message", "fieldErrors", "retryable"].includes(key)),
    );
    const retryable = body?.retryable;

    return new ApiError({
      code: body?.code ?? (status === null ? "network_error" : `http_${status}`),
      message:
        body?.message ??
        (status === null
          ? "We couldn't reach the server. Check your connection and try again."
          : "The server couldn't complete this request. Please try again."),
      status,
      retryable: typeof retryable === "boolean" ? retryable : isServerSide,
      fieldErrors: body?.fieldErrors,
      details,
    });
  }

  return new ApiError({
    code: "unknown_error",
    message: "Something unexpected happened.",
    status: null,
    retryable: false,
  });
}
