import * as Ajv from 'ajv';

export interface BaseError {
  keyword: string;
  dataPath: string;
}
/*
export type DataRelativeError = {
  dataPath: string;
};
*/
export type FileRelativeError = {
  fileLocation: string;
  filePath: string;
};

export type AjvError = BaseError & {
  params: Ajv.ErrorParameters;
  schemaPath: string;
};

// Sentry Parameter Types
export type PathValidationParamsTypes = 'emptySegments' | 'duplicateParameters' | 'identicalPaths';
export type PathValidationParams = {
  type: PathValidationParamsTypes;
  path: string;
  pathParams?: string[];
};

export type JsonRefValidationParamsTypes = 'invalidReference' | 'missingReference';
export type JsonRefValidationParams = {
  type: JsonRefValidationParamsTypes;
  value: string;
};

export type JsonRefTypeValidationParams = {
  schema: string;
  fqUri?: string;
};

export type SentryValidationParams = PathValidationParams | JsonRefValidationParams | JsonRefTypeValidationParams;

interface SentryError<K extends string, T extends SentryValidationParams> extends BaseError {
  keyword: K;
  params: T;
}
export type PathValidationError = SentryError<'pathsValidation', PathValidationParams>;
export type JsonRefTypeValidationError = SentryError<'jsonRefTypeValidation', JsonRefTypeValidationParams>;
export type JsonRefValidationError = SentryError<'jsonRefValidation', JsonRefValidationParams>;

export type ValidationError = AjvError | PathValidationError | JsonRefTypeValidationError | JsonRefValidationError;

export class RefResolutionError extends Error {
  resolved: object;
  errors: JsonRefValidationError[];

  constructor(resolved: object, errors: JsonRefValidationError[], ...params: any[]) {
    // Pass remaining arguments (including vendor specific ones) to parent constructor
    super(...params);
    /*
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RefResolutionError);
    }
*/
    // Custom debugging information
    this.resolved = resolved;
    this.errors = errors;
  }
}
/*
export function isDataRelative(error: DataRelativeError | FileRelativeError): error is DataRelativeError {
  return (<DataRelativeError>error).dataPath !== undefined;
}
*/
