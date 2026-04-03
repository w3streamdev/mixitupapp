import { IsBoolean, IsObject, IsOptional, IsString } from "class-validator";

export class RunCommandBody {
  @IsOptional()
  @IsString()
  platform?: string;

  @IsOptional()
  @IsString({ each: true })
  arguments?: string[];

  @IsOptional()
  @IsObject()
  specialIdentifiers?: Record<string, string>;

  @IsOptional()
  @IsBoolean()
  ignoreRequirements?: boolean;
}
