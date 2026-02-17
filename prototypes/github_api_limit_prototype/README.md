# GitHub API Rate Limiter for Agentic Coding Systems

Production-grade rate limiting system that enforces GitHub's API rate limits to prevent bans during automated agentic coding operations.

## Features

- **Primary Rate Limit Enforcement**: Tracks and enforces GitHub's hourly rate limits (60-15,000 requests/hour depending on auth type)
- **Secondary Rate Limit Protection**: Prevents violations of concurrent request limits, points-per-minute limits, and content creation quotas
- **Exponential Backoff**: Automatically backs off with increasing delays after rate limit errors
- **Thread-Safe Operations**: Safe for concurrent use in multi-threaded environments
- **Request Queueing**: Priority-based request queue with batch processing support
- **Multiple Auth Types**: Supports unauthenticated, authenticated, GitHub Apps, OAuth apps, and GitHub Actions tokens
- **Zero Retries During Rate Limit**: Waits for rate limit reset instead of retrying and risking bans

## Installation

All components are standalone Python files with minimal dependencies:

```bash
pip install requests
```

Files included:
- `github_rate_limiter.py` - Core rate limiting logic
- `github_agent_integration.py` - Integration examples with agentic loops
- `config_manager.py` - Configuration management for different auth types
- `batch_processor.py` - Request queue and batch processing
- `README.md` - This file

## Quick Start

### Basic Usage

```python
from github_rate_limiter import GitHubRateLimiter, GitHubAPIClient
from github_agent_integration import RequestsHTTPClient

# Initialize rate limiter for authenticated user
rate_limiter = GitHubRateLimiter(auth_type="authenticated")

# Create HTTP client
http_client = RequestsHTTPClient(auth_token="your_github_token")

# Wrap in API client
api_client = GitHubAPIClient(rate_limiter, http_client)

# Make rate-limited request
status_code, headers, body = api_client.request(
    url="https://api.github.com/user/repos",
    method="GET"
)
```

### Agentic Loop Integration

```python
from github_agent_integration import GitHubCopilotAgenticLoop

agent = GitHubCopilotAgenticLoop(
    github_token="your_github_token",
    copilot_token="your_copilot_token",
    auth_type="authenticated"
)

project_spec = {
    "name": "my-ai-project",
    "description": "Auto-generated codebase",
    "files": [
        {
            "path": "main.py",
            "description": "main application entry point",
            "language": "python"
        },
        # ... more files
    ]
}

result = agent.agentic_codebase_builder(
    project_spec=project_spec,
    owner="your-username",
    max_iterations=50
)

print(f"Created {len(result['created_files'])} files")
print(f"Rate limit status: {result['rate_limit_status']}")
```

### Batch Processing

```python
from batch_processor import RequestQueue, BatchProcessor, RequestPriority

# Create request queue
request_queue = RequestQueue(
    rate_limiter=rate_limiter,
    http_client=http_client,
    max_workers=1  # Serial processing recommended
)

request_queue.start()

# Create batch processor
batch_processor = BatchProcessor(
    request_queue=request_queue,
    batch_size=10,  # 10 files per batch
    batch_delay=60.0  # 60 seconds between batches
)

# Process file creations in batches
files = [
    {
        "path": f"src/module_{i}.py",
        "content": f"# Module {i}\n",
        "message": f"Add module {i}"
    }
    for i in range(100)
]

request_ids = batch_processor.process_file_creations(
    owner="username",
    repo="repo-name",
    files=files,
    priority=RequestPriority.NORMAL
)

# Wait for completion
request_queue.wait_for_completion(timeout=3600)

# Get statistics
stats = request_queue.get_stats()
print(f"Success rate: {stats['successful_requests'] / stats['total_requests'] * 100:.1f}%")

request_queue.stop()
```

## Configuration

### Using Configuration Files

```python
from config_manager import AgenticLoopConfig, create_default_config

# Create default config
create_default_config("agent_config.json", auth_type="authenticated")

# Load configuration
config = AgenticLoopConfig("agent_config.json")

# Get rate limits for your auth type
rate_limits = config.get_rate_limit_config()
print(f"Primary limit: {rate_limits.primary_limit_per_hour} requests/hour")

# Get agentic loop settings
settings = config.get_agentic_loop_settings()
print(f"Max iterations: {settings['max_iterations']}")
```

