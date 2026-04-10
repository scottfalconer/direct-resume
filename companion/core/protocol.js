export const PROTOCOL_VERSION = 1;

export const ERROR_CODES = Object.freeze({
  BAD_REQUEST: "bad_request",
  NOT_FOUND: "not_found",
  UNAUTHORIZED: "unauthorized",
  FORBIDDEN: "forbidden",
  UNSUPPORTED_WORK_OBJECT: "unsupported_work_object",
  UNSUPPORTED_AGENT: "unsupported_agent",
  INVALID_PAIRING_TOKEN: "invalid_pairing_token",
  PAIRING_TOKEN_EXPIRED: "pairing_token_expired",
  CANDIDATE_EXPIRED: "candidate_expired",
  SESSION_STALE: "session_stale",
  EXEC_DISABLED: "exec_disabled",
  INTERNAL_ERROR: "internal_error",
});

export class DirectResumeError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.name = "DirectResumeError";
    this.code = code;
    this.statusCode = statusCode;
  }
}
