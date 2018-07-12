import * as Ajv from 'ajv';
import { get } from 'json-pointer';

import jsonSchemaDraft04Json = require('./schema/json-schema-draft-04.json');
// tslint:disable: import-name
import schemaJson = require('./schema-short/schema.json');
// import schemaJson = require('./schema-short/schema-abbr.json');
// import schemaJson = require('./schema/gnostic.json');

// Import formats to get a handle on uri-reference
const ajvFormats = require('ajv/lib/compile/formats');
import { pathsVarsUniqueAndBound, pathsVarsUniqueAndBoundParams } from './keywords';

export interface ValidationResult<R> {
  isValid: boolean;
  errors?: R[];
}

// export interface ApiValidationResult extends ValidationResult<Ajv.ErrorObject> {}
export interface ApiValidationResult extends ValidationResult<string> {}

export interface OpenApi3Validator {
  validateApi(apiToValidate: any): ApiValidationResult;
}

export class OpenApi3ValidatorImpl implements OpenApi3Validator {
  private validate: Ajv.ValidateFunction;

  constructor() {
    const ajv = Ajv({
      schemaId: 'id',
      meta: false, // optional, to prevent adding draft-06 meta-schema
      extendRefs: true, // optional, current default is to 'fail', spec behaviour is to 'ignore'
      unknownFormats: 'ignore', // optional, current default is true (fail)
      // useDefaults: true,
      // coerceTypes: true,
      allErrors: true,
      jsonPointers: true,
    });
    ajv.addMetaSchema(jsonSchemaDraft04Json);

    // Add uri-reference as uriref because that is what schema.json uses
    ajv.addFormat('uriref', ajvFormats.full['uri-reference']);

    ajv.addKeyword('pathsVarsUniqueAndBound', {
      // type: 'string',
      errors: true,
      validate: pathsVarsUniqueAndBound,
    });

    schemaJson['title'] = 'A JSON Schema for OpenAPI 3.0.';
    schemaJson['id'] = 'http://openapis.org/v3/schema.json#';
    schemaJson['$schema'] = 'http://json-schema.org/draft-04/schema#';

    // Add minItems to the servers array or it is of no use
    schemaJson['properties']['servers']['minItems'] = 1;

    // Update the regular expression to validate paths
    // const pathValidationRegEx = /^(\/[^{}\/]*(\{[a-zA-Z_][0-9a-zA-Z_]*\})?)+$/;
    const pathValidationRegExString = '^(\\/[^{}\\/]*(\\{[a-zA-Z_][0-9a-zA-Z_]*\\})?)+$';
    const patternProperties: any = {};
    patternProperties[pathValidationRegExString] = {
      $ref: '#/definitions/PathItem',
    };
    schemaJson['definitions']['Paths']['patternProperties'] = patternProperties;

    schemaJson['definitions']['Paths']['pathsVarsUniqueAndBound'] = { a: 'b' };

    // ajv.validateSchema(schemaJson);
    this.validate = ajv.compile(schemaJson);
  }

  validateApi(apiToValidate: any): ApiValidationResult {
    const isValid = <boolean>this.validate(apiToValidate);
    if (isValid === true) {
      return { isValid };
    }
    return { isValid, errors: this.buildHumanErrors(apiToValidate, this.validate.errors!) };
  }

  buildHumanErrors(apiToValidate: any, errors: Ajv.ErrorObject[]): string[] {
    return errors.map(error => {
      // console.log(error);
      let message: string;
      const jsonPath = 'api' + error.dataPath;
      const jsonValue = get(apiToValidate, error.dataPath);
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
          switch (error.dataPath) {
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
          switch (error.dataPath) {
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
            'min ' + params.limit,
            jsonValue.length
          );
          break;
        }
        case 'additionalProperties': {
          const params = <Ajv.AdditionalPropertiesParams>error.params;
          let examples: string[] = [];
          switch (error.dataPath) {
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
        case 'pathsVarsUniqueAndBound': {
          const params = <pathsVarsUniqueAndBoundParams>error.params;
          switch (params.keyword) {
            case 'identicalPaths': {
              message = `Idential paths at ${jsonPath}['${params.path}'] - similar paths ${params.identicalPaths.join(
                ', '
              )}`;
              break;
            }
            case 'duplicateParameters': {
              message = `Multiple uses of same parameter at ${jsonPath}['${
                params.path
              }'] - duplicate parametrs ${params.duplicateParameters.join(', ')}`;
              break;
            }
            default: {
              message = 'Unknown error with paths';
            }
          }
          break;
        }
        default: {
          message = 'Unknown/unhandled error';
        }
      }
      return message;
    });
  }

  buildMessage(error: string, source: string, expected?: string, actual?: string, examples?: string[]) {
    const examplesStr = examples !== undefined && examples.length > 0 ? ' (e.g. ' + examples.join(', ') + ')' : '';
    return `${error} at ${source} - expected: ${expected === undefined ? '<none>' : expected}${examplesStr}, actual: ${
      actual === undefined ? '<none>' : actual
    }`;
  }

  getType(jsonNode: any) {
    return typeof jsonNode;
  }
}
