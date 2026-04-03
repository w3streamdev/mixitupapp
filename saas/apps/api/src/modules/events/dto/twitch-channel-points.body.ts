import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from "class-validator";

export class TwitchChannelPointsBody {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsString()
  @IsNotEmpty()
  username!: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsString()
  @IsNotEmpty()
  rewardName!: string;

  @IsOptional()
  @IsString()
  rewardId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  cost?: number;

  @IsOptional()
  @IsString()
  userInput?: string;
}