### Configuration File Format

```json
{
  "auth_type": "authenticated",
  "num_repositories": 1,
  "num_users": 1,
  "agentic_loop_settings": {
    "max_iterations": 100,
    "max_retries_on_rate_limit": 5,
    "exponential_backoff_base": 2.0,
    "max_backoff_seconds": 300.0,
    "safety_margin_percent": 10,
    "enable_conditional_requests": true,
    "batch_operations": true,
    "batch_size": 10,
    "pause_between_batches_seconds": 60.0,
    "monitor_rate_limits": true,
    "log_rate_limit_status": true,
    "fail_fast_on_exhaustion": false
  }
}
```

## Authentication Types

### Authenticated User (Personal Access Token)
```python
rate_limiter = GitHubRateLimiter(auth_type="authenticated")
# Limit: 5,000 requests/hour
```

### GitHub App Installation
```python
rate_limiter = GitHubRateLimiter(auth_type="github_app")
# Limit: 5,000-12,500 requests/hour (scales with repos/users)
```

### GitHub App on Enterprise Cloud
```python
rate_limiter = GitHubRateLimiter(auth_type="github_app_enterprise")
# Limit: 15,000 requests/hour
```

### GitHub Actions (GITHUB_TOKEN)
```python
rate_limiter = GitHubRateLimiter(auth_type="github_actions")
# Limit: 1,000 requests/hour per repository
```

### Unauthenticated
```python
rate_limiter = GitHubRateLimiter(auth_type="unauthenticated")
# Limit: 60 requests/hour
```

## Rate Limit Details

### Primary Rate Limits (Per Hour)
- Unauthenticated: 60
- Authenticated (PAT): 5,000
- GitHub App: 5,000-12,500 (scales)
- GitHub App (Enterprise): 15,000
- OAuth App: 5,000
- OAuth App (Enterprise): 15,000
- GitHub Actions: 1,000 per repo
- GitHub Actions (Enterprise): 15,000 per repo

### Secondary Rate Limits
- **Concurrent requests**: Max 100 concurrent
- **Points per minute**: Max 900 points
  - GET/HEAD/OPTIONS: 1 point
  - POST/PATCH/PUT/DELETE: 5 points
- **Mutative requests**: Min 1 second between POST/PATCH/PUT/DELETE
- **Content creation**: Max 80/minute, 500/hour
- **OAuth tokens**: Max 2,000/hour

## Best Practices Enforced

### 1. Serial Request Processing
The system uses serial processing (max_workers=1) by default to avoid concurrent request violations.

### 2. Automatic Mutative Request Pausing
Enforces 1-second minimum delay between POST/PATCH/PUT/DELETE requests.

### 3. Content Creation Tracking
Monitors and limits content-generating requests (file creation, issues, PRs) to 80/minute and 500/hour.

### 4. Exponential Backoff
On rate limit errors (403/429), automatically backs off with exponentially increasing delays:
- 1st error: 1 second
- 2nd error: 2 seconds
- 3rd error: 4 seconds
- Continues up to 300 seconds max

### 5. No Retries During Rate Limit
When rate limited, waits for the reset time specified in `x-ratelimit-reset` header instead of retrying immediately.

### 6. Batch Operations
Groups related operations and adds delays between batches to stay within limits.

## Monitoring Rate Limits

### Check Current Status
```python
status = rate_limiter.get_status()
print(f"Remaining: {status['primary']['remaining']}/{status['primary']['limit']}")
print(f"Reset in: {status['primary']['seconds_until_reset']:.0f} seconds")
print(f"Points used (last min): {status['secondary']['points_last_minute']}/900")
```

### Using /rate_limit Endpoint
```python
status_code, headers, body = api_client.request(
    url="https://api.github.com/rate_limit",
    method="GET"
)

# This call doesn't count against primary rate limit
print(body['resources']['core'])
```

