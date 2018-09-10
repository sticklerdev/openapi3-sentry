# openapi3-sentry

A validator for OpenAPI documents (Version 3.\*) based on unofficial Open API JSON schema (See: https://github.com/OAI/OpenAPI-Specification/pull/1270)

## Features

This is still a work in progress and the API is not stable yet, but openspi3-sentry already handles a few important classes of schema validation errors:

### Modular API documents

API documents can be split into multiple files. Each part can be referenced using JSON references (relative, absolute & remote). See /specs/api/root.json file for a sample of API document. Invalid references (e.g. a reference to http://:8080) & missing references (e.g. to a non-existant file or an element within a file) are reported with the file name and element where the reference is defined.

### Path errors

#### Valid paths

- / (root)
- /abc (path with no parameter)
- /abc/ (path followed by trailing slash)
- /abc/{def} (path with a parameter)
- abc/d{ef} (path parameter with a prefix)

#### Invalid paths

- /abc/{def (missing curly)
- /abc/{{def}} (nested curlies)
- /{abc}/{abc} (duplicate path parameters)
- /{abc} & /{def} (semantically duplicate paths)

### Reference type validation

Open API allows for "reusable" parts of the API to be defined under _components_ section of the document and other parts to reference these components using _$ref_'s. openapi3-sentry validates that these _ref_'s are of the expected type and generates error if they are not. For example, openapi3-sentry will generate an error if a _$ref_ in a _path_ definition points to a _Schema_ when it should be pointing to _RequestBody_.

### Unofficial schema used

- Seeded openapi3-sentry with commit id 49e784d7b7800da8732103aa3ac56bc7ccde5cfb (07/24/2017)
