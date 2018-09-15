const mainApiJson = 'root.json';

export { mainApiJson as MainApiJson };

export interface IValidationResult<R> {
  isValid: boolean;
  errors?: R[];
}

export interface IApiValidationResult extends IValidationResult<string> {}

export interface IOpenApi3Validator {
  validateApi(apiToValidate: object): Promise<IApiValidationResult>;
}
