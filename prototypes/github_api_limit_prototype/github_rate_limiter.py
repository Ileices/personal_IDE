import time
import threading
from typing import Optional, Dict, Any, Callable
from dataclasses import dataclass, field
from datetime import datetime, timezone
from collections import deque
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class RateLimitState:
    limit: int = 5000
    remaining: int = 5000
    reset_time: float = 0.0
    resource: str = "core"
    used: int = 0
    
    def update_from_headers(self, headers: Dict[str, str]) -> None:
        """Update state from GitHub API response headers."""
        if "x-ratelimit-limit" in headers:
            self.limit = int(headers["x-ratelimit-limit"])
        if "x-ratelimit-remaining" in headers:
            self.remaining = int(headers["x-ratelimit-remaining"])
        if "x-ratelimit-used" in headers:
            self.used = int(headers["x-ratelimit-used"])
        if "x-ratelimit-reset" in headers:
            self.reset_time = float(headers["x-ratelimit-reset"])
        if "x-ratelimit-resource" in headers:
            self.resource = headers["x-ratelimit-resource"]
    
    def seconds_until_reset(self) -> float:
        """Calculate seconds until rate limit resets."""
        current_time = datetime.now(timezone.utc).timestamp()
        return max(0.0, self.reset_time - current_time)
    
    def is_exhausted(self) -> bool:
        """Check if rate limit is exhausted."""
        return self.remaining == 0


@dataclass
class SecondaryRateLimitState:
    last_mutative_request_time: float = 0.0
    concurrent_requests: int = 0
    max_concurrent_requests: int = 100
    request_times: deque = field(default_factory=lambda: deque(maxlen=900))
    points_per_minute: deque = field(default_factory=lambda: deque(maxlen=60))
    content_creation_minute: deque = field(default_factory=lambda: deque(maxlen=60))
    content_creation_hour: deque = field(default_factory=lambda: deque(maxlen=60))
    retry_after_until: float = 0.0
    exponential_backoff_seconds: float = 1.0
    max_exponential_backoff: float = 300.0
    consecutive_failures: int = 0
    max_retries: int = 5
    
    def reset_backoff(self) -> None:
        """Reset exponential backoff on successful request."""
        self.exponential_backoff_seconds = 1.0
        self.consecutive_failures = 0
    
    def increase_backoff(self) -> None:
        """Increase exponential backoff on failure."""
        self.consecutive_failures += 1
        self.exponential_backoff_seconds = min(
            self.exponential_backoff_seconds * 2,
            self.max_exponential_backoff
        )
    
    def should_retry(self) -> bool:
        """Check if we should continue retrying."""
        return self.consecutive_failures < self.max_retries
    
    def get_wait_time(self) -> float:
        """Calculate wait time before next request."""
        current_time = time.time()
        
        if self.retry_after_until > current_time:
            return self.retry_after_until - current_time
        
        if self.consecutive_failures > 0:
            return self.exponential_backoff_seconds
        
        return 0.0
    
    def update_retry_after(self, retry_after_seconds: Optional[int]) -> None:
        """Update retry-after time from response header."""
        if retry_after_seconds:
            self.retry_after_until = time.time() + retry_after_seconds
    
    def record_request(self, is_mutative: bool, is_content_creation: bool, points: int = 1) -> None:
        """Record request for secondary rate limit tracking."""
        current_time = time.time()
        current_minute = int(current_time / 60)
        
        self.request_times.append(current_time)
        
        if not self.points_per_minute or self.points_per_minute[-1][0] != current_minute:
            self.points_per_minute.append([current_minute, 0])
        self.points_per_minute[-1][1] += points
        
        if is_mutative:
            self.last_mutative_request_time = current_time
        
        if is_content_creation:
            if not self.content_creation_minute or self.content_creation_minute[-1][0] != current_minute:
                self.content_creation_minute.append([current_minute, 0])
            self.content_creation_minute[-1][1] += 1
            
            current_hour = int(current_time / 3600)
            if not self.content_creation_hour or self.content_creation_hour[-1][0] != current_hour:
                self.content_creation_hour.append([current_hour, 0])
            self.content_creation_hour[-1][1] += 1
    
    def get_points_in_last_minute(self) -> int:
        """Get total points used in the last minute."""
        current_minute = int(time.time() / 60)
        total_points = 0
        for minute, points in self.points_per_minute:
            if current_minute - minute < 1:
                total_points += points
        return total_points
    
    def get_content_creations_in_last_minute(self) -> int:
        """Get content creation requests in the last minute."""
        current_minute = int(time.time() / 60)
        total = 0
        for minute, count in self.content_creation_minute:
            if current_minute - minute < 1:
                total += count
        return total
    
    def get_content_creations_in_last_hour(self) -> int:
        """Get content creation requests in the last hour."""
        current_hour = int(time.time() / 3600)
        total = 0
        for hour, count in self.content_creation_hour:
            if current_hour - hour < 1:
                total += count
        return total
    
    def time_since_last_mutative_request(self) -> float:
        """Get time since last mutative request."""
        if self.last_mutative_request_time == 0.0:
            return float('inf')
        return time.time() - self.last_mutative_request_time


