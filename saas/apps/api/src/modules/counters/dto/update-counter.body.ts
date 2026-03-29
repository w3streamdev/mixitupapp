import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString } from "class-validator";

export class UpdateCounterBody {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  amount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  resetAmount?: number;
}
