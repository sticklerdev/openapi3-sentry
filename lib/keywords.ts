import * as Ajv from 'ajv';
import { compile, parse } from 'json-pointer';

export type pathsVarsUniqueAndBoundParams = {
  path: string;
  keyword: 'duplicateParameters' | 'identicalPaths';
  duplicateParameters: string[];
  identicalPaths: string[];
};

export const pathsVarsUniqueAndBound: Ajv.SchemaValidateFunction = (
  schema: any,
  data: any,
  parentSchema?: object,
  dataPath?: string,
  parentData?: object | any[],
  parentDataProperty?: string | number,
  rootData?: object | any[]
): boolean => {
  // console.log('Schema: ' + JSON.stringify(schema, null, 2));
  // console.log('Data: ' + JSON.stringify(data, null, 2));
  // console.log('Current Data Path: ' + dataPath);
  // console.log('Parent Data: ' + JSON.stringify(parentData, null, 2));
  // console.log('Root Data: ' + JSON.stringify(rootData, null, 2));

  pathsVarsUniqueAndBound.errors = [];
  if (typeof data === 'object') {
    const pathToSegmentsMap = new Map<string, PathSegment[]>();
    for (const path in data) {
      const pathSegments = getPathSegments(path);
      const duplicateParameters = findDuplicateParametersInPath(pathSegments);
      // console.log('Dupes', duplicateParameters);
      if (duplicateParameters.length > 0) {
        pathsVarsUniqueAndBound.errors.push({
          keyword: 'pathsVarsUniqueAndBound',
          // message: 'maxPoints attribute should be ' + 0 + ', but is ' + 0,
          params: {
            path,
            duplicateParameters,
            keyword: 'duplicateParameters',
          },
          // dataPath: compile(parse(dataPath!).concat(path)),
          dataPath: compile(parse(dataPath!)),
          schemaPath: '',
        });
      }
      pathToSegmentsMap.set(path, pathSegments);
    }
    const pathToIdenticalsMap = new Map<string, string[]>();
    for (const path in data) {
      if (pathToSegmentsMap.has(path)) {
        const identicalPaths = findIdenticalPaths(path, pathToSegmentsMap);
        pathToSegmentsMap.delete(path);
        if (identicalPaths.length > 0) {
          pathToIdenticalsMap.set(path, identicalPaths);
          pathsVarsUniqueAndBound.errors.push({
            keyword: 'pathsVarsUniqueAndBound',
            // message: 'maxPoints attribute should be ' + 0 + ', but is ' + 0,
            params: {
              path,
              identicalPaths,
              keyword: 'identicalPaths',
            },
            // dataPath: compile(parse(dataPath!).concat(path)),
            dataPath: compile(parse(dataPath!)),
            schemaPath: '',
          });
          identicalPaths.forEach(identPath => {
            pathToSegmentsMap.delete(identPath);
          });
        }
      }
    }
    /*
    if (pathToIdenticalsMap.size > 0) {
      return false;
    }
*/
    return pathsVarsUniqueAndBound.errors.length > 0 ? false : true;
  }
  return true;
};

function findIdenticalPaths(pathToCheck: string, pathToSegmentsMap: Map<string, PathSegment[]>): string[] {
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
        segmentsIdential = segmentsIdential && isSegmentIdentical(pathSegment, pathSegmentsToCheckAgainst[index]);
      });
    }
    if (segmentsIdential === true) {
      identicalPaths.push(checkAgainst);
    }
  }
  return identicalPaths;
}

function isSegmentIdentical(segment1: PathSegment, segment2: PathSegment): boolean {
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

function findDuplicateParametersInPath(pathSegments: PathSegment[]) {
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

type PathSegment = {
  segId: number;
  prefix: string;
  formalName?: string;
  normalizedName?: string;
};

function getPathSegments(path: string) {
  let normalizedPath: string = path;
  if (path !== '/' && path.endsWith('/')) {
    normalizedPath = path.substring(0, path.length - 1);
  }
  // const pathValidationRegEx = /^(\/[^{}\/]*(\{[a-zA-Z_][0-9a-zA-Z_]*\})?)+$/;
  // Look for all occurence of string like {param1}
  const matchEx = /\/([^{}\/]*)(\{([a-zA-Z_][0-9a-zA-Z_]*)\})?/g;
  const pathSegments: PathSegment[] = [];
  let match;
  let segId = 0;
  while ((match = matchEx.exec(normalizedPath))) {
    // console.log(match);
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
