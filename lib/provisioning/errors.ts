/**
 * Structured errors and user-friendly API responses for provisioning.
 */

import { NextResponse } from "next/server";
import { ZodError } from "zod";

export interface ProvisioningErrorBody {
  code: string;
  error: string;
  userMessage: string;
  details?: Record<string, unknown>;
  fields?: Array<{ path: string; message: string }>;
}

export class ProvisioningError extends Error {
  readonly code: string;
  readonly status: number;
  readonly userMessage: string;
  readonly details?: Record<string, unknown>;

  constructor(input: {
    code: string;
    message: string;
    userMessage?: string;
    status?: number;
    details?: Record<string, unknown>;
  }) {
    super(input.message);
    this.name = "ProvisioningError";
    this.code = input.code;
    this.status = input.status ?? 422;
    this.userMessage = input.userMessage ?? input.message;
    this.details = input.details;
  }
}

export function formatZodError(error: ZodError): ProvisioningErrorBody {
  const fields = error.errors.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join(".") : "body",
    message: issue.message,
  }));

  const first = fields[0];
  const userMessage = first
    ? `Invalid ${first.path}: ${first.message}`
    : "Please check your input and try again.";

  return {
    code: "VALIDATION_ERROR",
    error: "Request validation failed",
    userMessage,
    fields,
  };
}

export function provisioningErrorBody(error: unknown): ProvisioningErrorBody {
  if (error instanceof ProvisioningError) {
    return {
      code: error.code,
      error: error.message,
      userMessage: error.userMessage,
      details: error.details,
    };
  }

  if (error instanceof ZodError) {
    return formatZodError(error);
  }

  if (error instanceof Error) {
    if (error.message.includes("not found")) {
      return {
        code: "NOT_FOUND",
        error: error.message,
        userMessage: "The requested prop firm or resource could not be found.",
      };
    }

    if (error.message.includes("not enabled") || error.message.includes("not sold")) {
      return {
        code: "FIRM_POLICY_VIOLATION",
        error: error.message,
        userMessage: error.message,
      };
    }

    if (error.message.includes("Email delivery failed")) {
      return {
        code: "EMAIL_DELIVERY_FAILED",
        error: error.message,
        userMessage:
          "The account was created but we could not send credentials. Check email configuration and retry.",
      };
    }

    return {
      code: "PROVISIONING_FAILED",
      error: error.message,
      userMessage:
        "Account provisioning failed. Review the details below or contact platform support.",
    };
  }

  return {
    code: "PROVISIONING_FAILED",
    error: "Unknown error",
    userMessage: "Something went wrong while provisioning the account.",
  };
}

export function provisioningErrorResponse(
  error: unknown,
  fallbackStatus = 422,
): NextResponse {
  const body = provisioningErrorBody(error);
  const status =
    error instanceof ProvisioningError
      ? error.status
      : error instanceof ZodError
        ? 400
        : body.code === "NOT_FOUND"
          ? 404
          : fallbackStatus;

  return NextResponse.json(body, { status });
}

export function provisioningValidationResponse(error: ZodError): NextResponse {
  return NextResponse.json(formatZodError(error), { status: 400 });
}

/** Extract client IP for audit logging and rate limiting. */
export function getRequestIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? null;
  const realIp = request.headers.get("x-real-ip");
  return realIp?.trim() ?? null;
}
