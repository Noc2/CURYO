export class CuryoSdkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CuryoSdkError";
  }
}

export class CuryoApiError extends CuryoSdkError {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "CuryoApiError";
    this.status = status;
  }
}
