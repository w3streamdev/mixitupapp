import { Type } from "class-transformer";
import { IsInt, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateCounterBody {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  amount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  resetAmount?: number;
}
