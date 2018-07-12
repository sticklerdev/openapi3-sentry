import * as YAML from 'yamljs';
import * as fs from 'fs';

const yamlSchema = fs.readFileSync('lib/schema/schema.yaml', 'utf8');

const jsonSchema = YAML.parse(yamlSchema);

const jsonSchemaStr = JSON.stringify(jsonSchema, null, 2);
console.log(jsonSchemaStr);
// fs.writeFileSync('lib/schema-short/schema.json', jsonSchemaStr);
