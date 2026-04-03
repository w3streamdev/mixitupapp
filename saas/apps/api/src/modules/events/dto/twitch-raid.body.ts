import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from "class-validator";

export class TwitchRaidBody {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsString()
  @IsNotEmpty()
  username!: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsInt()
  @Min(0)
  viewers!: number;
}
