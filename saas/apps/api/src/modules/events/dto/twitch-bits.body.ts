import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from "class-validator";

export class TwitchBitsBody {
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
  @Min(1)
  amount!: number;

  @IsOptional()
  @IsString()
  message?: string;
}
