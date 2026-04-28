// ============================================
// Local Model Catalog
// Browse, filter, and download Ollama models
// Includes uncensored, diffusion, vision, coding models
// ============================================
import React, { useState, useMemo, useEffect } from 'react';
import {
  Download, Search, Filter, RefreshCw, Check, X,
  Zap, Brain, Code2, Eye, MessageSquare, Cpu, Shield,
  ShieldOff, Image, AlertTriangle, Loader2, Info,
  ChevronDown, ChevronRight, Star, ExternalLink,
} from 'lucide-react';
import { API_BASE } from '../config';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface OllamaModelEntry {
  name: string;          // e.g. "llama3.2:latest"
  displayName: string;
  description: string;
  category: ModelCategory;
  tags: string[];
  sizeGB: number;        // approximate download size
  paramBillions: number; // model parameter count in billions
  contextK: number;      // context window in thousands
  isFree: boolean;       // always true for Ollama
  isUncensored: boolean;
  isDiffusion: boolean;
  supportsVision: boolean;
  supportsCode: boolean;
  quality: 'small' | 'medium' | 'large' | 'giant';
  popularity: number;    // 1–10 score for sorting
}

type ModelCategory =
  | 'general'
  | 'coding'
  | 'reasoning'
  | 'vision'
  | 'uncensored'
  | 'diffusion'
  | 'embedding'
  | 'specialized';

interface InstalledModel {
  name: string;
  size: number;
}

// ─── Full Catalog of Available Ollama Models ─────────────────────────────────

