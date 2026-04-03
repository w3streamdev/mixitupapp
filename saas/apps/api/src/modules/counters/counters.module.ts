import { Module } from "@nestjs/common";
import { CountersController } from "./counters.controller.js";
import { CountersService } from "./counters.service.js";

@Module({
  controllers: [CountersController],
  providers: [CountersService],
})
export class CountersModule {}
