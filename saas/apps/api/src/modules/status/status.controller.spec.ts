import { describe, it, expect } from "vitest";
import { StatusController } from "./status.controller.js";

describe("StatusController", () => {
  const controller = new StatusController();

  it("should return version info", () => {
    const result = controller.getVersion();
    expect(result).toHaveProperty("version");
    expect(result).toHaveProperty("environment");
    expect(result).toHaveProperty("timestamp");
  });

  it("should return health info", () => {
    const result = controller.getHealth();
    expect(result.status).toBe("healthy");
    expect(typeof result.uptime).toBe("number");
    expect(result).toHaveProperty("timestamp");
  });
});
