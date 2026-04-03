import { describe, it, expect, vi } from "vitest";
import { HttpException, HttpStatus, NotFoundException, BadRequestException } from "@nestjs/common";
import { GlobalExceptionFilter } from "./http-exception.filter.js";

function createMockHost(url = "/test") {
  const sendArgs: unknown[] = [];
  const reply = {
    status: vi.fn().mockReturnThis(),
    header: vi.fn().mockReturnThis(),
    send: vi.fn((...args: unknown[]) => {
      sendArgs.push(...args);
      return reply;
    }),
  };
  const request = { url, headers: {} as Record<string, string> };
  return {
    switchToHttp: () => ({
      getResponse: () => reply,
      getRequest: () => request,
    }),
    reply,
    request,
    getSentBody: () => sendArgs[0] as Record<string, unknown>,
  };
}

describe("GlobalExceptionFilter", () => {
  const filter = new GlobalExceptionFilter();

  it("should format HttpException as RFC7807 problem detail", () => {
    const host = createMockHost("/api/v2/commands/123");
    const exception = new NotFoundException("Command not found");

    filter.catch(exception, host as never);

    expect(host.reply.status).toHaveBeenCalledWith(404);
    expect(host.reply.header).toHaveBeenCalledWith("content-type", "application/problem+json");
    const body = host.getSentBody();
    expect(body.type).toBe("https://httpstatuses.io/404");
    expect(body.title).toBe("Not Found");
    expect(body.status).toBe(404);
    expect(body.instance).toBe("/api/v2/commands/123");
  });

  it("should handle validation errors (array messages)", () => {
    const host = createMockHost();
    const exception = new BadRequestException({
      message: ["name must be a string", "amount must be an integer"],
      error: "Bad Request",
    });

    filter.catch(exception, host as never);

    const body = host.getSentBody();
    expect(body.status).toBe(400);
    expect(body.detail).toContain("name must be a string");
  });

  it("should handle unknown exceptions as 500", () => {
    const host = createMockHost();

    filter.catch(new Error("unexpected"), host as never);

    expect(host.reply.status).toHaveBeenCalledWith(500);
    const body = host.getSentBody();
    expect(body.title).toBe("Internal Server Error");
    expect(body.detail).toBe("An unexpected error occurred");
  });

  it("should include traceId from request header", () => {
    const host = createMockHost();
    host.request.headers = { "x-trace-id": "abc-123" };

    filter.catch(new HttpException("test", HttpStatus.FORBIDDEN), host as never);

    const body = host.getSentBody();
    expect(body.traceId).toBe("abc-123");
  });
});
