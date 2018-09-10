const mainApiJson = 'root.json';

export { mainApiJson as MainApiJson };

export interface ValidationResult<R> {
  isValid: boolean;
  errors?: R[];
}

export interface ApiValidationResult extends ValidationResult<string> {}

export interface OpenApi3Validator {
  validateApi(apiToValidate: object): Promise<ApiValidationResult>;
}
