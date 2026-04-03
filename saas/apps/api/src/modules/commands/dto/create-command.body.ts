import { IsBoolean, IsNotEmpty, IsObject, IsOptional, IsString } from "class-validator";

export class CreateCommandBody {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  type!: string;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  unlocked?: boolean;

  @IsOptional()
  @IsString()
  groupName?: string;

  @IsObject()
  definition!: Record<string, unknown>;
}
