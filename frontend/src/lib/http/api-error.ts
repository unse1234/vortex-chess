import { isAxiosError } from "axios";

type ApiErrorBody = {
  code?: string;
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

/** Transport-independent error shape that feature services expose to the UI. */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number | null;
  readonly retryable: boolean;
  readonly fieldErrors: Record<string, string[]>;

  constructor(options: {
    code: string;
    message: string;
    status: number | null;
    retryable: boolean;
    fieldErrors?: Record<string, string[]>;
  }) {
    super(options.message);
    this.name = "ApiError";
    this.code = options.code;
    this.status = options.status;
    this.retryable = options.retryable;
    this.fieldErrors = options.fieldErrors ?? {};
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (isAxiosError<ApiErrorBody>(error)) {
    const status = error.response?.status ?? null;
    const body = error.response?.data;
    const isServerSide = status === null || status >= 500 || status === 429;

    return new ApiError({
      code: body?.code ?? (status === null ? "network_error" : `http_${status}`),
      message:
        body?.message ??
        (status === null
          ? "We couldn't reach the server. Check your connection and try again."
          : "The server couldn't complete this request. Please try again."),
      status,
      retryable: isServerSide,
      fieldErrors: body?.fieldErrors,
    });
  }

  return new ApiError({
    code: "unknown_error",
    message: "Something unexpected happened.",
    status: null,
    retryable: false,
  });
}
