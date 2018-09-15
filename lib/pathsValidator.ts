import * as Ajv from 'ajv';
import { compile, parse } from 'json-pointer';

import { PathValidationParamsTypes, PathValidationError } from './errors';

type PathSegment = {
  segId: number;
  prefix: string;
  formalName?: string;
  normalizedName?: string;
};

function createError(
  dataPath: string,
  type: PathValidationParamsTypes,
  path: string,
  pathParams?: string[]
): PathValidationError {
  return {
    dataPath: compile(parse(dataPath)),
    keyword: 'pathsValidation',
    params: {
      type,
      path,
      pathParams,
    },
  };
}

export class PathsValidator {
  static async initValidator(ajv: Ajv.Ajv) {
    ajv.removeKeyword('validatePaths');
    ajv.addKeyword('validatePaths', {
      errors: true,
      validate: PathsValidator.pathsVarsUniqueAndBound,
    });
  }

  static pathsVarsUniqueAndBound(
    schema: any,
    data: any,
    parentSchema?: object,
    dataPath?: string,
    parentData?: object | any[],
    parentDataProperty?: string | number,
    rootData?: object | any[]
  ): boolean {
    // console.log('Schema: ' + JSON.stringify(schema, null, 2));
    // console.log('Data: ' + JSON.stringify(data, null, 2));
    // console.log('Current Data Path: ' + dataPath);
    // console.log('Parent Data: ' + JSON.stringify(parentData, null, 2));
    // console.log('Root Data: ' + JSON.stringify(rootData, null, 2));

    const errors = [];
    if (typeof data === 'object') {
      const pathMatchEx = /^(\/[^{}\/]*(\{[a-zA-Z_][0-9a-zA-Z_]*\})?)+$/;
      const pathToSegmentsMap = new Map<string, PathSegment[]>();
      for (const path in data) {
        const isMatch = pathMatchEx.test(path);
        // Do these additional tests only if match is true, i.e. things that aren't caught by the regular expression iteslf
        if (isMatch === true) {
          const pathSegments = PathsValidator.getPathSegments(path);
          if (path !== '/') {
            const emptySegments = PathsValidator.findEmptySegmentsInPath(pathSegments);
            if (emptySegments.length > 0) {
              errors.push(createError(dataPath!, 'emptySegments', path));
            }
          }
          const duplicateParameters = PathsValidator.findDuplicateParametersInPath(pathSegments);
          if (duplicateParameters.length > 0) {
            errors.push(createError(dataPath!, 'duplicateParameters', path, duplicateParameters));
          }
          pathToSegmentsMap.set(path, pathSegments);
        }
      }
      const pathToIdenticalsMap = new Map<string, string[]>();
      for (const path in data) {
        if (pathToSegmentsMap.has(path)) {
          const identicalPaths = PathsValidator.findIdenticalPaths(path, pathToSegmentsMap);
          pathToSegmentsMap.delete(path);
          if (identicalPaths.length > 0) {
            pathToIdenticalsMap.set(path, identicalPaths);
            errors.push(createError(dataPath!, 'identicalPaths', path, identicalPaths));
            identicalPaths.forEach(identPath => {
              pathToSegmentsMap.delete(identPath);
            });
          }
        }
      }
      PathsValidator.pathsVarsUniqueAndBound['errors'] = errors;
      return errors.length > 0 ? false : true;
    }
    return true;
  }

  static getPathSegments(path: string) {
    let normalizedPath: string = path;
    if (path !== '/' && path.endsWith('/')) {
      normalizedPath = path.substring(0, path.length - 1);
    }
    // Look for all occurence of string like {param1}
    const matchEx = /\/([^{}\/]*)(\{([a-zA-Z_][0-9a-zA-Z_]*)\})?/g;
    const pathSegments: PathSegment[] = [];
    let match;
    let segId = 0;
    while ((match = matchEx.exec(normalizedPath))) {
      const pathSegment: PathSegment = {
        segId,
        prefix: match[1],
      };
      // parameter name is inside the curly braces (group 3)
      if (match[3] !== undefined) {
        pathSegment.formalName = match[3];
        pathSegment.normalizedName = `__param__${segId}`;
      }
      pathSegments.push(pathSegment);
      segId = segId + 1;
    }
    return pathSegments;
  }

  static findEmptySegmentsInPath(pathSegments: PathSegment[]) {
    return pathSegments.filter(pathSegment => {
      return pathSegment.prefix === '' && pathSegment.formalName === undefined;
    });
  }

  static findDuplicateParametersInPath(pathSegments: PathSegment[]) {
    const uniq = pathSegments
      .filter(pathSegment => {
        return pathSegment.formalName !== undefined;
      })
      .map(pathSegment => {
        return { parameter: pathSegment.formalName!, count: 1 };
      })
      .reduce((parameterCounts, segmentEntry) => {
        parameterCounts[segmentEntry.parameter] = (parameterCounts[segmentEntry.parameter] || 0) + segmentEntry.count;
        return parameterCounts;
      }, {});
    return Object.keys(uniq).filter(a => uniq[a] > 1);
  }

  static findIdenticalPaths(pathToCheck: string, pathToSegmentsMap: Map<string, PathSegment[]>): string[] {
    const identicalPaths = [];
    const pathSegments = pathToSegmentsMap.get(pathToCheck)!;
    for (const checkAgainst of pathToSegmentsMap.keys()) {
      if (pathToCheck === checkAgainst) {
        continue;
      }
      let segmentsIdential: boolean = true;
      const pathSegmentsToCheckAgainst = pathToSegmentsMap.get(checkAgainst)!;
      if (pathSegments.length !== pathSegmentsToCheckAgainst.length) {
        segmentsIdential = false;
      } else {
        pathSegments.forEach((pathSegment, index) => {
          segmentsIdential =
            segmentsIdential && PathsValidator.isSegmentIdentical(pathSegment, pathSegmentsToCheckAgainst[index]);
        });
      }
      if (segmentsIdential === true) {
        identicalPaths.push(checkAgainst);
      }
    }
    return identicalPaths;
  }

  static isSegmentIdentical(segment1: PathSegment, segment2: PathSegment): boolean {
    if (segment1.prefix === segment2.prefix) {
      if (segment1.normalizedName === undefined && segment2.normalizedName === undefined) {
        return true;
      }
      if (
        (segment1.normalizedName === undefined && segment2.normalizedName !== undefined) ||
        (segment1.normalizedName !== undefined && segment2.normalizedName === undefined)
      ) {
        return false;
      }
      return segment1.normalizedName === segment2.normalizedName;
    }
    return false;
  }
}
