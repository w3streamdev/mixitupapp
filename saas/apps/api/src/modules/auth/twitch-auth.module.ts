import { Module } from "@nestjs/common";
import { CommandsModule } from "../commands/commands.module.js";
import { EventsTriggerModule } from "../events/events-trigger.module.js";
import { TwitchOAuthController } from "./twitch-oauth.controller.js";
import { TwitchEventSubController } from "./twitch-eventsub.controller.js";
import { TwitchEventSubService } from "./twitch-eventsub.service.js";

@Module({
  imports: [CommandsModule, EventsTriggerModule],
  controllers: [TwitchOAuthController, TwitchEventSubController],
  providers: [TwitchEventSubService],
  exports: [TwitchEventSubService],
})
export class TwitchAuthModule {}
