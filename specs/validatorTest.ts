import 'mocha';
import { expect } from 'chai';
import { prettyPrint } from '../lib/utils';
import { OpenApi3Validator, ApiValidationResult, MainApiJson } from '../lib/interfaces';
import { OpenApi3ValidatorImpl } from '../lib/validator';
import { Operation, applyPatch, deepClone } from 'fast-json-patch';

import * as glob from 'glob';
import * as path from 'path';
import * as http from 'http';

import rootJson = require('./api/root.json');

import * as express from 'express';

// Test File Structure
/*
const baseSpec = {
  "schemaFile": "./api.json",
  "test": {
    "description": "minimum possible api is valid",
    "result": { "isValid": true }
  }
  "patches": [
    {
      "operations": [{ "op": "remove", "path": "/openapi" }],
      "test": {
        "description": "api with missing openapi property is invalid",
        "result": {"isValid": false}
      },
      "patches": []
    },
    {
      "operations": [],
      "test": {}
    }
  ]
};
*/

type Testable = {
  test?: {
    description: string;
    result: ApiValidationResult;
  };
};
type Recursible = {
  patches?: Patch[];
};
type TestableAndRecursible = Testable & Recursible;
type Spec = { apiFile: string } & TestableAndRecursible;
type Patch = { operations: Operation[] } & TestableAndRecursible;

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

function includeTest(testName: string): boolean {
  // return testName === 'refs';
  return true;
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

function testAndRecurseApi(apiFile: string, apiToTest: any, res: TestableAndRecursible) {
  const test = res.test;
  if (test !== undefined) {
    it(test.description, async () => {
      let validationResult: ApiValidationResult;
      if (apiFile === MainApiJson) {
        const sut: OpenApi3Validator = new OpenApi3ValidatorImpl(translatePath);
        validationResult = await sut.validateApi(apiToTest);
      } else {
        const sut: OpenApi3Validator = new OpenApi3ValidatorImpl(translatePath, (location: string, obj: any) => {
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
  recurseApi(apiFile, apiToTest, res.patches);
}

function recurseApi(apiFile: string, apiToPatch: any, patches?: Patch[]) {
  if (patches !== undefined) {
    patches.forEach(patch => {
      const patchedApi = applyPatch(deepClone(apiToPatch), deepClone(patch.operations)).newDocument;
      testAndRecurseApi(apiFile, patchedApi, patch);
    });
  }
}

// Change process directory (for json-refs to resolve references correctly)
process.chdir('specs/api');

glob.sync('./fixtures/*.json', { cwd: __dirname }).forEach(fixture => {
  const testName = path.basename(fixture, '.json').replace(/-/g, ' ');
  if (includeTest(testName)) {
    describe(testName, () => {
      before(startServer);
      after(stopServer);
      const spec: Spec = require(fixture);
      const apiToTest = require(`./api/${spec.apiFile}`);
      testAndRecurseApi(spec.apiFile, apiToTest, spec);
    });
  }
});
