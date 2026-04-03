import { IsNotEmpty, IsObject, IsOptional, IsString } from "class-validator";

export class CreateWebhookBody {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsObject()
  commandDefinition?: Record<string, unknown>;
}
