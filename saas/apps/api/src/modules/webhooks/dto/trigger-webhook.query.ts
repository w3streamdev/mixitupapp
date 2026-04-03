import { IsNotEmpty, IsString } from "class-validator";

export class TriggerWebhookQuery {
  @IsString()
  @IsNotEmpty()
  secret!: string;
}
