export { detectGPUs, detectHardware, recommendModels } from './hardware.js';
export type { GpuInfo, HardwareInfo, ModelRecommendation } from './hardware.js';
export {
  findOllamaInstall, findOllamaModels, testOllamaConnection, buildActions,
} from './client.js';
export type {
  OllamaInstallResult, OllamaModelsResult, OllamaConnectionResult,
} from './client.js';