class GitHubRateLimiter:
    """
    Production-grade rate limiter for GitHub API that enforces both primary and secondary rate limits.
    
    Handles:
    - Primary rate limits (5000/hour for authenticated users)
    - Secondary rate limits (concurrent requests, points per minute, content creation)
    - Exponential backoff on rate limit errors
    - Proper retry-after header handling
    - Thread-safe operations
    """
    
    def __init__(self, auth_type: str = "authenticated"):
        """
        Initialize rate limiter.
        
        Args:
            auth_type: Type of authentication ('authenticated', 'unauthenticated', 
                      'github_app', 'oauth_app', 'github_actions')
        """
        self.auth_type = auth_type
        self.primary_limit = RateLimitState()
        self.secondary_limit = SecondaryRateLimitState()
        self.lock = threading.Lock()
        
        self._initialize_limits_by_auth_type()
    
    def _initialize_limits_by_auth_type(self) -> None:
        """Set initial rate limits based on authentication type."""
        limits = {
            "unauthenticated": 60,
            "authenticated": 5000,
            "github_app": 5000,
            "github_app_enterprise": 15000,
            "oauth_app": 5000,
            "oauth_app_enterprise": 15000,
            "github_actions": 1000,
        }
        
        initial_limit = limits.get(self.auth_type, 5000)
        self.primary_limit.limit = initial_limit
        self.primary_limit.remaining = initial_limit
    
    def acquire(self, method: str = "GET", is_content_creation: bool = False) -> None:
        """
        Acquire permission to make a request. Blocks until safe to proceed.
        
        Args:
            method: HTTP method (GET, POST, PATCH, PUT, DELETE)
            is_content_creation: Whether this request creates content on GitHub
        """
        with self.lock:
            is_mutative = method.upper() in {"POST", "PATCH", "PUT", "DELETE"}
            points = 5 if is_mutative else 1
            
            while True:
                if not self._can_make_request(is_mutative, is_content_creation, points):
                    wait_time = self._calculate_wait_time(is_mutative)
                    logger.info(f"Rate limit protection: waiting {wait_time:.2f} seconds before next request")
                    self.lock.release()
                    time.sleep(wait_time)
                    self.lock.acquire()
                    continue
                
                if self.secondary_limit.concurrent_requests >= self.secondary_limit.max_concurrent_requests:
                    logger.warning(f"Max concurrent requests ({self.secondary_limit.max_concurrent_requests}) reached, waiting...")
                    self.lock.release()
                    time.sleep(1.0)
                    self.lock.acquire()
                    continue
                
                self.secondary_limit.concurrent_requests += 1
                self.secondary_limit.record_request(is_mutative, is_content_creation, points)
                break
    
    def _can_make_request(self, is_mutative: bool, is_content_creation: bool, points: int) -> bool:
        """Check if a request can be made without violating rate limits."""
        if self.primary_limit.is_exhausted():
            if self.primary_limit.seconds_until_reset() > 0:
                return False
        
        if self.primary_limit.remaining <= 10:
            logger.warning(f"Primary rate limit nearly exhausted: {self.primary_limit.remaining} remaining")
            if self.primary_limit.seconds_until_reset() > 0:
                return False
        
        if self.secondary_limit.get_wait_time() > 0:
            return False
        
        if is_mutative:
            time_since_last = self.secondary_limit.time_since_last_mutative_request()
            if time_since_last < 1.0:
                return False
        
        points_in_minute = self.secondary_limit.get_points_in_last_minute()
        if points_in_minute + points > 900:
            return False
        
        if is_content_creation:
            content_minute = self.secondary_limit.get_content_creations_in_last_minute()
            content_hour = self.secondary_limit.get_content_creations_in_last_hour()
            
            if content_minute >= 80:
                return False
            if content_hour >= 500:
                return False
        
        return True
    
    def _calculate_wait_time(self, is_mutative: bool) -> float:
        """Calculate how long to wait before next request."""
        wait_times = []
        
        secondary_wait = self.secondary_limit.get_wait_time()
        if secondary_wait > 0:
            wait_times.append(secondary_wait)
        
        if self.primary_limit.is_exhausted():
            reset_wait = self.primary_limit.seconds_until_reset()
            if reset_wait > 0:
                wait_times.append(reset_wait)
        
        if is_mutative:
            time_since_last = self.secondary_limit.time_since_last_mutative_request()
            if time_since_last < 1.0:
                wait_times.append(1.0 - time_since_last)
        
        points_in_minute = self.secondary_limit.get_points_in_last_minute()
        if points_in_minute >= 900:
            wait_times.append(60.0)
        
        return max(wait_times) if wait_times else 1.0
    
    def release(self, response_headers: Optional[Dict[str, str]] = None, 
                status_code: Optional[int] = None) -> None:
        """
        Release after request completion and update state from response.
        
        Args:
            response_headers: HTTP response headers from GitHub API
            status_code: HTTP status code
        """
        with self.lock:
            self.secondary_limit.concurrent_requests = max(0, self.secondary_limit.concurrent_requests - 1)
            
            if response_headers:
                self.primary_limit.update_from_headers(response_headers)
                
                retry_after = response_headers.get("retry-after")
                if retry_after:
                    self.secondary_limit.update_retry_after(int(retry_after))
            
            if status_code in {403, 429}:
                self.secondary_limit.increase_backoff()
                logger.warning(f"Rate limit error {status_code}, backoff increased to {self.secondary_limit.exponential_backoff_seconds}s")
                
                if response_headers and response_headers.get("x-ratelimit-remaining") == "0":
                    reset_time = self.primary_limit.seconds_until_reset()
                    logger.error(f"Primary rate limit exhausted. Reset in {reset_time:.0f} seconds ({datetime.fromtimestamp(self.primary_limit.reset_time, timezone.utc).isoformat()})")
                
                if not self.secondary_limit.should_retry():
                    raise Exception(f"Max retries ({self.secondary_limit.max_retries}) exceeded due to rate limiting")
            elif status_code and 200 <= status_code < 300:
                self.secondary_limit.reset_backoff()
    
    def get_status(self) -> Dict[str, Any]:
        """Get current rate limit status."""
        with self.lock:
            return {
                "primary": {
                    "limit": self.primary_limit.limit,
                    "remaining": self.primary_limit.remaining,
                    "used": self.primary_limit.used,
                    "reset_time": datetime.fromtimestamp(self.primary_limit.reset_time, timezone.utc).isoformat() if self.primary_limit.reset_time > 0 else None,
                    "seconds_until_reset": self.primary_limit.seconds_until_reset(),
                    "resource": self.primary_limit.resource,
                },
                "secondary": {
                    "concurrent_requests": self.secondary_limit.concurrent_requests,
                    "points_last_minute": self.secondary_limit.get_points_in_last_minute(),
                    "content_creations_last_minute": self.secondary_limit.get_content_creations_in_last_minute(),
                    "content_creations_last_hour": self.secondary_limit.get_content_creations_in_last_hour(),
                    "exponential_backoff_seconds": self.secondary_limit.exponential_backoff_seconds,
                    "consecutive_failures": self.secondary_limit.consecutive_failures,
                },
            }