const OLLAMA_CATALOG: OllamaModelEntry[] = [
  // ── General Purpose ──────────────────────────────────────────────────────
  { name: 'llama3.2:latest', displayName: 'Llama 3.2 (3B)', description: 'Meta Llama 3.2 — fast general model, great for everyday tasks.', category: 'general', tags: ['meta', 'fast', 'small'], sizeGB: 2.0, paramBillions: 3, contextK: 128, isFree: true, isUncensored: false, isDiffusion: false, supportsVision: false, supportsCode: true, quality: 'small', popularity: 9 },
  { name: 'llama3.2:3b', displayName: 'Llama 3.2 3B', description: 'Meta Llama 3.2 3B. Best in class for its size.', category: 'general', tags: ['meta', 'efficient'], sizeGB: 2.0, paramBillions: 3, contextK: 128, isFree: true, isUncensored: false, isDiffusion: false, supportsVision: false, supportsCode: true, quality: 'small', popularity: 8 },
  { name: 'llama3.1:latest', displayName: 'Llama 3.1 (8B)', description: 'Meta Llama 3.1 8B. Strong instruction following, 128K context.', category: 'general', tags: ['meta', 'long-context'], sizeGB: 4.7, paramBillions: 8, contextK: 128, isFree: true, isUncensored: false, isDiffusion: false, supportsVision: false, supportsCode: true, quality: 'medium', popularity: 9 },
  { name: 'llama3.1:70b', displayName: 'Llama 3.1 70B', description: 'Meta Llama 3.1 70B — near GPT-4 quality locally.', category: 'general', tags: ['meta', 'large', 'high-quality'], sizeGB: 40.0, paramBillions: 70, contextK: 128, isFree: true, isUncensored: false, isDiffusion: false, supportsVision: false, supportsCode: true, quality: 'large', popularity: 9 },
  { name: 'mistral:latest', displayName: 'Mistral 7B', description: 'Mistral 7B v0.3 — fast, balanced, multilingual. 32K context.', category: 'general', tags: ['mistral', 'multilingual'], sizeGB: 4.1, paramBillions: 7, contextK: 32, isFree: true, isUncensored: false, isDiffusion: false, supportsVision: false, supportsCode: true, quality: 'medium', popularity: 8 },
  { name: 'mixtral:latest', displayName: 'Mixtral 8x7B', description: 'Mistral Mixtral 8x7B MoE — 47B params, 32K context. Strong.', category: 'general', tags: ['mistral', 'MoE', 'large'], sizeGB: 26.0, paramBillions: 47, contextK: 32, isFree: true, isUncensored: false, isDiffusion: false, supportsVision: false, supportsCode: true, quality: 'large', popularity: 8 },
  { name: 'gemma2:latest', displayName: 'Gemma 2 (9B)', description: 'Google Gemma 2 9B. Strong for its size, excellent reasoning.', category: 'general', tags: ['google', 'efficient'], sizeGB: 5.4, paramBillions: 9, contextK: 8, isFree: true, isUncensored: false, isDiffusion: false, supportsVision: false, supportsCode: true, quality: 'medium', popularity: 8 },
  { name: 'gemma2:27b', displayName: 'Gemma 2 27B', description: 'Google Gemma 2 27B. Near GPT-4 Turbo quality locally.', category: 'general', tags: ['google', 'large'], sizeGB: 16.0, paramBillions: 27, contextK: 8, isFree: true, isUncensored: false, isDiffusion: false, supportsVision: false, supportsCode: true, quality: 'large', popularity: 8 },
  { name: 'phi4:latest', displayName: 'Phi-4 (14B)', description: 'Microsoft Phi-4 14B. Punches above its weight.', category: 'general', tags: ['microsoft', 'efficient', 'quality'], sizeGB: 8.9, paramBillions: 14, contextK: 16, isFree: true, isUncensored: false, isDiffusion: false, supportsVision: false, supportsCode: true, quality: 'medium', popularity: 9 },
  { name: 'phi3.5:latest', displayName: 'Phi-3.5 Mini', description: 'Microsoft Phi-3.5 Mini 3.8B. 128K context, great code.', category: 'general', tags: ['microsoft', 'tiny', 'long-context'], sizeGB: 2.2, paramBillions: 3.8, contextK: 128, isFree: true, isUncensored: false, isDiffusion: false, supportsVision: false, supportsCode: true, quality: 'small', popularity: 7 },
  { name: 'qwen2.5:latest', displayName: 'Qwen2.5 (7B)', description: 'Alibaba Qwen2.5 7B. Strong multilingual, 128K context.', category: 'general', tags: ['alibaba', 'multilingual', 'chinese'], sizeGB: 4.7, paramBillions: 7, contextK: 128, isFree: true, isUncensored: false, isDiffusion: false, supportsVision: false, supportsCode: true, quality: 'medium', popularity: 8 },
  { name: 'qwen2.5:72b', displayName: 'Qwen2.5 72B', description: 'Alibaba Qwen2.5 72B. Best Chinese open model, 128K context.', category: 'general', tags: ['alibaba', 'large', 'multilingual'], sizeGB: 46.0, paramBillions: 72, contextK: 128, isFree: true, isUncensored: false, isDiffusion: false, supportsVision: false, supportsCode: true, quality: 'giant', popularity: 9 },
  { name: 'openchat:latest', displayName: 'OpenChat 3.5', description: 'OpenChat 3.5 7B. Strong conversational model, C-RLFT trained.', category: 'general', tags: ['chat', 'conversational'], sizeGB: 4.1, paramBillions: 7, contextK: 8, isFree: true, isUncensored: false, isDiffusion: false, supportsVision: false, supportsCode: true, quality: 'medium', popularity: 6 },
  { name: 'neural-chat:latest', displayName: 'Neural Chat 7B', description: 'Intel Neural Chat 7B. Optimized for consumer hardware.', category: 'general', tags: ['intel', 'optimized'], sizeGB: 4.1, paramBillions: 7, contextK: 32, isFree: true, isUncensored: false, isDiffusion: false, supportsVision: false, supportsCode: false, quality: 'medium', popularity: 5 },

  // ── Coding ──────────────────────────────────────────────────────────────
  { name: 'qwen2.5-coder:latest', displayName: 'Qwen2.5 Coder (7B)', description: 'Alibaba Qwen2.5 Coder 7B. Best-in-class local coding model.', category: 'coding', tags: ['alibaba', 'coding', 'recommended'], sizeGB: 4.7, paramBillions: 7, contextK: 128, isFree: true, isUncensored: false, isDiffusion: false, supportsVision: false, supportsCode: true, quality: 'medium', popularity: 10 },
  { name: 'qwen2.5-coder:32b', displayName: 'Qwen2.5 Coder 32B', description: 'Alibaba Qwen2.5 Coder 32B. Frontier local coding capability.', category: 'coding', tags: ['alibaba', 'coding', 'large'], sizeGB: 19.0, paramBillions: 32, contextK: 128, isFree: true, isUncensored: false, isDiffusion: false, supportsVision: false, supportsCode: true, quality: 'large', popularity: 10 },
  { name: 'codellama:latest', displayName: 'Code Llama (7B)', description: 'Meta Code Llama 7B. Purpose-built for code generation.', category: 'coding', tags: ['meta', 'coding', 'classic'], sizeGB: 3.8, paramBillions: 7, contextK: 16, isFree: true, isUncensored: false, isDiffusion: false, supportsVision: false, supportsCode: true, quality: 'medium', popularity: 7 },
  { name: 'codellama:34b', displayName: 'Code Llama 34B', description: 'Meta Code Llama 34B. Strong Python, C++, JavaScript support.', category: 'coding', tags: ['meta', 'coding', 'large'], sizeGB: 19.0, paramBillions: 34, contextK: 16, isFree: true, isUncensored: false, isDiffusion: false, supportsVision: false, supportsCode: true, quality: 'large', popularity: 7 },
  { name: 'starcoder2:latest', displayName: 'StarCoder 2 (7B)', description: 'BigCode StarCoder 2 7B. 600+ programming languages.', category: 'coding', tags: ['bigcode', 'multilang'], sizeGB: 4.0, paramBillions: 7, contextK: 16, isFree: true, isUncensored: false, isDiffusion: false, supportsVision: false, supportsCode: true, quality: 'medium', popularity: 7 },
  { name: 'wizardcoder:latest', displayName: 'WizardCoder', description: 'WizardLM WizardCoder — fine-tuned for code with Evol-Instruct.', category: 'coding', tags: ['wizardlm', 'coding'], sizeGB: 3.8, paramBillions: 7, contextK: 16, isFree: true, isUncensored: false, isDiffusion: false, supportsVision: false, supportsCode: true, quality: 'medium', popularity: 6 },
  { name: 'codegemma:latest', displayName: 'CodeGemma (7B)', description: 'Google CodeGemma 7B. Fill-in-middle for code completion.', category: 'coding', tags: ['google', 'coding', 'FIM'], sizeGB: 5.0, paramBillions: 7, contextK: 8, isFree: true, isUncensored: false, isDiffusion: false, supportsVision: false, supportsCode: true, quality: 'medium', popularity: 7 },
  { name: 'deepseek-coder-v2:latest', displayName: 'DeepSeek Coder V2', description: 'DeepSeek Coder V2 16B MoE. Strong coding, 128K context.', category: 'coding', tags: ['deepseek', 'coding', 'MoE'], sizeGB: 8.9, paramBillions: 16, contextK: 128, isFree: true, isUncensored: false, isDiffusion: false, supportsVision: false, supportsCode: true, quality: 'medium', popularity: 8 },

  // ── Reasoning ────────────────────────────────────────────────────────────
  { name: 'deepseek-r1:latest', displayName: 'DeepSeek R1 (7B)', description: 'DeepSeek R1 7B reasoning distillate. Chain-of-thought locally.', category: 'reasoning', tags: ['deepseek', 'reasoning', 'small'], sizeGB: 4.7, paramBillions: 7, contextK: 64, isFree: true, isUncensored: false, isDiffusion: false, supportsVision: false, supportsCode: true, quality: 'medium', popularity: 9 },
  { name: 'deepseek-r1:14b', displayName: 'DeepSeek R1 14B', description: 'DeepSeek R1 14B Qwen distillate. Strong reasoning capability.', category: 'reasoning', tags: ['deepseek', 'reasoning', 'medium'], sizeGB: 9.0, paramBillions: 14, contextK: 64, isFree: true, isUncensored: false, isDiffusion: false, supportsVision: false, supportsCode: true, quality: 'medium', popularity: 9 },
  { name: 'deepseek-r1:32b', displayName: 'DeepSeek R1 32B', description: 'DeepSeek R1 32B Qwen distillate. Near o1-mini quality locally.', category: 'reasoning', tags: ['deepseek', 'reasoning', 'large'], sizeGB: 19.0, paramBillions: 32, contextK: 64, isFree: true, isUncensored: false, isDiffusion: false, supportsVision: false, supportsCode: true, quality: 'large', popularity: 9 },
  { name: 'deepseek-r1:70b', displayName: 'DeepSeek R1 70B', description: 'DeepSeek R1 70B Llama distillate. Frontier reasoning locally.', category: 'reasoning', tags: ['deepseek', 'reasoning', 'giant'], sizeGB: 43.0, paramBillions: 70, contextK: 128, isFree: true, isUncensored: false, isDiffusion: false, supportsVision: false, supportsCode: true, quality: 'giant', popularity: 9 },
  { name: 'qwq:latest', displayName: 'QwQ 32B', description: 'Alibaba QwQ 32B reasoning model. Deep math and logic.', category: 'reasoning', tags: ['alibaba', 'reasoning', 'math'], sizeGB: 20.0, paramBillions: 32, contextK: 32, isFree: true, isUncensored: false, isDiffusion: false, supportsVision: false, supportsCode: true, quality: 'large', popularity: 8 },

  // ── Vision / Multimodal ──────────────────────────────────────────────────
  { name: 'llava:latest', displayName: 'LLaVA 1.6 (7B)', description: 'LLaVA multimodal — understand images + text. 7B.', category: 'vision', tags: ['multimodal', 'vision'], sizeGB: 4.7, paramBillions: 7, contextK: 4, isFree: true, isUncensored: false, isDiffusion: false, supportsVision: true, supportsCode: false, quality: 'medium', popularity: 7 },
  { name: 'llava:13b', displayName: 'LLaVA 1.6 (13B)', description: 'LLaVA 13B — stronger visual understanding.', category: 'vision', tags: ['multimodal', 'vision', 'medium'], sizeGB: 8.0, paramBillions: 13, contextK: 4, isFree: true, isUncensored: false, isDiffusion: false, supportsVision: true, supportsCode: false, quality: 'medium', popularity: 7 },
  { name: 'llava:34b', displayName: 'LLaVA 1.6 (34B)', description: 'LLaVA 34B — best local vision model.', category: 'vision', tags: ['multimodal', 'vision', 'large'], sizeGB: 20.0, paramBillions: 34, contextK: 4, isFree: true, isUncensored: false, isDiffusion: false, supportsVision: true, supportsCode: false, quality: 'large', popularity: 7 },
  { name: 'moondream:latest', displayName: 'Moondream 2 (1.8B)', description: 'Tiny but capable vision model. Analyze images fast.', category: 'vision', tags: ['vision', 'tiny', 'fast'], sizeGB: 1.7, paramBillions: 1.8, contextK: 2, isFree: true, isUncensored: false, isDiffusion: false, supportsVision: true, supportsCode: false, quality: 'small', popularity: 6 },
  { name: 'llama3.2-vision:latest', displayName: 'Llama 3.2 Vision (11B)', description: 'Meta Llama 3.2 11B with vision support. 128K context.', category: 'vision', tags: ['meta', 'vision', 'multimodal'], sizeGB: 7.9, paramBillions: 11, contextK: 128, isFree: true, isUncensored: false, isDiffusion: false, supportsVision: true, supportsCode: true, quality: 'medium', popularity: 8 },
  { name: 'bakllava:latest', displayName: 'BakLLaVA (7B)', description: 'BakLLaVA — Mistral + LLaVA. Fast multimodal.', category: 'vision', tags: ['vision', 'mistral', 'fast'], sizeGB: 4.8, paramBillions: 7, contextK: 4, isFree: true, isUncensored: false, isDiffusion: false, supportsVision: true, supportsCode: false, quality: 'medium', popularity: 5 },

  // ── Uncensored Models ────────────────────────────────────────────────────
  { name: 'dolphin-mixtral:latest', displayName: 'Dolphin Mixtral 8x7B', description: 'Uncensored Mixtral. No safety filters. Researcher/developer use.', category: 'uncensored', tags: ['uncensored', 'MoE', 'creative'], sizeGB: 26.0, paramBillions: 47, contextK: 32, isFree: true, isUncensored: true, isDiffusion: false, supportsVision: false, supportsCode: true, quality: 'large', popularity: 7 },
  { name: 'dolphin-llama3:latest', displayName: 'Dolphin Llama 3 (8B)', description: 'Uncensored Llama 3. No restrictions. Full context.', category: 'uncensored', tags: ['uncensored', 'meta', 'creative'], sizeGB: 4.7, paramBillions: 8, contextK: 8, isFree: true, isUncensored: true, isDiffusion: false, supportsVision: false, supportsCode: true, quality: 'medium', popularity: 7 },
  { name: 'nous-hermes2:latest', displayName: 'Nous Hermes 2 (11B)', description: 'NousResearch Hermes 2 — uncensored, instruction-tuned.', category: 'uncensored', tags: ['uncensored', 'nous', 'roleplay'], sizeGB: 7.0, paramBillions: 11, contextK: 4, isFree: true, isUncensored: true, isDiffusion: false, supportsVision: false, supportsCode: true, quality: 'medium', popularity: 7 },
  { name: 'wizardlm2:latest', displayName: 'WizardLM 2 (8x22B)', description: 'WizardLM2 — uncensored, strong at complex instructions.', category: 'uncensored', tags: ['uncensored', 'MoE', 'large'], sizeGB: 80.0, paramBillions: 141, contextK: 64, isFree: true, isUncensored: true, isDiffusion: false, supportsVision: false, supportsCode: true, quality: 'giant', popularity: 6 },
  { name: 'orca-mini:latest', displayName: 'Orca Mini (3B)', description: 'Microsoft Orca Mini 3B. Good reasoning for its tiny size.', category: 'uncensored', tags: ['microsoft', 'tiny', 'reasoning'], sizeGB: 1.9, paramBillions: 3, contextK: 4, isFree: true, isUncensored: true, isDiffusion: false, supportsVision: false, supportsCode: false, quality: 'small', popularity: 5 },
  { name: 'mythomax-l2:latest', displayName: 'MythoMax L2 13B', description: 'MythoMax L2 — creative writing, roleplay, unrestricted.', category: 'uncensored', tags: ['uncensored', 'creative', 'roleplay'], sizeGB: 7.9, paramBillions: 13, contextK: 4, isFree: true, isUncensored: true, isDiffusion: false, supportsVision: false, supportsCode: false, quality: 'medium', popularity: 6 },
  { name: 'solar:latest', displayName: 'SOLAR 10.7B', description: 'Upstage SOLAR 10.7B uncensored. Strong general and coding.', category: 'uncensored', tags: ['uncensored', 'upstage'], sizeGB: 6.1, paramBillions: 10.7, contextK: 4, isFree: true, isUncensored: true, isDiffusion: false, supportsVision: false, supportsCode: true, quality: 'medium', popularity: 6 },

  // ── Diffusion / Image Generation ─────────────────────────────────────────
  { name: 'stable-diffusion:latest', displayName: 'Stable Diffusion (Ollama)', description: 'Stable Diffusion image generation via Ollama (experimental).', category: 'diffusion', tags: ['diffusion', 'image-gen', 'experimental'], sizeGB: 2.1, paramBillions: 0.9, contextK: 0, isFree: true, isUncensored: false, isDiffusion: true, supportsVision: false, supportsCode: false, quality: 'medium', popularity: 5 },

  // ── Embedding ────────────────────────────────────────────────────────────
  { name: 'nomic-embed-text:latest', displayName: 'Nomic Embed Text', description: 'Nomic embedding model. Best for semantic search and RAG.', category: 'embedding', tags: ['embedding', 'RAG', 'search'], sizeGB: 0.3, paramBillions: 0.1, contextK: 8, isFree: true, isUncensored: false, isDiffusion: false, supportsVision: false, supportsCode: false, quality: 'small', popularity: 8 },
  { name: 'mxbai-embed-large:latest', displayName: 'mxbai Embed Large', description: 'Mixed Bread embeddings — top MTEB benchmark scores.', category: 'embedding', tags: ['embedding', 'MTEB', 'RAG'], sizeGB: 0.7, paramBillions: 0.3, contextK: 8, isFree: true, isUncensored: false, isDiffusion: false, supportsVision: false, supportsCode: false, quality: 'small', popularity: 7 },

  // ── Specialized ──────────────────────────────────────────────────────────
  { name: 'medllama2:latest', displayName: 'MedLlama 2 (7B)', description: 'Fine-tuned on medical data. Clinical Q&A and research.', category: 'specialized', tags: ['medical', 'science'], sizeGB: 3.8, paramBillions: 7, contextK: 4, isFree: true, isUncensored: false, isDiffusion: false, supportsVision: false, supportsCode: false, quality: 'medium', popularity: 5 },
  { name: 'sqlcoder:latest', displayName: 'SQLCoder 7B', description: 'DefogAI SQLCoder — best local model for SQL generation.', category: 'specialized', tags: ['SQL', 'database', 'coding'], sizeGB: 3.8, paramBillions: 7, contextK: 4, isFree: true, isUncensored: false, isDiffusion: false, supportsVision: false, supportsCode: true, quality: 'medium', popularity: 6 },
  { name: 'yarn-mistral:latest', displayName: 'Yarn Mistral 128K', description: 'Mistral with 128K context via YaRN attention scaling.', category: 'specialized', tags: ['long-context', 'mistral'], sizeGB: 4.1, paramBillions: 7, contextK: 128, isFree: true, isUncensored: false, isDiffusion: false, supportsVision: false, supportsCode: true, quality: 'medium', popularity: 5 },
];

