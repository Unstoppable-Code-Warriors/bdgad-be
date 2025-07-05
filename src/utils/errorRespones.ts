export class ErrorResponse {
  constructor(
    public readonly code: string,
    public readonly message: string,
    public readonly status: number,
  ) {}

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      status: this.status,
    };
  }
}


export const errorMasterFile = {
  masterFileNotFound: new ErrorResponse(
    'MASTER_FILE_NOT_FOUND',
    'Master file not found',
    404,
  )
}
