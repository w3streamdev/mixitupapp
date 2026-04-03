import { IsNotEmpty, IsObject, IsOptional, IsString } from "class-validator";

export class GenericEventBody {
  @IsString()
  @IsNotEmpty()
  platform!: string;

  @IsString()
  @IsNotEmpty()
  eventType!: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;
}
