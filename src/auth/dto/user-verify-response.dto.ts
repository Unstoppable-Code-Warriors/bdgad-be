export class UserVerifyResponseDto {
  valid: boolean;
  user: {
    id: number;
    email: string;
    name: string;
    roles: {
      id: number;
      name: string;
      code: string;
    }[];
  };
}