class GitHubAPIClient:
    """
    Wrapper for making GitHub API requests with automatic rate limiting.
    """
    
    def __init__(self, rate_limiter: GitHubRateLimiter, http_client: Callable):
        """
        Initialize API client.
        
        Args:
            rate_limiter: GitHubRateLimiter instance
            http_client: Function that makes HTTP requests with signature:
                        http_client(url, method, headers, data) -> (status_code, headers, body)
        """
        self.rate_limiter = rate_limiter
        self.http_client = http_client
    
    def request(self, url: str, method: str = "GET", headers: Optional[Dict[str, str]] = None,
                data: Optional[Any] = None, is_content_creation: bool = False) -> tuple:
        """
        Make rate-limited request to GitHub API.
        
        Args:
            url: API endpoint URL
            method: HTTP method
            headers: Request headers
            data: Request body
            is_content_creation: Whether this creates content on GitHub
            
        Returns:
            Tuple of (status_code, response_headers, response_body)
        """
        self.rate_limiter.acquire(method=method, is_content_creation=is_content_creation)
        
        try:
            status_code, response_headers, response_body = self.http_client(url, method, headers, data)
            self.rate_limiter.release(response_headers=response_headers, status_code=status_code)
            return status_code, response_headers, response_body
        except Exception as e:
            self.rate_limiter.release(status_code=500)
            raise e
