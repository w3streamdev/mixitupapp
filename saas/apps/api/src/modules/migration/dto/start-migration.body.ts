import { IsObject } from "class-validator";

export class StartMigrationBody {
  @IsObject()
  data!: Record<string, unknown>;
}
