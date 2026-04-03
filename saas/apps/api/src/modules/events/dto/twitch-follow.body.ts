import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class TwitchFollowBody {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsString()
  @IsNotEmpty()
  username!: string;

  @IsOptional()
  @IsString()
  displayName?: string;
}
