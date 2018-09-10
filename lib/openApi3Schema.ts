import * as fs from 'fs';
import * as YAML from 'yamljs';
import * as jsonPath from 'jsonpath';
import { Operation, applyPatch } from 'fast-json-patch';

const openApi3SchemaYaml = fs.readFileSync('lib/schema/schema.yaml', 'utf8');
const openApi3Schema = YAML.parse(openApi3SchemaYaml);

export function patchPreamble(schema: object) {
  const ops: Operation[] = [
    { op: 'add', path: '/id', value: 'http://openapis.org/v3/schema.json#' },
    { op: 'add', path: '/$schema', value: 'http://json-schema.org/draft-04/schema#' },
    { op: 'add', path: '/title', value: 'A JSON Schema for OpenAPI 3.0' },
  ];
  applyPatch(schema, ops);
}

export function patchServers(schema: object) {
  const ops: Operation[] = [
    { op: 'replace', path: '/properties/servers/minItems', value: 1 },
    { op: 'replace', path: '/definitions/PathItem/properties/servers/minItems', value: 1 },
    { op: 'replace', path: '/definitions/Operation/properties/servers/minItems', value: 1 },
  ];
  applyPatch(schema, ops);
}

export function patchPathValidation(schema: object, pathPattern: string) {
  // Replace the path validation string with the one supplied
  const patternProperties = {};
  patternProperties[pathPattern] = {
    $ref: '#/definitions/PathItem',
  };
  const ops: Operation[] = [
    {
      op: 'replace',
      path: '/definitions/Paths/patternProperties',
      value: patternProperties,
    },
    {
      op: 'add',
      path: '/definitions/Paths/validatePaths',
      value: {},
    },
  ];
  applyPatch(schema, ops);
}

export function patchOneOfReferences(jsonSchema: object) {
  // Get all occurences of "Reference" elements that under "oneOf" element using jsonPath
  const referenceContainers = jsonPath.paths(jsonSchema, '$..oneOf[?(@["$ref"] === "#/definitions/Reference")]');
  referenceContainers.forEach(referenceContainer => {
    const referenceElementIndex = referenceContainer[referenceContainer.length - 1];
    let inlinedElementIndex: number = 0;
    if (referenceElementIndex === 0) {
      inlinedElementIndex = 1;
    } else if (referenceElementIndex === 1) {
      inlinedElementIndex = 0;
    }
    // Path to reference type
    const referenceElementPath = referenceContainer
      .slice(0, referenceContainer.length - 1)
      .concat(referenceElementIndex);
    // Path to inlined type
    const inlinedElementPath = referenceContainer.slice(0, referenceContainer.length - 1).concat(inlinedElementIndex);
    // Path to actual container
    const containerElementPath = referenceContainer.slice(0, referenceContainer.length - 2);

    const ops: Operation[] = [
      {
        op: 'add',
        path: `${jsonPathComponentsToJsonRef(containerElementPath)}/validateDefOrRef`,
        value: {
          $data: '0',
        },
      },
      {
        op: 'add',
        path: `${jsonPathComponentsToJsonRef(containerElementPath)}/validationSchema`,
        value: {
          $ref: '',
        },
      },
      {
        op: 'move',
        from: `${jsonPathComponentsToJsonRef(inlinedElementPath)}/$ref`,
        path: `${jsonPathComponentsToJsonRef(containerElementPath)}/validationSchema`,
      },
      {
        op: 'remove',
        path: `${jsonPathComponentsToJsonRef(containerElementPath)}/oneOf`,
      },
    ];
    applyPatch(jsonSchema, ops);
  });
}

export function getOpenApi3Schema() {
  patchPreamble(openApi3Schema);
  patchPathValidation(openApi3Schema, '^(\\/[^{}\\/]*(\\{[a-zA-Z_][0-9a-zA-Z_]*\\})?)+$');
  patchOneOfReferences(openApi3Schema);
  // TODO These should happen only if we are in linting mode (not implemented yet)
  patchServers(openApi3Schema);
  return openApi3Schema;
}

function jsonPathComponentsToJsonRef(pathComponents: jsonPath.PathComponent[]) {
  const compClone = pathComponents.slice();
  compClone.splice(0, 1, '');
  return compClone.join('/');
}
