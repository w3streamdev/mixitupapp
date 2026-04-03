import { Module } from "@nestjs/common";
import { CommandsController } from "./commands.controller.js";
import { CommandsService } from "./commands.service.js";
import { PremadeCommandsService } from "./premade-commands.service.js";

@Module({
  controllers: [CommandsController],
  providers: [CommandsService, PremadeCommandsService],
  exports: [CommandsService, PremadeCommandsService],
})
export class CommandsModule {}
