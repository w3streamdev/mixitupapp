import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString } from "class-validator";

export class AdjustBalanceBody {
  @Type(() => Number)
  @IsInt()
  amount!: number;

  @IsOptional()
  @IsString()
  reason?: string;
}
