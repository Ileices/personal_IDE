// Barrel export for analysis/clustering
export { clusterModules, type ModuleInfo, type Cluster, type ClusterResult } from './moduleClustering.js';
export { extractDefinitions, type DefinitionInfo, type ExtractionResult, type IntegrationStrategy } from './definitionExtractor.js';
export { wrapWithErrorHandling, findUnguardedFunctions, type ErrorHandlerConfig } from './errorHandlerWrapper.js';
export { testInSandbox, type SandboxConfig, type SandboxResult } from './sandboxTester.js';