## Error Handling

### Automatic Handling
The rate limiter automatically handles:
- 403/429 responses with `x-ratelimit-remaining: 0`
- 403/429 responses with `retry-after` header
- Exponential backoff on repeated failures

### Manual Handling
```python
try:
    status_code, headers, body = api_client.request(
        url="https://api.github.com/user",
        method="GET"
    )
except Exception as e:
    if "Max retries" in str(e):
        print("Rate limiting exceeded maximum retry attempts")
        # Stop your agentic loop gracefully
    else:
        raise
```

## Integration with Different Models

### GitHub Copilot
```python
# Copilot API has separate rate limits
# Use for code generation without affecting GitHub REST API limits
agent = GitHubCopilotAgenticLoop(
    github_token="github_token",
    copilot_token="copilot_token"
)
```

### Ollama (Local)
```python
# Ollama runs locally, no rate limits
# Use it for planning, then execute via rate-limited GitHub API

import ollama

# Use Ollama for planning
plan = ollama.chat(model='llama2', messages=[{
    'role': 'user',
    'content': 'Create a plan for building a Python web app'
}])

# Execute plan through rate-limited GitHub API
for step in plan['steps']:
    # Rate-limited execution
    api_client.request(...)
```

## Preventing Bans

### Key Protection Mechanisms

1. **Never Retry on Rate Limit**: System waits for reset instead of retrying
2. **Respect retry-after Header**: Uses exact seconds from GitHub's response
3. **Track All Limits**: Monitors both primary and secondary limits
4. **Fail After Max Retries**: Stops after 5 consecutive rate limit errors (configurable)
5. **Safety Margins**: Can configure 10% safety margin to stop before hitting limits

### Warning Signs
```python
status = rate_limiter.get_status()

# Nearly exhausted
if status['primary']['remaining'] < 10:
    print("WARNING: Nearly out of requests")
    
# Many failures
if status['secondary']['consecutive_failures'] > 3:
    print("WARNING: Multiple rate limit errors, consider stopping")
```

## Advanced Features

### Conditional Requests (ETag)
```python
# First request
status_code, headers, body = api_client.request(
    url="https://api.github.com/repos/owner/repo",
    method="GET"
)

etag = headers.get('etag')

# Second request with ETag (doesn't count if 304 returned)
status_code, headers, body = api_client.request(
    url="https://api.github.com/repos/owner/repo",
    method="GET",
    headers={'if-none-match': etag}
)

# 304 Not Modified = doesn't count against rate limit!
```

### Custom Request Priority
```python
from batch_processor import RequestPriority, QueuedRequest

# High priority for critical operations
critical_request = QueuedRequest(
    priority=RequestPriority.CRITICAL.value,
    request_id="critical-1",
    url="https://api.github.com/user",
    method="GET"
)

# Low priority for bulk operations
bulk_request = QueuedRequest(
    priority=RequestPriority.LOW.value,
    request_id="bulk-1",
    url="https://api.github.com/repos/owner/repo",
    method="GET"
)

request_queue.enqueue(critical_request)
request_queue.enqueue(bulk_request)
# Critical request processed first
```

## Troubleshooting

### "Max retries exceeded"
- Your agentic loop is hitting rate limits repeatedly
- Increase batch delays (`pause_between_batches_seconds`)
- Reduce batch size
- Add safety margins

### Slow Processing
- Normal when rate limited - system waits for reset
- Check `total_wait_time` in statistics
- Consider using GitHub App for higher limits
- Verify you're using authenticated requests

### Unexpected 403/429 Errors
- Check if you're making too many concurrent requests
- Verify mutative requests have 1+ second spacing
- Check content creation limits (80/min, 500/hour)
- Review secondary rate limit violations

## License

This code is production-ready and can be used in your agentic coding IDE without restrictions.

## Support

For GitHub API documentation:
- [Rate Limits](https://docs.github.com/en/rest/rate-limit)
- [Best Practices](https://docs.github.com/en/rest/guides/best-practices-for-using-the-rest-api)

For issues with this implementation, review the code comments and logging output for detailed information about rate limit violations.
