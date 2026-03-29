import { IsNotEmpty, IsString } from "class-validator";

export class NewUserBody {
  @IsString()
  @IsNotEmpty()
  Platform!: string;

  @IsString()
  @IsNotEmpty()
  Username!: string;
}
