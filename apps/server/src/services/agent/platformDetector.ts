// ============================================
// Platform Detector — Detects host OS, arch,
// and available toolchains so the LLM builds
// cross-platform software that prioritizes
// the user's current OS
// ============================================
import os from 'os';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export interface PlatformInfo {
  /** The OS the IDE server is running on */
  hostOS: 'windows' | 'macos' | 'linux' | 'android' | 'ios' | 'unknown';
  /** Detailed platform string */
  platform: string;
  /** CPU architecture */
  arch: string;
  /** OS version / release */
  release: string;
  /** Available package managers */
  packageManagers: string[];
  /** Available runtimes */
  runtimes: Record<string, string>;
  /** Available build tools */
  buildTools: string[];
  /** Shell type */
  shell: string;
  /** Path separator */
  pathSeparator: string;
  /** Recommended cross-platform strategies per project type */
  crossPlatformStrategy: string;
}

/** Check if a CLI command exists and return its version */
function tryCommand(cmd: string): string | null {
  try {
    const result = execSync(cmd, {
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf-8',
    }).trim();
    return result || null;
  } catch {
    return null;
  }
}

/** Detect the full platform environment */
export function detectPlatform(): PlatformInfo {
  const rawPlatform = os.platform();
  const arch = os.arch();
  const release = os.release();

  // Map to our OS enum
  let hostOS: PlatformInfo['hostOS'] = 'unknown';
  if (rawPlatform === 'win32') hostOS = 'windows';
  else if (rawPlatform === 'darwin') hostOS = 'macos';
  else if (rawPlatform === 'linux') {
    // Check if running on Android (Termux) or ChromeOS
    if (process.env.ANDROID_ROOT || process.env.PREFIX?.includes('com.termux')) {
      hostOS = 'android';
    } else {
      hostOS = 'linux';
    }
  }

  // Detect shell
  let shell = process.env.SHELL || process.env.COMSPEC || 'unknown';
  if (hostOS === 'windows') {
    shell = process.env.PSModulePath ? 'powershell' : (process.env.COMSPEC || 'cmd.exe');
  }

  // Detect package managers
  const packageManagers: string[] = [];
  const pmChecks: Record<string, string> = {
    npm: 'npm --version',
    pnpm: 'pnpm --version',
    yarn: 'yarn --version',
    bun: 'bun --version',
    pip: 'pip --version',
    uv: 'uv --version',
    cargo: 'cargo --version',
    go: 'go version',
    dotnet: 'dotnet --version',
    brew: 'brew --version',
    choco: 'choco --version',
    winget: 'winget --version',
    apt: 'apt --version',
    pacman: 'pacman --version',
  };
  for (const [name, cmd] of Object.entries(pmChecks)) {
    if (tryCommand(cmd)) packageManagers.push(name);
  }

  // Detect runtimes with versions
  const runtimes: Record<string, string> = {};
  const runtimeChecks: Record<string, string> = {
    node: 'node --version',
    python: hostOS === 'windows' ? 'python --version' : 'python3 --version',
    rust: 'rustc --version',
    go: 'go version',
    java: 'java --version',
    dotnet: 'dotnet --version',
    ruby: 'ruby --version',
    swift: 'swift --version',
    dart: 'dart --version',
    flutter: 'flutter --version',
    gcc: 'gcc --version',
    clang: 'clang --version',
  };
  for (const [name, cmd] of Object.entries(runtimeChecks)) {
    const ver = tryCommand(cmd);
    if (ver) {
      // Extract just the version number from the first line
      const firstLine = ver.split('\n')[0];
      const match = firstLine.match(/(\d+\.\d+[\.\d]*)/);
      runtimes[name] = match ? match[1] : firstLine.slice(0, 60);
    }
  }

  // Detect build tools
  const buildTools: string[] = [];
  const toolChecks: Record<string, string> = {
    make: 'make --version',
    cmake: 'cmake --version',
    ninja: 'ninja --version',
    msbuild: 'msbuild -version',
    gradle: 'gradle --version',
    maven: 'mvn --version',
    docker: 'docker --version',
    'docker-compose': 'docker compose version',
    git: 'git --version',
    vite: 'npx vite --version',
    webpack: 'npx webpack --version',
    electron: 'npx electron --version',
    tauri: 'cargo tauri --version',
  };
  for (const [name, cmd] of Object.entries(toolChecks)) {
    if (tryCommand(cmd)) buildTools.push(name);
  }

  // Determine cross-platform strategy based on environment
  const crossPlatformStrategy = buildCrossPlatformStrategy(hostOS, runtimes, buildTools);

  return {
    hostOS,
    platform: rawPlatform,
    arch,
    release,
    packageManagers,
    runtimes,
    buildTools,
    shell,
    pathSeparator: path.sep,
    crossPlatformStrategy,
  };
}

