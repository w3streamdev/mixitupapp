import { Module } from "@nestjs/common";
import { TwitchConnector } from "./twitch.connector.js";
import { YouTubeConnector } from "./youtube.connector.js";
import { TrovoConnector } from "./trovo.connector.js";
import { ConnectorRegistry } from "./connector.registry.js";

@Module({
  providers: [TwitchConnector, YouTubeConnector, TrovoConnector, ConnectorRegistry],
  exports: [ConnectorRegistry],
})
export class ConnectorsModule {}
