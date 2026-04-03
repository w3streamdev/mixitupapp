import { Module } from "@nestjs/common";
import { EventsTriggerController } from "./events-trigger.controller.js";
import { EventTriggerService } from "./event-trigger.service.js";

@Module({
  controllers: [EventsTriggerController],
  providers: [EventTriggerService],
  exports: [EventTriggerService],
})
export class EventsTriggerModule {}
