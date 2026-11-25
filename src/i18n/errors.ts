/** Thrown for a key that is not a feedback key or a UI string path. */
export class UnknownTextKeyError extends Error {
  readonly key: string;
  constructor(key: string) {
    super(`Unknown text key: ${key}`);
    this.name = 'UnknownTextKeyError';
    this.key = key;
  }
}

/** Thrown when a text has a {placeholder} the caller did not supply. */
export class MissingParamError extends Error {
  readonly param: string;
  constructor(param: string) {
    super(`Missing value for placeholder: ${param}`);
    this.name = 'MissingParamError';
    this.param = param;
  }
}
