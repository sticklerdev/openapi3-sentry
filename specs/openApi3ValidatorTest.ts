import * as glob from 'glob';
import * as path from 'path';
import 'mocha';
import { expect } from 'chai';
import * as express from 'express';
import * as http from 'http';
import * as yargs from 'yargs';

import { IOpenApi3Validator, IApiValidationResult, MainApiJson } from '../lib/interfaces';
import { OpenApi3Validator } from '../lib/openApi3Validator';
import { Operation, applyPatch, deepClone } from 'fast-json-patch';
import rootJson = require('./api/root.json');
import { prettyPrint } from '../lib/utils';

// Test File Structure
/*
const baseSpec = {
  "schemaFile": "./api.json",
  "tests": [{
    "description": "minimum possible api is valid",
    "result": { "isValid": true }
  }],
  "skip": true,
  "patches": [
    {
      "operations": [{ "op": "remove", "path": "/openapi" }],
      "tests": [
        {
          "description": "api with missing openapi property is invalid",
          "result": {"isValid": false},
        }
      ]
      "skip": false,
      "patches": [],
    },
    {
      "operations": [],
      "tests": [{}],
    }
  ],
};
*/

interface Skippable {
  skip?: boolean;
}
interface Test extends Skippable {
  description: string;
  result: IApiValidationResult;
}
interface Testable extends Skippable {
  tests?: Test | Test[];
}

interface Recursible {
  patches: Patch[];
}

type Spec = { apiFile: string } & Testable & Recursible;
type Patch = { operations: Operation[] } & Testable & Recursible;

let testServer: http.Server | undefined;

async function startServer() {
  const app: express.Application = express();
  const port: number = 55555;

  const staticPath = path.join(__dirname, 'api');
  app.use('/api', express.static(staticPath));

  testServer = await app.listen(port, () => {});
}

function stopServer() {
  if (testServer !== undefined) {
    testServer.close();
  }
  testServer = undefined;
}

function normalizePath(location: string) {
  const parsedPath = path.parse(path.normalize(location));
  const pathRoot = parsedPath.root;
  return path.join(pathRoot.toLowerCase(), parsedPath.dir.substr(pathRoot.length - 1), parsedPath.base);
}

function translatePath(rootLocation: string, pathToTranslate: string): string {
  const relPath = path.posix.relative(path.dirname(rootLocation), pathToTranslate);
  return relPath;
}

function skipTest(apiSpec: Skippable, skip: boolean) {
  return apiSpec.skip !== undefined ? apiSpec.skip : skip;
}

function testApi(apiFile: string, apiToTest: any, test: Test, skip: boolean) {
  const testFunction = skip === false ? it : it.skip;
  testFunction(test.description, async () => {
    let validationResult: IApiValidationResult;
    if (apiFile === MainApiJson) {
      const sut: IOpenApi3Validator = new OpenApi3Validator(translatePath);
      validationResult = await sut.validateApi(apiToTest);
    } else {
      const sut: IOpenApi3Validator = new OpenApi3Validator(translatePath, (location: string, obj: any) => {
        const normalizedRefLocation = normalizePath(location);
        const normalizedApiLocation = normalizePath(path.join(process.cwd(), apiFile));
        if (normalizedRefLocation === normalizedApiLocation) {
          return apiToTest;
        }
        return obj;
      });
      validationResult = await sut.validateApi(rootJson);
    }
    expect(validationResult).to.deep.equal(test.result);
  });
}

function testAndRecurseApi(apiFile: string, api: any, apiSpec: Testable & Recursible, skip: boolean) {
  const shouldSkipAll = skipTest(apiSpec, skip);
  if (apiSpec.tests !== undefined) {
    let allTests: Test[];
    if (Array.isArray(apiSpec.tests)) {
      allTests = apiSpec.tests;
    } else {
      allTests = [apiSpec.tests];
    }
    allTests.forEach(test => {
      testApi(apiFile, api, test, skipTest(test, shouldSkipAll));
    });
  }

  if (apiSpec.patches !== undefined) {
    apiSpec.patches.forEach(patch => {
      const patchedApi = applyPatch(deepClone(api), deepClone(patch.operations)).newDocument;
      testAndRecurseApi(apiFile, patchedApi, patch, skipTest(patch, shouldSkipAll));
    });
  }
}

// Change process directory (for json-refs to resolve references correctly)
process.chdir('specs/api');

function getAllSpecs(testsArgs: string | undefined) {
  const cmdLineTests = testsArgs === undefined ? [] : testsArgs.split(',');
  return glob.sync('./fixtures/*.json', { cwd: __dirname }).map(fixture => {
    const testName = path.basename(fixture, '.json').replace(/-/g, ' ');
    return {
      fixture,
      testName,
      include: cmdLineTests.length === 0 || cmdLineTests.indexOf(testName) !== -1 ? true : false,
    };
  });
}

getAllSpecs(yargs.argv['tests']).forEach(spec => {
  const describeFunction = spec.include === true ? describe : describe.skip;
  describeFunction(spec.testName, () => {
    before(startServer);
    after(stopServer);
    const apiSpec: Spec = require(spec.fixture);
    const api = require(`./api/${apiSpec.apiFile}`);
    testAndRecurseApi(apiSpec.apiFile, api, apiSpec, skipTest(apiSpec, false));
  });
});