/** Build cross-platform strategy recommendations */
function buildCrossPlatformStrategy(
  hostOS: PlatformInfo['hostOS'],
  runtimes: Record<string, string>,
  buildTools: string[],
): string {
  const strategies: string[] = [];

  // Desktop apps
  if (runtimes.rust || runtimes.node) {
    strategies.push(
      'DESKTOP APPS: Use Tauri (Rust + WebView) for lightweight cross-platform desktop apps. ' +
      'Alternatively use Electron (heavier but broader ecosystem). ' +
      'Both produce .exe (Windows), .app/.dmg (macOS), .deb/.AppImage (Linux).'
    );
  }

  // Web apps
  strategies.push(
    'WEB APPS: Build with TypeScript + React/Vite (or Svelte/Vue). ' +
    'Web apps are inherently cross-platform via the browser. ' +
    'Use PWA (Progressive Web App) manifest for installable experience on all OSes.'
  );

  // Mobile
  if (runtimes.dart || runtimes.flutter) {
    strategies.push(
      'MOBILE APPS: Flutter is available — use it for iOS + Android + Web + Desktop from one codebase.'
    );
  } else if (runtimes.node) {
    strategies.push(
      'MOBILE APPS: Use React Native or Expo for iOS + Android from TypeScript. ' +
      'Or Capacitor to wrap any web app as a native mobile app.'
    );
  }

  // Games
  strategies.push(
    'GAMES 2D: Use Phaser.js (TypeScript) for browser-based games that run everywhere. ' +
    'GAMES 3D: Use Bevy (Rust) or Three.js/Babylon.js (TypeScript). ' +
    'For AAA: Use Godot (GDScript/C#) — exports to Windows, macOS, Linux, Android, iOS, HTML5. ' +
    'Unity (C#) and Unreal (C++) also provide full cross-platform export.'
  );

  // CLI tools
  if (runtimes.rust) {
    strategies.push(
      'CLI TOOLS: Use Rust — single binary, no runtime dependency. ' +
      'Cross-compile with `cross` or `cargo-zigbuild` for all targets.'
    );
  } else if (runtimes.go) {
    strategies.push(
      'CLI TOOLS: Use Go — single binary, excellent cross-compilation with GOOS/GOARCH.'
    );
  }

  // OS-specific build instructions
  const osLabel = hostOS === 'windows' ? 'Windows' :
                  hostOS === 'macos' ? 'macOS' :
                  hostOS === 'linux' ? 'Linux' :
                  hostOS === 'android' ? 'Android' : 'Unknown';

  strategies.push(
    `PRIMARY TARGET: Build and test for ${osLabel} FIRST (this is the user's OS). ` +
    'Then ensure the build system produces artifacts for all other platforms. ' +
    'Use CI/CD (GitHub Actions) to automate cross-platform builds and releases.'
  );

  return strategies.join('\n');
}

