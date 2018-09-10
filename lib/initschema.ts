import * as YAML from 'yamljs';
import * as fs from 'fs';
import * as jsonPath from 'jsonpath';

const yamlSchema = fs.readFileSync('lib/schema/schema.yaml', 'utf8');
const yamlSchemaPatch = fs.readFileSync('lib/schema-patch/schema-patch.yaml', 'utf8');

const jsonSchema = YAML.parse(yamlSchema);
const jsonSchemaPatch = YAML.parse(yamlSchemaPatch);

function abbrComponents() {
  const componentTypePaths = keys(jsonSchema, '$.definitions.Components.properties[*]');
  // console.log(componentTypeNames);
  componentTypePaths.forEach(componentTypePath => {
    console.log(componentTypePath);
    const componentTypeRef = jsonPath.query(
      jsonSchema,
      jsonPathComponentsToJsonPath(componentTypePath) + '.patternProperties..oneOf[1]["$ref"]'
    )[0];
    console.log(componentTypeRef);
    jsonPath.apply(jsonSchema, jsonPathComponentsToJsonPath(componentTypePath), () => {
      return {
        componentDef: {
          $ref: componentTypeRef,
        },
      };
    });
  });
}

function abbrOneOfReferences() {
  // console.log(jsonPath.query(jsonSchema, '$..oneOf..[?(@["$ref"]=="#/definitions/Reference")]'));
  // console.log(jsonPath.query(jsonSchema, '$..oneOf[*][?(@ === "#/definitions/Reference")]'));
  // console.log(jsonPath.nodes(jsonSchema, '$..oneOf[?(@["$ref"] === "#/definitions/Reference")]'));
  const referenceContainers = parents(jsonSchema, '$..oneOf[?(@["$ref"] === "#/definitions/Reference")]');
  console.log(referenceContainers);
  referenceContainers.forEach(referenceContainer => {
    const refIndex = referenceContainer[referenceContainer.length - 1];
    let defIndex: number = 0;
    if (refIndex === 0) {
      defIndex = 1;
    } else if (refIndex === 1) {
      defIndex = 0;
    }
    const defPath = jsonPath.stringify(referenceContainer.slice(0, referenceContainer.length - 1).concat(defIndex));
    console.log(defPath);
    /*

    const defRef = jsonPath.query(jsonSchema, defPath);
    if (defRef.length > 0) {
      // console.log(defRef[0].$ref);
      jsonPath.apply(
        jsonSchema,
        jsonPathComponentsToJsonPath(referenceContainer.slice(0, referenceContainer.length - 2)),
        () => {
          return {
            defOrRef: {
              $ref: defRef[0].$ref,
              // $data: '0/$ref',
            },
          };
        }
      );
    }
    logJsonToString(jsonSchema);
*/
  });
}

// abbrComponents();
// abbrOneOfReferences();

const jsonSchemaStr = JSON.stringify(jsonSchema, null, 2);
/*
const jsonSchemaPatchStr = JSON.stringify(jsonSchemaPatch, null, 2);
console.log(jsonSchemaPatchStr);
*/
console.log(jsonSchemaStr);
// fs.writeFileSync('lib/schema-short/schema.json', jsonSchemaStr);

function parents(obj: any, pathExpression: string, levels: number = 1) {
  const allPathComponents = jsonPath.paths(obj, pathExpression);
  return allPathComponents.slice(0, allPathComponents.length - levels);
}

// Utility functions
function logJsonToString(json: any) {
  console.log(JSON.stringify(json, null, 2));
}

function keys(obj: any, pathExpression: string) {
  return jsonPath.paths(obj, pathExpression);
  /*
  return allPathComponents.map(pathComponents => {
    return pathComponents.join('.');
  });
*/
}

function jsonPathComponentsToJsonPath(pathComponents: jsonPath.PathComponent[]) {
  // return pathComponents.join('.');
  return jsonPath.stringify(pathComponents);
}

function jsonPathComponentsToJsonRef(pathComponents: jsonPath.PathComponent[]) {
  // pathComponents[0].
  return pathComponents.join('/');
}