const CATEGORY_CONFIG: Record<ModelCategory, { label: string; icon: React.ComponentType<any>; color: string }> = {
  general:    { label: 'General',    icon: MessageSquare, color: 'text-blue-400 bg-blue-500/10' },
  coding:     { label: 'Coding',     icon: Code2,         color: 'text-green-400 bg-green-500/10' },
  reasoning:  { label: 'Reasoning',  icon: Brain,         color: 'text-purple-400 bg-purple-500/10' },
  vision:     { label: 'Vision',     icon: Eye,           color: 'text-pink-400 bg-pink-500/10' },
  uncensored: { label: 'Uncensored', icon: ShieldOff,     color: 'text-red-400 bg-red-500/10' },
  diffusion:  { label: 'Diffusion',  icon: Image,         color: 'text-orange-400 bg-orange-500/10' },
  embedding:  { label: 'Embedding',  icon: Cpu,           color: 'text-cyan-400 bg-cyan-500/10' },
  specialized:{ label: 'Specialized',icon: Star,          color: 'text-yellow-400 bg-yellow-500/10' },
};

const QUALITY_COLOR: Record<string, string> = {
  small:  'text-green-400',
  medium: 'text-yellow-400',
  large:  'text-orange-400',
  giant:  'text-red-400',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function LocalModelCatalog({ onClose }: { onClose?: () => void }) {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ModelCategory | 'all'>('all');
  const [filterUncensored, setFilterUncensored] = useState(false);
  const [filterVision, setFilterVision] = useState(false);
  const [filterCoding, setFilterCoding] = useState(false);
  const [filterSmall, setFilterSmall] = useState(false);
  const [installedModels, setInstalledModels] = useState<InstalledModel[]>([]);
  const [downloading, setDownloading] = useState<Set<string>>(new Set());
  const [downloadProgress, setDownloadProgress] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchInstalled();
  }, []);

  async function fetchInstalled() {
    try {
      const res = await fetch(`${API_BASE}/api/providers/ollama/models`);
      if (!res.ok) return;
      const data = await res.json();
      setInstalledModels(data.models || []);
    } catch {
      // Ollama might not be running
    }
  }

  async function downloadModel(modelName: string) {
    setDownloading(prev => new Set([...prev, modelName]));
    setDownloadProgress(prev => ({ ...prev, [modelName]: 'Starting download…' }));
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/api/providers/ollama/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelName }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to start download' }));
        throw new Error(err.error || 'Download failed');
      }

      // Stream progress
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value, { stream: true });
          const lines = text.split('\n').filter(Boolean);
          for (const line of lines) {
            try {
              const data = JSON.parse(line);
              if (data.status) {
                const progress = data.completed && data.total
                  ? `${Math.round((data.completed / data.total) * 100)}%`
                  : data.status;
                setDownloadProgress(prev => ({ ...prev, [modelName]: progress }));
              }
            } catch { /* ignore parse errors in stream */ }
          }
        }
      }

      setDownloadProgress(prev => ({ ...prev, [modelName]: 'Complete!' }));
      await fetchInstalled();
    } catch (err: any) {
      setError(`Failed to download ${modelName}: ${err.message}`);
      setDownloadProgress(prev => ({ ...prev, [modelName]: 'Error' }));
    } finally {
      setDownloading(prev => {
        const next = new Set(prev);
        next.delete(modelName);
        return next;
      });
    }
  }

  async function deleteModel(modelName: string) {
    try {
      await fetch(`${API_BASE}/api/providers/ollama/delete`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelName }),
      });
      await fetchInstalled();
    } catch (err: any) {
      setError(`Failed to delete ${modelName}: ${err.message}`);
    }
  }

  const installedSet = new Set(installedModels.map(m => m.name));

  const filtered = useMemo(() => {
    let list = OLLAMA_CATALOG;

    if (selectedCategory !== 'all') {
      list = list.filter(m => m.category === selectedCategory);
    }
    if (filterUncensored) list = list.filter(m => m.isUncensored);
    if (filterVision) list = list.filter(m => m.supportsVision);
    if (filterCoding) list = list.filter(m => m.supportsCode);
    if (filterSmall) list = list.filter(m => m.sizeGB <= 5);

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(m =>
        m.name.toLowerCase().includes(q) ||
        m.displayName.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q) ||
        m.tags.some(t => t.toLowerCase().includes(q))
      );
    }

    // Sort: installed first, then by popularity desc
    return list.sort((a, b) => {
      const aIn = installedSet.has(a.name) ? 1 : 0;
      const bIn = installedSet.has(b.name) ? 1 : 0;
      if (aIn !== bIn) return bIn - aIn;
      return b.popularity - a.popularity;
    });
  }, [search, selectedCategory, filterUncensored, filterVision, filterCoding, filterSmall, installedSet]);

  const categories: (ModelCategory | 'all')[] = ['all', 'general', 'coding', 'reasoning', 'vision', 'uncensored', 'diffusion', 'embedding', 'specialized'];

  return (
    <div className="flex flex-col h-full bg-ide-bg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-ide-border bg-ide-panel flex-shrink-0">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-ide-accent" />
          <span className="font-semibold text-ide-text text-sm">Local Model Catalog</span>
          <span className="text-[10px] text-ide-text-dim px-1.5 py-0.5 bg-ide-bg border border-ide-border rounded">Ollama</span>
          <span className="text-[10px] text-ide-text-dim">{installedModels.length} installed · {OLLAMA_CATALOG.length} available</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchInstalled} className="text-[10px] flex items-center gap-1 px-2 py-1 text-ide-text-dim hover:text-ide-text">
            <RefreshCw className="w-3 h-3" /> Refresh
          </button>
          {onClose && (
            <button onClick={onClose} className="text-ide-text-dim hover:text-ide-text">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Ollama install tip */}
      {installedModels.length === 0 && (
        <div className="mx-4 mt-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
          <div className="text-[11px] text-yellow-400">
            <div className="font-medium mb-0.5">Ollama not detected or not running</div>
            <div className="text-yellow-400/70">
              Install Ollama from{' '}
              <a href="https://ollama.com" target="_blank" rel="noopener noreferrer" className="underline">ollama.com</a>
              {' '}then run <code className="font-mono bg-yellow-500/10 px-1 rounded">ollama serve</code> to enable local model downloads.
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mx-4 mt-2 p-2 bg-red-500/10 border border-red-500/30 rounded flex items-center gap-2">
          <AlertTriangle className="w-3 h-3 text-red-400 flex-shrink-0" />
          <span className="text-[11px] text-red-400 flex-1">{error}</span>
          <button onClick={() => setError(null)}><X className="w-3 h-3 text-red-400" /></button>
        </div>
      )}

      {/* Search + Filters */}
      <div className="px-4 py-2 space-y-2 flex-shrink-0 border-b border-ide-border">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ide-text-dim" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search models by name, tag, or description…"
            className="w-full pl-8 pr-3 py-1.5 bg-ide-panel border border-ide-border rounded text-xs focus:outline-none focus:border-ide-accent"
          />
        </div>

        {/* Category tabs */}
        <div className="flex gap-1 flex-wrap">
          {categories.map(cat => {
            const config = cat === 'all' ? null : CATEGORY_CONFIG[cat];
            const Icon = config?.icon;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded transition-colors ${
                  selectedCategory === cat
                    ? 'bg-ide-accent/20 text-ide-accent border border-ide-accent/40'
                    : 'text-ide-text-dim hover:text-ide-text border border-ide-border'
                }`}
              >
                {Icon && <Icon className="w-3 h-3" />}
                {cat === 'all' ? 'All' : config?.label}
              </button>
            );
          })}
        </div>

        {/* Quick filters */}
        <div className="flex gap-2 flex-wrap">
          {[
            { key: 'uncensored', label: 'Uncensored', state: filterUncensored, setter: setFilterUncensored, icon: ShieldOff },
            { key: 'vision', label: 'Vision', state: filterVision, setter: setFilterVision, icon: Eye },
            { key: 'coding', label: 'Code', state: filterCoding, setter: setFilterCoding, icon: Code2 },
            { key: 'small', label: '≤5GB', state: filterSmall, setter: setFilterSmall, icon: Zap },
          ].map(({ key, label, state, setter, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setter(!state)}
              className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border transition-colors ${
                state
                  ? 'border-ide-accent/40 text-ide-accent bg-ide-accent/10'
                  : 'border-ide-border text-ide-text-dim hover:text-ide-text'
              }`}
            >
              <Icon className="w-3 h-3" />
              {label}
            </button>
          ))}
          <span className="ml-auto text-[10px] text-ide-text-dim self-center">{filtered.length} models</span>
        </div>
      </div>

      {/* Model Grid */}
      <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 gap-2">
        {filtered.map(model => {
          const catConfig = CATEGORY_CONFIG[model.category];
          const CatIcon = catConfig.icon;
          const isInstalled = installedSet.has(model.name);
          const isDownloading = downloading.has(model.name);
          const progress = downloadProgress[model.name];

          return (
            <div
              key={model.name}
              className={`relative p-3 rounded-lg border transition-all ${
                isInstalled
                  ? 'border-green-500/30 bg-green-500/5'
                  : 'border-ide-border bg-ide-panel hover:border-ide-accent/30'
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Category badge */}
                <div className={`mt-0.5 p-1.5 rounded ${catConfig.color.split(' ')[1]} flex-shrink-0`}>
                  <CatIcon className={`w-3.5 h-3.5 ${catConfig.color.split(' ')[0]}`} />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-ide-text">{model.displayName}</span>
                    {isInstalled && (
                      <span className="text-[9px] px-1.5 py-0.5 bg-green-500/15 text-green-400 rounded font-medium">INSTALLED</span>
                    )}
                    {model.isUncensored && (
                      <span className="text-[9px] px-1.5 py-0.5 bg-red-500/10 text-red-400 rounded">UNCENSORED</span>
                    )}
                    {model.isDiffusion && (
                      <span className="text-[9px] px-1.5 py-0.5 bg-orange-500/10 text-orange-400 rounded">DIFFUSION</span>
                    )}
                    {model.supportsVision && (
                      <span className="text-[9px] px-1.5 py-0.5 bg-pink-500/10 text-pink-400 rounded">VISION</span>
                    )}
                  </div>

                  <p className="text-[11px] text-ide-text-dim mt-0.5">{model.description}</p>

                  <div className="flex items-center gap-3 mt-1.5 text-[10px] text-ide-text-dim">
                    <span title="Model size">{model.paramBillions}B params</span>
                    <span>~{model.sizeGB} GB</span>
                    {model.contextK > 0 && <span>{model.contextK}K ctx</span>}
                    <span className={`font-medium ${QUALITY_COLOR[model.quality]}`}>{model.quality.toUpperCase()}</span>
                    <div className="flex gap-1 flex-wrap">
                      {model.tags.slice(0, 3).map(t => (
                        <span key={t} className="px-1 py-0 bg-ide-bg border border-ide-border rounded">{t}</span>
                      ))}
                    </div>
                  </div>

                  {/* Progress bar */}
                  {isDownloading && (
                    <div className="mt-2 flex items-center gap-2">
                      <Loader2 className="w-3 h-3 text-ide-accent animate-spin flex-shrink-0" />
                      <div className="flex-1 h-1.5 bg-ide-bg rounded-full overflow-hidden">
                        <div
                          className="h-full bg-ide-accent transition-all rounded-full"
                          style={{ width: progress?.endsWith('%') ? progress : '100%' }}
                        />
                      </div>
                      <span className="text-[10px] text-ide-accent">{progress || 'Downloading…'}</span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {isInstalled ? (
                    <button
                      onClick={() => deleteModel(model.name)}
                      className="text-[10px] px-2 py-1 text-red-400/70 hover:text-red-400 border border-red-400/20 hover:border-red-400/40 rounded transition-colors"
                    >
                      Remove
                    </button>
                  ) : (
                    <button
                      onClick={() => downloadModel(model.name)}
                      disabled={isDownloading}
                      className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 bg-ide-accent/15 text-ide-accent rounded hover:bg-ide-accent/25 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isDownloading ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Download className="w-3 h-3" />
                      )}
                      {isDownloading ? progress || 'Pulling…' : 'Pull'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center py-12 text-ide-text-dim">
            <Search className="w-8 h-8 mx-auto mb-3 opacity-30" />
            <div className="text-sm">No models match your filters</div>
            <button
              onClick={() => { setSearch(''); setSelectedCategory('all'); setFilterUncensored(false); setFilterVision(false); setFilterCoding(false); setFilterSmall(false); }}
              className="mt-2 text-[11px] text-ide-accent hover:underline"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-ide-border flex items-center gap-3 text-[10px] text-ide-text-dim flex-shrink-0 bg-ide-panel">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-green-400" />
          <span>{installedModels.length} installed</span>
        </div>
        <div className="flex items-center gap-1">
          <Cpu className="w-3 h-3" />
          <span>Powered by Ollama</span>
        </div>
        <a
          href="https://ollama.com/library"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 ml-auto text-ide-accent hover:underline"
        >
          <ExternalLink className="w-3 h-3" />
          Browse more at ollama.com/library
        </a>
      </div>
    </div>
  );
}
