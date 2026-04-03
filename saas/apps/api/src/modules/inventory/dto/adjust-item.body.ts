import { Type } from "class-transformer";
import { IsInt } from "class-validator";

export class AdjustItemBody {
  @Type(() => Number)
  @IsInt()
  amount!: number;
}
