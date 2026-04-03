import { Global, Module } from "@nestjs/common";
import { PubSubPublisher } from "./pubsub.publisher.js";
import { CloudTasksService } from "./cloud-tasks.service.js";

@Global()
@Module({
  providers: [PubSubPublisher, CloudTasksService],
  exports: [PubSubPublisher, CloudTasksService],
})
export class EventsModule {}
