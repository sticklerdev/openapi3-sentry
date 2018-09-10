import * as Ajv from 'ajv';
import { get } from 'json-pointer';
import jsonSchemaDraft04Json = require('./schema/json-schema-draft-04.json');
// import dataJson = require('./schema/data.json');

// Import formats to get a handle on uri-reference
const ajvFormats = require('ajv/lib/compile/formats');

import { OpenApi3Validator, ApiValidationResult } from './interfaces';
import { getOpenApi3Schema } from './openApi3Schema';
import { PathValidator } from './pathValidator';
import { JsonReferenceValidator } from './jsonReferenceValidator';
import {
  ValidationError,
  RefResolutionError,
  JsonRefValidationParams,
  JsonRefTypeValidationParams,
  PathValidationParams,
} from './errors';
import { prettyPrint } from './utils';

export type ContentProcessor = (location: string, originalObject: any) => any;
export type PathTranslator = (rootLocation: string, docLocation: string) => string;

export class OpenApi3ValidatorImpl implements OpenApi3Validator {
  private ajv: Ajv.Ajv;
  private contentProcessor?: ContentProcessor;
  private pathTranslator?: PathTranslator;

  constructor(pathTranslator?: PathTranslator, contentProcessor?: ContentProcessor) {
    this.contentProcessor = contentProcessor;
    this.pathTranslator = pathTranslator;
    this.ajv = this.prepareAjvInstance();
  }

  async validateApi(document: object): Promise<ApiValidationResult> {
    let apiToValidate = document;
    try {
      apiToValidate = await JsonReferenceValidator.initValidator(
        this.ajv,
        document,
        this.pathTranslator,
        this.contentProcessor
      );
      PathValidator.initValidator(this.ajv);
      const validate = this.ajv.compile(getOpenApi3Schema());
      const isValid = <boolean>validate(apiToValidate);
      if (isValid === true) {
        return { isValid };
      }
      return { isValid, errors: this.buildHumanErrors(apiToValidate, validate.errors!) };
    } catch (refErrors) {
      const resolutionError = <RefResolutionError>refErrors;
      apiToValidate = resolutionError.resolved;
      return { isValid: false, errors: this.buildHumanErrors(apiToValidate, resolutionError.errors) };
    }
  }

  private prepareAjvInstance() {
    const ajv = Ajv({
      schemaId: 'id',
      meta: false, // optional, to prevent adding draft-06 meta-schema
      extendRefs: true, // optional, current default is to 'fail', spec behaviour is to 'ignore'
      unknownFormats: 'ignore', // optional, current default is true (fail)
      // useDefaults: true,
      // coerceTypes: true,
      allErrors: true,
      jsonPointers: true,
      // $data: true,
    });

    ajv.addMetaSchema(jsonSchemaDraft04Json);
    // ajv.addMetaSchema(dataJson, '$id');

    this.addFormats(ajv);
    return ajv;
  }

  private addFormats(ajv: Ajv.Ajv) {
    // Add uri-reference as uriref because that is what schema.json uses
    ajv.addFormat('uriref', ajvFormats.full['uri-reference']);
  }

  private buildHumanErrors(apiToValidate: any, errors: ValidationError[]): string[] {
    return errors.map(error => {
      let message: string;

      const dataPath = error.dataPath;
      const fileRelativePath = JsonReferenceValidator.dataPathToLocation(error);
      const jsonPath = fileRelativePath.fileLocation + fileRelativePath.filePath;
      const jsonValue = get(apiToValidate, dataPath);

      switch (error.keyword) {
        case 'type': {
          const params = <Ajv.TypeParams>error.params;
          message = this.buildMessage('Invalid property type', jsonPath, params.type, this.getType(jsonValue));
          break;
        }
        case 'required': {
          const params = <Ajv.RequiredParams>error.params;
          message = this.buildMessage('Missing required property', jsonPath, params.missingProperty);
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
          message = this.buildMessage(
            'Invalid format for property value',
            jsonPath,
            params.format,
            jsonValue,
            examples
          );
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
          message = this.buildMessage(
            'Invalid pattern for property value',
            jsonPath,
            params.pattern,
            jsonValue,
            examples
          );
          break;
        }
        case 'minItems': {
          const params = <Ajv.LimitParams>error.params;
          message = this.buildMessage(
            'Invalid length for property value',
            jsonPath,
            `min ${params.limit}`,
            jsonValue.length
          );
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
          message = this.buildMessage('Unknown property', jsonPath, undefined, params.additionalProperty, examples);
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

  private buildMessage(error: string, source: string, expected?: string, actual?: string, examples?: string[]) {
    const examplesStr = examples !== undefined && examples.length > 0 ? ` (e.g. ${examples.join(', ')})` : '';
    return `${error} at ${source} - expected: ${expected === undefined ? '<none>' : expected}${examplesStr}, actual: ${
      actual === undefined ? '<none>' : actual
    }`;
  }

  private getType(jsonNode: any) {
    return typeof jsonNode;
  }
}
