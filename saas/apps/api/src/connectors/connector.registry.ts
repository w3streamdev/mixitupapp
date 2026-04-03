import { Injectable, NotFoundException } from "@nestjs/common";
import type { PlatformConnector } from "./connector.interface.js";
import { TwitchConnector } from "./twitch.connector.js";
import { YouTubeConnector } from "./youtube.connector.js";
import { TrovoConnector } from "./trovo.connector.js";

@Injectable()
export class ConnectorRegistry {
  private readonly connectors: Map<string, PlatformConnector>;

  constructor(
    twitch: TwitchConnector,
    youtube: YouTubeConnector,
    trovo: TrovoConnector,
  ) {
    this.connectors = new Map<string, PlatformConnector>();
    this.connectors.set("twitch", twitch);
    this.connectors.set("youtube", youtube);
    this.connectors.set("trovo", trovo);
  }

  get(platform: string): PlatformConnector {
    const connector = this.connectors.get(platform.toLowerCase());
    if (!connector) {
      throw new NotFoundException(`Platform connector '${platform}' not found`);
    }
    return connector;
  }

  list(): string[] {
    return Array.from(this.connectors.keys());
  }
}
