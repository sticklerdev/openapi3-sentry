import * as Ajv from 'ajv';
import { get } from 'json-pointer';
import jsonRefs = require('json-refs');

import { ContentProcessor, PathTranslator } from './validator';
import {
  BaseError,
  FileRelativeError,
  RefResolutionError,
  JsonRefValidationParamsTypes,
  JsonRefValidationError,
} from './errors';
import { prettyPrint } from './utils';

function createThrowableError(resolved: object, errors: JsonRefValidationError[]): RefResolutionError {
  return new RefResolutionError(resolved, errors);
}

function createError(
  type: JsonRefValidationParamsTypes,
  refs: { [jsonPointer: string]: jsonRefs.ResolvedRefDetails },
  key: string
): JsonRefValidationError {
  return {
    dataPath: key.substring(1),
    keyword: 'jsonRefValidation',
    params: {
      type,
      value: refs[key].def['$ref'],
    },
  };
}

export class JsonReferenceValidator {
  static ajv: Ajv.Ajv;
  static resolutionResult: jsonRefs.ResolvedRefsResults;
  static pathTranslator?: PathTranslator;

  static async initValidator(
    ajv: Ajv.Ajv,
    document: object,
    pathTranslator?: PathTranslator,
    contentProcessor?: ContentProcessor
  ) {
    jsonRefs.clearCache();
    JsonReferenceValidator.ajv = ajv;
    JsonReferenceValidator.pathTranslator = pathTranslator;

    const options: jsonRefs.JsonRefsOptions = {
      resolveCirculars: false,
      includeInvalid: true,
    };

    if (contentProcessor !== undefined) {
      options.loaderOptions = {
        processContent: (
          res: { text: string },
          callback: (err: any, res: string) => void,
          location: { requested: string; resolved: string }
        ) => {
          const content = contentProcessor(location.resolved, JSON.parse(res.text));
          callback(null, content);
        },
      };
    }

    JsonReferenceValidator.resolutionResult = await jsonRefs.resolveRefs(document, options);
    JsonReferenceValidator.validateRefs(JsonReferenceValidator.resolutionResult);

    ajv.removeKeyword('validationSchema');
    ajv.removeKeyword('validateDefOrRef');
    ajv.addKeyword('validationSchema', {
      metaSchema: {
        $schema: 'http://json-schema.org/draft-04/schema#',
        type: 'string',
      },
    });
    ajv.addKeyword('validateDefOrRef', {
      errors: true,
      validate: JsonReferenceValidator.validateDefOrRef,
      $data: true,
      metaSchema: {
        $schema: 'http://json-schema.org/draft-04/schema#',
      },
    });
    return JsonReferenceValidator.resolutionResult.resolved;
  }

  static dataPathToLocation(baseError: BaseError): FileRelativeError {
    const dataPath = baseError.dataPath;
    const pathElements = jsonRefs.pathFromPtr(`#${dataPath}`);

    let currentFile = JsonReferenceValidator.resolutionResult.rootLocation;
    let currentFragment = '';
    let currentPathElements: string[] = [];
    let index = 0;
    const deps = JsonReferenceValidator.resolutionResult.deps;
    pathElements.forEach(pathElement => {
      currentPathElements.push(pathElement);
      const depLocation = this.getDependencyLocation(currentFile, currentPathElements, index);
      if (
        deps[depLocation.depContainer] !== undefined &&
        deps[depLocation.depContainer][depLocation.depsKey] !== undefined
      ) {
        const refTo = deps[depLocation.depContainer][depLocation.depsKey];
        currentFile = refTo.substring(0, refTo.indexOf('#'));
        currentFragment = refTo.substring(refTo.indexOf('#') + 1);
        currentPathElements = [];
        index = 0;
      } else {
        currentFragment = `${currentFragment}/${pathElement}`;
        index = index + 1;
      }
    });

    return {
      fileLocation:
        JsonReferenceValidator.pathTranslator !== undefined
          ? JsonReferenceValidator.pathTranslator(JsonReferenceValidator.resolutionResult.rootLocation, currentFile)
          : currentFile,
      filePath: `#${currentFragment}`,
    };
  }

  private static validateRefs(resolutionResult: jsonRefs.ResolvedRefsResults) {
    const errors: JsonRefValidationError[] = [];

    const allRefs = resolutionResult.refs;

    // Find invalids
    let invalidCount = 0;
    for (const key in allRefs) {
      if (allRefs[key].type === 'invalid') {
        invalidCount = invalidCount + 1;
        errors.push(createError('invalidReference', allRefs, key));
      }
    }
    if (invalidCount > 0) {
      throw createThrowableError(resolutionResult.resolved, errors);
    }

    // Find missing
    let missingCount = 0;
    for (const key in allRefs) {
      if (allRefs[key].missing === true) {
        missingCount = missingCount + 1;
        errors.push(createError('missingReference', allRefs, key));
      }
    }
    if (missingCount > 0) {
      throw createThrowableError(resolutionResult.resolved, errors);
    }
  }

  private static validateDefOrRef(
    schema: any,
    data: any,
    parentSchema: object,
    dataPath?: string,
    parentData?: object | any[],
    parentDataProperty?: string | number,
    rootData?: object | any[]
  ): boolean {
    const refs = JsonReferenceValidator.resolutionResult.refs;
    const schemaToValidateAgainst = parentSchema['validationSchema'];
    const refValidate = JsonReferenceValidator.ajv.getSchema(
      `http://openapis.org/v3/schema.json${schemaToValidateAgainst}`
    );
    // If data is a result of reference
    let dataToValidate = data;
    if (refs[`#${dataPath}`] !== undefined) {
      const refErrors = [];
      if (data.$ref !== undefined) {
        const dataAddress = data.$ref.substring(1);
        dataToValidate = get(JsonReferenceValidator.resolutionResult.resolved, dataAddress);
      }
      const refValidationResult = <boolean>refValidate(dataToValidate);
      if (refValidationResult === false) {
        refErrors.push({
          dataPath,
          keyword: 'jsonRefTypeValidation',
          params: {
            schema: schemaToValidateAgainst,
            fqUri: refs[`#${dataPath}`].uri,
          },
        });
      }
      JsonReferenceValidator.validateDefOrRef['errors'] = refErrors;
      return refValidationResult;
    }
    // Inlined data
    const refValidationResult = <boolean>refValidate(dataToValidate);
    JsonReferenceValidator.validateDefOrRef['errors'] = refValidate['errors'];
    return refValidationResult;
  }

  private static getDependencyLocation(fileName: string, pathElements: string[], index: number) {
    const depLocation = {
      depContainer: fileName + jsonRefs.pathToPtr(pathElements.slice(0, index)),
      depsKey: jsonRefs.pathToPtr([pathElements[index]]),
    };
    return depLocation;
  }
}
