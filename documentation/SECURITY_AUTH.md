# Security & Authentication — Complete Reference

## 1. Authentication Modes

### 1.1 GitHub PAT Authentication

**Flow**:
1. User enters GitHub Personal Access Token in login form
2. Backend validates token via `GET https://api.github.com/user`
3. If valid: extracts user profile (id, login, avatar)
4. Encrypts token with `appConfig.security.encryptKey` (XOR cipher)
5. Stores encrypted token + user info in `auth_tokens` table
6. Returns session cookie to frontend
7. Frontend stores auth state in Zustand `authStore`

**Required PAT Scopes**:
- `read:user` — Minimum for authentication
- GitHub Models access: Automatic with any valid PAT (free tier)

**Multi-Account Support**:
- Users can add multiple GitHub accounts
- Encrypted tokens stored per-account in SQLite
- Switch between accounts without re-entering tokens
- Accounts persist across server restarts

### 1.2 Guest Mode Authentication

**Flow**:
1. User clicks "Continue as Guest (Local Mode)"
2. Frontend calls `POST /api/auth/guest` with optional `displayName`
3. Backend creates user record with `github_user_id = -1`
4. No token validation, no GitHub API call
5. Returns session with guest user profile
6. Frontend stores auth state identical to GitHub login

**Guest Limitations**:
- No GitHub Models access (requires PAT)
- No GitHub API features
- Can use: Ollama, LM Studio, Nano Sea (local providers)
- Can use: All IDE features (projects, memory, agents, fleet)

### 1.3 Session Management

- Sessions are stored in SQLite
- No expiration by default (local-only tool)
- Frontend checks `/api/auth/me` on load to restore session
- Logout clears session but preserves stored accounts

---

## 2. Credential Encryption

### 2.1 Encryption Method

All stored credentials (API keys, tokens) are encrypted using XOR cipher before database storage.

```typescript
function encrypt(text: string, key: string): string {
    const textBytes = Buffer.from(text, 'utf-8');
    const keyBytes = Buffer.from(key, 'utf-8');
    const result = Buffer.alloc(textBytes.length);
    for (let i = 0; i < textBytes.length; i++) {
        result[i] = textBytes[i] ^ keyBytes[i % keyBytes.length];
    }
    return result.toString('base64');
}
```

### 2.2 Encryption Key

| Source | Value | Notes |
|--------|-------|-------|
| **Environment variable** | `ENCRYPT_KEY` in `.env` | **Recommended** |
| **Fallback** | `'change-me-before-production-' + Date.now()` | Insecure — changes on restart |

**IMPORTANT**: If the encryption key changes, all stored encrypted credentials become unreadable. Users will need to re-enter API keys.

### 2.3 Where Encryption Is Used

| File | What's Encrypted |
|------|-----------------|
| `routes/auth.ts` | GitHub PAT tokens |
| `routes/providers.ts` | Provider API keys |
| `services/llm/providers.ts` | Decrypts API keys for LLM calls |
| `services/llm/client.ts` | Decrypts PAT for legacy client |

### 2.4 Security Assessment

The XOR cipher is **NOT cryptographically secure**. It is:
- ✅ Sufficient for local-only deployments (single-user, not exposed to network)
- ❌ Insufficient for network-exposed deployments
- ❌ Insufficient for multi-user deployments

For production/network use, replace with AES-256-GCM or similar.

---

## 3. Database Security

### 3.1 SQLite Storage

The database at `./data/personal-ide.db` contains:
- Encrypted API tokens and keys
- User profiles (GitHub user ID, login, avatar URL)
- Project paths (absolute filesystem paths)
- Conversation history
- Memory notes
- Agent run logs

### 3.2 WAL Files

SQLite WAL (Write-Ahead Log) mode creates temporary files:
- `personal-ide.db-wal` — Pending writes
- `personal-ide.db-shm` — Shared memory

These files may contain unencrypted data in transit. The `.gitignore` excludes them:
```
*.db-shm
*.db-wal
```

### 3.3 Database File Permissions

On Windows, the database inherits folder permissions. For shared systems:
```powershell
# Restrict to current user only
$acl = Get-Acl .\data\personal-ide.db
$acl.SetAccessRuleProtection($true, $false)
$rule = New-Object System.Security.AccessControl.FileSystemAccessRule($env:USERNAME, "FullControl", "Allow")
$acl.AddAccessRule($rule)
Set-Acl .\data\personal-ide.db $acl
```

