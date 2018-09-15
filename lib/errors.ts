import * as Ajv from 'ajv';
import { get } from 'json-pointer';
import { JsonReferenceValidator } from './jsonReferenceValidator';
import { prettyPrint } from './utils';

export interface BaseError {
  keyword: string;
  dataPath: string;
}

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

export function getErrorMessages(apiToValidate: any, errors: ValidationError[]): string[] {
  return errors.map(error => {
    let message: string;

    const dataPath = error.dataPath;
    const fileRelativePath = JsonReferenceValidator.dataPathToLocation(error);
    const jsonPath = fileRelativePath.fileLocation + fileRelativePath.filePath;
    const jsonValue = get(apiToValidate, dataPath);

    switch (error.keyword) {
      case 'type': {
        const params = <Ajv.TypeParams>error.params;
        message = buildMessage('Invalid property type', jsonPath, params.type, getType(jsonValue));
        break;
      }
      case 'required': {
        const params = <Ajv.RequiredParams>error.params;
        message = buildMessage('Missing required property', jsonPath, params.missingProperty);
        break;
      }
      case 'format': {
        const params = <Ajv.FormatParams>error.params;
        let examples: string[] = [];
        switch (dataPath) {
          case '/info/termsOfService': {
            examples = ['http://example.com/terms'];
            break;
          }
          case '/info/contact/url': {
            examples = ['http://www.example.com/support'];
            break;
          }
          case '/info/contact/email': {
            examples = ['support@example.com'];
            break;
          }
          case '/info/license/url': {
            examples = ['https://www.apache.org/licenses/LICENSE-2.0.html'];
            break;
          }
          default: {
            examples = [];
          }
        }
        message = buildMessage('Invalid format for property value', jsonPath, params.format, jsonValue, examples);
        break;
      }
      case 'pattern': {
        const params = <Ajv.PatternParams>error.params;
        let examples: string[] = [];
        switch (dataPath) {
          case '/openapi': {
            examples = ['3.0.1', '3.0.2-rc1'];
            break;
          }
          default: {
            examples = [];
          }
        }
        message = buildMessage('Invalid pattern for property value', jsonPath, params.pattern, jsonValue, examples);
        break;
      }
      case 'minItems': {
        const params = <Ajv.LimitParams>error.params;
        message = buildMessage('Invalid length for property value', jsonPath, `min ${params.limit}`, jsonValue.length);
        break;
      }
      case 'additionalProperties': {
        const params = <Ajv.AdditionalPropertiesParams>error.params;
        let examples: string[] = [];
        switch (dataPath) {
          case '/paths': {
            examples = ['/abc', '/{def}', '/abc/g{def}'];
            break;
          }
          default: {
            examples = [];
          }
        }
        message = buildMessage('Unknown property', jsonPath, undefined, params.additionalProperty, examples);
        break;
      }
      case 'pathsValidation': {
        const params = <PathValidationParams>error.params;
        switch (params.type) {
          case 'emptySegments': {
            message = `Empty path segments at ${jsonPath}['${params.path}']`;
            break;
          }
          case 'identicalPaths': {
            message = `Idential paths at ${jsonPath}['${params.path}'] - similar paths ${params.pathParams!.join(
              ', '
            )}`;
            break;
          }
          case 'duplicateParameters': {
            message = `Multiple uses of same parameter at ${jsonPath}['${
              params.path
            }'] - duplicate parametrs ${params.pathParams!.join(', ')}`;
            break;
          }
          default: {
            message = 'Unknown error with paths';
          }
        }
        break;
      }
      case 'jsonRefValidation': {
        const params = <JsonRefValidationParams>error.params;
        switch (params.type) {
          case 'invalidReference': {
            message = `Malformed reference at ${jsonPath} - value ${params.value}`;
            break;
          }
          case 'missingReference': {
            message = `Missing reference at ${jsonPath} - value ${params.value}`;
            break;
          }
          default: {
            message = 'Unknown error with json references';
          }
        }
        break;
      }
      case 'jsonRefTypeValidation': {
        const params = <JsonRefTypeValidationParams>error.params;
        message = `Referenced type at ${jsonPath} - pointing to ${params.fqUri} must confirm to schema ${
          params.schema
        }`;
        break;
      }
      default: {
        message = `Unknown/unhandled error ${error.keyword}`;
      }
    }
    return message;
  });
}

function buildMessage(error: string, source: string, expected?: string, actual?: string, examples?: string[]) {
  const examplesStr = examples !== undefined && examples.length > 0 ? ` (e.g. ${examples.join(', ')})` : '';
  return `${error} at ${source} - expected: ${expected === undefined ? '<none>' : expected}${examplesStr}, actual: ${
    actual === undefined ? '<none>' : actual
  }`;
}

function getType(jsonNode: any) {
  return typeof jsonNode;
}
