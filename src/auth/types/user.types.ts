export interface AuthenticatedUser {
  id: number;
  email: string;
  name: string;
  roles: {
    id: number;
    name: string;
    code: string;
  }[];
}