---

## 4. .gitignore Security

### 4.1 Sensitive Files Excluded

The `.gitignore` prevents these from being committed:

```gitignore
# Environment
.env

# Database
*.db
*.db-shm
*.db-wal

# Python
.venv/

# Model checkpoints (may contain trained weights)
*.pt
NANO_train/checkpoints/

# Logs (may contain API responses/personal data)
NANO_train/logs/
*.jsonl

# OS
.DS_Store
Thumbs.db
```

### 4.2 What to Verify Before Publishing

Before pushing to a public repository, verify:

| Check | Command | What to Look For |
|-------|---------|-----------------|
| No .env file | `git ls-files .env` | Should return empty |
| No database | `git ls-files *.db` | Should return empty |
| No checkpoints | `git ls-files *.pt` | Should return empty |
| No logs | `git ls-files *.jsonl` | Should return empty |
| No hardcoded keys | `grep -r "ghp_\|sk-\|Bearer " --include="*.ts"` | Should return no real keys |
| No personal paths | `grep -r "C:\\Users\\" --include="*.md" --include="*.py"` | Check for personal usernames |

### 4.3 Known Personal Data Locations

| Location | Data | Status |
|----------|------|--------|
| `NANO_train/NANO_corpus/*.md` | Personal paths scrubbed | ✅ Clean |
| `NANO_train/logs/*.jsonl` | May contain system info, API responses | Excluded by .gitignore |
| `.env` | API keys, encryption key | Excluded by .gitignore |
| `data/*.db` | Encrypted tokens, user profiles | Excluded by .gitignore |

---

## 5. Network Security

### 5.1 Default Configuration (Local Only)

By default:
- Frontend: `localhost:5173` (Vite dev server)
- Backend: `0.0.0.0:3001` (binds all interfaces — **change to localhost for security**)
- Nano Sea: `0.0.0.0:5100` (binds all interfaces — **change to localhost**)

### 5.2 Hardening for Network Exposure

If exposing to a network:

1. **Change bind addresses** to specific interfaces:
   ```env
   SERVER_HOST=127.0.0.1  # localhost only
   ```

2. **Add HTTPS** via reverse proxy (see SETUP_DEPLOYMENT.md)

3. **Replace XOR encryption** with AES-256-GCM

4. **Add rate limiting** to auth endpoints:
   ```
   /api/auth/login — max 10 attempts per minute
   /api/auth/guest — max 5 per minute
   ```

5. **Add CSRF protection** for state-changing endpoints

6. **Set CORS restrictively**:
   ```env
   FRONTEND_URL=https://your-specific-domain.com
   ```

### 5.3 API Key Storage Best Practices

| Practice | Status |
|----------|--------|
| Keys encrypted at rest | ✅ Yes (XOR) |
| Keys never logged | ✅ Yes |
| Keys never sent to frontend | ✅ Yes |
| Keys rotatable without restart | ❌ Requires re-entry |
| Key encryption uses strong cipher | ❌ XOR only |

---

## 6. Nano Sea Security

### 6.1 Training Data

Training observations sent to Nano Sea may contain:
- Code snippets from user projects
- User queries and responses
- File paths from user's filesystem

This data stays local (never sent externally) unless mesh networking is enabled.

### 6.2 Checkpoint Files

`.pt` checkpoint files contain PyTorch model weights. They are:
- Not encrypted (plain PyTorch tensors)
- Excluded from git via `.gitignore`
- Stored in `NANO_train/checkpoints/`

### 6.3 Mesh Networking

When mesh is enabled, data is shared between machines:
- Training observations
- Nano weights
- Peer discovery information

**Use mesh only on trusted networks.** There is no authentication or encryption for mesh transport.

---

## 7. Security Checklist for Public Repository

Before making the repository public:

- [ ] `.env` file is in `.gitignore` and not committed
- [ ] `*.db` files are in `.gitignore` and not committed
- [ ] `*.pt` checkpoints are in `.gitignore` and not committed
- [ ] `*.jsonl` logs are in `.gitignore` and not committed
- [ ] No hardcoded API keys in source code
- [ ] Encryption key comes from environment variable, not hardcoded
- [ ] No personal filesystem paths in committed files
- [ ] NANO_corpus files scrubbed of personal usernames/paths
- [ ] `.env.example` contains placeholder values only
- [ ] No real GitHub PATs in any committed file
- [ ] Database WAL/SHM files excluded
- [ ] Python `.venv/` excluded