/** Format platform info for LLM context injection */
export function formatPlatformForLLM(info: PlatformInfo): string {
  const osLabel = info.hostOS === 'windows' ? 'Windows' :
                  info.hostOS === 'macos' ? 'macOS' :
                  info.hostOS === 'linux' ? 'Linux' :
                  info.hostOS === 'android' ? 'Android' :
                  info.hostOS === 'ios' ? 'iOS' : 'Unknown';

  let text = `## HOST ENVIRONMENT\n`;
  text += `- **OS**: ${osLabel} (${info.platform} ${info.release})\n`;
  text += `- **Arch**: ${info.arch}\n`;
  text += `- **Shell**: ${info.shell}\n`;
  text += `- **Path Separator**: ${info.pathSeparator === '\\' ? 'backslash (\\\\)' : 'forward slash (/)'}\n`;

  if (Object.keys(info.runtimes).length > 0) {
    text += `- **Runtimes**: ${Object.entries(info.runtimes).map(([k, v]) => `${k} ${v}`).join(', ')}\n`;
  }
  if (info.packageManagers.length > 0) {
    text += `- **Package Managers**: ${info.packageManagers.join(', ')}\n`;
  }
  if (info.buildTools.length > 0) {
    text += `- **Build Tools**: ${info.buildTools.join(', ')}\n`;
  }

  text += `\n## CROSS-PLATFORM BUILD MANDATE\n`;
  text += `**PRIMARY TARGET**: ${osLabel} — the user is on this OS, so build and test here FIRST.\n`;
  text += `**SECONDARY TARGETS**: ALL other platforms (Windows, macOS, Linux, Android, iOS, Web).\n`;
  text += `The user's product must be SELLABLE to customers on ANY operating system.\n\n`;

  text += `### MANDATORY CROSS-PLATFORM RULES\n`;
  text += `1. **Environment Setup**: ALWAYS set up the correct build environment for ${osLabel}:\n`;

  if (info.hostOS === 'windows') {
    text += `   - Use PowerShell commands (not bash/sh)\n`;
    text += `   - Use backslash paths in OS commands, forward slash in code\n`;
    text += `   - Use \`npx\`, \`pnpm\`, or \`node\` — never assume Unix tools exist\n`;
    text += `   - For native builds: use MSVC or MinGW toolchain\n`;
    text += `   - For installers: generate .exe/.msi via electron-builder, tauri, or NSIS\n`;
  } else if (info.hostOS === 'macos') {
    text += `   - Use zsh/bash commands\n`;
    text += `   - For native builds: use clang/Xcode toolchain\n`;
    text += `   - For distribution: generate .app/.dmg bundles\n`;
    text += `   - For iOS: use Xcode and Swift/ObjC bridges\n`;
  } else if (info.hostOS === 'linux') {
    text += `   - Use bash commands\n`;
    text += `   - For native builds: use gcc/clang toolchain\n`;
    text += `   - For distribution: generate .deb, .rpm, .AppImage, Flatpak, or Snap\n`;
  }

  text += `2. **Path Handling**: ALWAYS use \`path.join()\` or \`path.resolve()\` in Node.js code — NEVER hardcode / or \\\\\n`;
  text += `3. **Line Endings**: Use \\n in code. Configure .gitattributes with \`* text=auto\` for git normalization\n`;
  text += `4. **Shell Commands**: Use cross-platform npm scripts. Avoid OS-specific shell syntax in package.json scripts\n`;
  text += `   - Use \`cross-env\` for environment variables in scripts\n`;
  text += `   - Use \`rimraf\` instead of \`rm -rf\`, \`mkdirp\` instead of \`mkdir -p\`\n`;
  text += `   - Use \`shx\` for cross-platform shell commands in npm scripts\n`;
  text += `5. **Build Artifacts**: Configure the build system to produce outputs for ALL platforms:\n`;
  text += `   - Windows: .exe, .msi, .appx\n`;
  text += `   - macOS: .app, .dmg, .pkg\n`;
  text += `   - Linux: .AppImage, .deb, .rpm, .snap\n`;
  text += `   - Android: .apk, .aab\n`;
  text += `   - iOS: .ipa (requires macOS for signing)\n`;
  text += `   - Web: Static site / PWA\n`;
  text += `6. **CI/CD**: Include a GitHub Actions workflow (or equivalent) that builds for all platforms automatically\n`;
  text += `7. **Testing**: Test on ${osLabel} locally, but include CI matrix for Windows, macOS, Linux\n`;
  text += `8. **Dependencies**: NEVER use OS-specific packages without providing cross-platform alternatives\n`;
  text += `   - If a native module is needed, use \`optionalDependencies\` with per-platform binaries\n`;
  text += `   - Prefer pure JS/TS/Rust implementations over C/C++ native addons when possible\n`;

  text += `\n### CROSS-PLATFORM STRATEGY BY PROJECT TYPE\n`;
  text += info.crossPlatformStrategy + '\n';

  return text;
}
