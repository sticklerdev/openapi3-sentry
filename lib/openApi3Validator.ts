import * as Ajv from 'ajv';
import jsonSchemaDraft04Json = require('../node_modules/ajv/lib/refs/json-schema-draft-04.json');

// Import formats to get a handle on uri-reference
const ajvFormats = require('ajv/lib/compile/formats');

import { IOpenApi3Validator, IApiValidationResult } from './interfaces';
import { getOpenApi3Schema } from './openApi3Schema';
import { PathsValidator } from './pathsValidator';
import { JsonReferenceValidator } from './jsonReferenceValidator';
import { RefResolutionError, getErrorMessages } from './errors';
import { prettyPrint } from './utils';

export type ContentProcessor = (location: string, originalObject: any) => any;
export type PathTranslator = (rootLocation: string, docLocation: string) => string;

export class OpenApi3Validator implements IOpenApi3Validator {
  private contentProcessor?: ContentProcessor;
  private pathTranslator?: PathTranslator;

  constructor(pathTranslator?: PathTranslator, contentProcessor?: ContentProcessor) {
    this.contentProcessor = contentProcessor;
    this.pathTranslator = pathTranslator;
  }

  async validateApi(document: object): Promise<IApiValidationResult> {
    const ajv = this.prepareAjvInstance();
    let apiToValidate = document;
    try {
      apiToValidate = await JsonReferenceValidator.initValidator(
        ajv,
        document,
        this.pathTranslator,
        this.contentProcessor
      );
      PathsValidator.initValidator(ajv);
      const validate = ajv.compile(getOpenApi3Schema());

      const isValid = <boolean>validate(apiToValidate);
      if (isValid === true) {
        return { isValid };
      }
      return { isValid, errors: getErrorMessages(apiToValidate, validate.errors!) };
    } catch (refErrors) {
      const resolutionError = <RefResolutionError>refErrors;
      apiToValidate = resolutionError.resolved;
      return { isValid: false, errors: getErrorMessages(apiToValidate, resolutionError.errors) };
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

    this.addFormats(ajv);
    return ajv;
  }

  private addFormats(ajv: Ajv.Ajv) {
    // Add uri-reference as uriref because that is what schema.json uses
    ajv.addFormat('uriref', ajvFormats.full['uri-reference']);
  }
}
