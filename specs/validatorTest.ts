import 'mocha';
import { expect } from 'chai';
import { OpenApi3Validator, OpenApi3ValidatorImpl, ApiValidationResult } from '../lib/validator';
import { Operation, applyPatch, deepClone } from 'fast-json-patch';

import * as glob from 'glob';
import * as path from 'path';

const sut: OpenApi3Validator = new OpenApi3ValidatorImpl();

// Test File Structure
/*
const baseSpec = {
  "api": {
    "openapi": "3.0.0",
    "info": {
      "version": "1.0.0",
      "title": "Swagger Petstore"
    },
    "paths": {}
  },
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
type Spec = { api: any } & TestableAndRecursible;
type Patch = { operations: Operation[] } & TestableAndRecursible;

glob.sync('./fixtures/*.json', { cwd: __dirname }).forEach(fixture => {
  const testName = path.basename(fixture, '.json').replace(/-/g, ' ');
  if (includeTest(testName)) {
    describe(testName, () => {
      const spec: Spec = require(fixture);
      testAndRecurseApi(spec.api, spec);
    });
  }
});

function includeTest(testName: string) {
  // return testName === 'paths';
  return true;
}

function testAndRecurseApi(apiToTest: any, res: TestableAndRecursible) {
  const test = res.test;
  if (test !== undefined) {
    it(test.description, () => {
      const validationResult = sut.validateApi(apiToTest);
      // console.log(JSON.stringify(validationResult, null, 2));
      expect(validationResult).to.deep.equal(test.result);
    });
  }
  recurseApi(apiToTest, res.patches);
}

function recurseApi(apiToPatch: any, patches?: Patch[]) {
  if (patches !== undefined) {
    patches.forEach(patch => {
      const patchedApi = applyPatch(deepClone(apiToPatch), deepClone(patch.operations)).newDocument;
      // console.log(patchedApi);
      testAndRecurseApi(patchedApi, patch);
    });
  }
}
