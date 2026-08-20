export type ApiError = {
  code: string;
  message: string;
  details: Record<string, unknown>;
  correlationId: string;
  timestamp: string;
};

export type RequestOptions = RequestInit & {
  idempotencyKey?: string;
  accessToken?: string;
};
