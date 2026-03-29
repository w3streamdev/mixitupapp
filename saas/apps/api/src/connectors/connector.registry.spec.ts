import { describe, it, expect } from "vitest";
import { ConnectorRegistry } from "./connector.registry.js";
import { TwitchConnector } from "./twitch.connector.js";
import { YouTubeConnector } from "./youtube.connector.js";
import { TrovoConnector } from "./trovo.connector.js";

describe("ConnectorRegistry", () => {
  const registry = new ConnectorRegistry(
    new TwitchConnector(),
    new YouTubeConnector(),
    new TrovoConnector(),
  );

  it("should return twitch connector", () => {
    const connector = registry.get("twitch");
    expect(connector.platform).toBe("Twitch");
  });

  it("should return youtube connector (case-insensitive)", () => {
    const connector = registry.get("YouTube");
    expect(connector.platform).toBe("YouTube");
  });

  it("should return trovo connector", () => {
    const connector = registry.get("Trovo");
    expect(connector.platform).toBe("Trovo");
  });

  it("should throw for unknown platform", () => {
    expect(() => registry.get("unknown")).toThrow("not found");
  });

  it("should list all platforms", () => {
    const platforms = registry.list();
    expect(platforms).toEqual(["twitch", "youtube", "trovo"]);
  });
});
