import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Public } from "../../auth/public.decorator.js";

@ApiTags("Status")
@Controller("api/v2/status")
export class StatusController {
  @Get("version")
  @Public()
  getVersion() {
    return {
      version: process.env.APP_VERSION ?? "0.1.0",
      environment: process.env.NODE_ENV ?? "development",
      timestamp: new Date().toISOString(),
    };
  }

  @Get("health")
  @Public()
  getHealth() {
    return {
      status: "healthy",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }
}
