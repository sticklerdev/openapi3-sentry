import 'mocha';
import { expect } from 'chai';
import { patchPreamble, patchServers, patchPathValidation, patchOneOfReferences } from '../lib/openApi3Schema';

describe('Preamble', () => {
  let schema: object;
  const sut = patchPreamble;

  beforeEach(() => {
    schema = {};
  });

  it('should have title, id, schema for root element', () => {
    sut(schema);
    // console.log(JSON.stringify(schema, null, 2));
    expect(schema).to.deep.equal({
      title: 'A JSON Schema for OpenAPI 3.0',
      id: 'http://openapis.org/v3/schema.json#',
      $schema: 'http://json-schema.org/draft-04/schema#',
    });
  });
});

describe('Servers', () => {
  let schema: object;
  const sut = patchServers;

  beforeEach(() => {
    schema = {
      properties: {
        servers: {},
      },
      definitions: {
        PathItem: {
          properties: {
            servers: {},
          },
        },
        Operation: {
          properties: {
            servers: {},
          },
        },
      },
    };
  });

  it('should have minItems for servers, PathItem and Operation elements', () => {
    sut(schema);
    // console.log(JSON.stringify(schema, null, 2));
    expect(schema).to.deep.equal({
      properties: {
        servers: {
          minItems: 1,
        },
      },
      definitions: {
        PathItem: {
          properties: {
            servers: {
              minItems: 1,
            },
          },
        },
        Operation: {
          properties: {
            servers: {
              minItems: 1,
            },
          },
        },
      },
    });
  });
});

describe('One of definitions', () => {
  let schema: object;
  const sut = patchOneOfReferences;

  beforeEach(() => {
    schema = {
      definitions: {
        Components: {
          type: 'object',
          properties: {
            schemas: {
              type: 'object',
              patternProperties: {
                '^[a-zA-Z0-9\\.\\-_]+$': {
                  oneOf: [
                    {
                      $ref: '#/definitions/Reference',
                    },
                    {
                      $ref: '#/definitions/Schema',
                    },
                  ],
                },
              },
            },
          },
        },
      },
    };
  });

  it('should have reference replaced', () => {
    sut(schema);
    console.log(JSON.stringify(schema, null, 2));
    expect(schema).to.deep.equal({
      definitions: {
        Components: {
          type: 'object',
          properties: {
            schemas: {
              type: 'object',
              patternProperties: {
                '^[a-zA-Z0-9\\.\\-_]+$': {
                  validateDefOrRef: {
                    $data: '0',
                  },
                  validationSchema: '#/definitions/Schema',
                },
              },
            },
          },
        },
      },
    });
  });
});

describe('Paths', () => {
  let schema: object;
  const sut = patchPathValidation;

  beforeEach(() => {
    schema = {
      definitions: {
        Paths: {
          patternProperties: {
            '^\\/': {
              $ref: '#/definitions/$Bogus$PathItem',
            },
          },
        },
      },
    };
  });

  it('should have Paths regex modified', () => {
    sut(schema, '^somepattern$');
    // console.log(JSON.stringify(schema, null, 2));
    expect(schema).to.deep.equal({
      definitions: {
        Paths: {
          patternProperties: {
            '^somepattern$': {
              $ref: '#/definitions/PathItem',
            },
          },
          validatePaths: {},
        },
      },
    });
  });
});
