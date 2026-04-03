import { IsBoolean, IsObject, IsOptional, IsString } from "class-validator";

export class UpdateCommandBody {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  unlocked?: boolean;

  @IsOptional()
  @IsString()
  groupName?: string;

  @IsOptional()
  @IsObject()
  definition?: Record<string, unknown>;
}
