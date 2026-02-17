// ============================================
// Auth Types - GitHub OAuth, accounts
// ============================================

/** GitHub user profile */
export interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatarUrl: string;
  /** Whether this account has Copilot access */
  hasCopilot: boolean;
}

/** Auth state in the app */
export interface AuthState {
  isAuthenticated: boolean;
  user: GitHubUser | null;
  /** The active PAT or OAuth token */
  token: string | null;
  /** When the token expires (ISO) */
  tokenExpiresAt?: string;
  /** Error from last auth attempt */
  error?: string;
}

/** GitHub Device Flow response (step 1) */
export interface DeviceCodeResponse {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}

/** Login request */
export interface LoginRequest {
  /** Direct PAT login */
  pat?: string;
}

/** Auth API responses */
export interface AuthResponse {
  success: boolean;
  user?: GitHubUser;
  error?: string;
}

/** Device flow start response */
export interface DeviceFlowStartResponse {
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  /** Poll this endpoint to check if user completed auth */
  pollEndpoint: string;
}
