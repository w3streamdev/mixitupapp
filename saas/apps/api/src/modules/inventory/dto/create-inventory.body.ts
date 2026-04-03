import { Type } from "class-transformer";
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateInventoryBody {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  defaultMaxAmount?: number;

  @IsOptional()
  @IsBoolean()
  shopEnabled?: boolean;

  @IsOptional()
  @IsString()
  shopCurrencyId?: string;
}
