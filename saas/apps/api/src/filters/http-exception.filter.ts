import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";

interface ProblemDetail {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  timestamp: string;
  traceId?: string;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    let status: number;
    let detail: string;
    let title: string;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const response = exception.getResponse();
      if (typeof response === "string") {
        detail = response;
      } else if (typeof response === "object" && response !== null) {
        const r = response as Record<string, unknown>;
        detail = Array.isArray(r.message) ? r.message.join("; ") : String(r.message ?? "");
      } else {
        detail = "An error occurred";
      }
      title = this.statusToTitle(status);
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      title = "Internal Server Error";
      detail = "An unexpected error occurred";
      this.logger.error("Unhandled exception", exception instanceof Error ? exception.stack : exception);
    }

    const problem: ProblemDetail = {
      type: `https://httpstatuses.io/${status}`,
      title,
      status,
      detail,
      instance: request.url,
      timestamp: new Date().toISOString(),
    };

    const traceId = request.headers["x-trace-id"];
    if (typeof traceId === "string") {
      problem.traceId = traceId;
    }

    void reply.status(status).header("content-type", "application/problem+json").send(problem);
  }

  private statusToTitle(status: number): string {
    const titles: Record<number, string> = {
      400: "Bad Request",
      401: "Unauthorized",
      403: "Forbidden",
      404: "Not Found",
      409: "Conflict",
      422: "Unprocessable Entity",
      429: "Too Many Requests",
      500: "Internal Server Error",
      502: "Bad Gateway",
      503: "Service Unavailable",
    };
    return titles[status] ?? "Error";
  }
}
