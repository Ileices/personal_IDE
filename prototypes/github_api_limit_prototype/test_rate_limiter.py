import unittest
import time
from unittest.mock import Mock, MagicMock
from github_rate_limiter import GitHubRateLimiter, RateLimitState, SecondaryRateLimitState, GitHubAPIClient


class TestRateLimitState(unittest.TestCase):
    """Test RateLimitState functionality."""
    
    def test_initialization(self):
        """Test rate limit state initialization."""
        state = RateLimitState()
        self.assertEqual(state.limit, 5000)
        self.assertEqual(state.remaining, 5000)
        self.assertEqual(state.used, 0)
    
    def test_update_from_headers(self):
        """Test updating state from response headers."""
        state = RateLimitState()
        headers = {
            "x-ratelimit-limit": "5000",
            "x-ratelimit-remaining": "4999",
            "x-ratelimit-used": "1",
            "x-ratelimit-reset": "1234567890",
            "x-ratelimit-resource": "core"
        }
        
        state.update_from_headers(headers)
        
        self.assertEqual(state.limit, 5000)
        self.assertEqual(state.remaining, 4999)
        self.assertEqual(state.used, 1)
        self.assertEqual(state.reset_time, 1234567890)
        self.assertEqual(state.resource, "core")
    
    def test_is_exhausted(self):
        """Test rate limit exhaustion check."""
        state = RateLimitState()
        self.assertFalse(state.is_exhausted())
        
        state.remaining = 0
        self.assertTrue(state.is_exhausted())
    
    def test_seconds_until_reset(self):
        """Test calculating seconds until reset."""
        state = RateLimitState()
        state.reset_time = time.time() + 100
        
        seconds = state.seconds_until_reset()
        self.assertGreater(seconds, 95)
        self.assertLess(seconds, 105)


class TestSecondaryRateLimitState(unittest.TestCase):
    """Test SecondaryRateLimitState functionality."""
    
    def test_backoff_reset(self):
        """Test exponential backoff reset."""
        state = SecondaryRateLimitState()
        state.exponential_backoff_seconds = 16.0
        state.consecutive_failures = 4
        
        state.reset_backoff()
        
        self.assertEqual(state.exponential_backoff_seconds, 1.0)
        self.assertEqual(state.consecutive_failures, 0)
    
    def test_backoff_increase(self):
        """Test exponential backoff increase."""
        state = SecondaryRateLimitState()
        
        state.increase_backoff()
        self.assertEqual(state.exponential_backoff_seconds, 2.0)
        self.assertEqual(state.consecutive_failures, 1)
        
        state.increase_backoff()
        self.assertEqual(state.exponential_backoff_seconds, 4.0)
        self.assertEqual(state.consecutive_failures, 2)
        
        state.increase_backoff()
        self.assertEqual(state.exponential_backoff_seconds, 8.0)
        self.assertEqual(state.consecutive_failures, 3)
    
    def test_backoff_max(self):
        """Test exponential backoff maximum."""
        state = SecondaryRateLimitState()
        state.max_exponential_backoff = 100.0
        
        for _ in range(10):
            state.increase_backoff()
        
        self.assertLessEqual(state.exponential_backoff_seconds, 100.0)
    
    def test_should_retry(self):
        """Test retry logic."""
        state = SecondaryRateLimitState()
        state.max_retries = 3
        
        self.assertTrue(state.should_retry())
        
        state.consecutive_failures = 3
        self.assertFalse(state.should_retry())
    
    def test_record_request(self):
        """Test request recording."""
        state = SecondaryRateLimitState()
        
        state.record_request(is_mutative=True, is_content_creation=True, points=5)
        
        self.assertGreater(len(state.request_times), 0)
        self.assertGreater(len(state.points_per_minute), 0)
        self.assertGreater(len(state.content_creation_minute), 0)
        self.assertGreater(len(state.content_creation_hour), 0)
    
    def test_points_tracking(self):
        """Test points per minute tracking."""
        state = SecondaryRateLimitState()
        
        for _ in range(100):
            state.record_request(is_mutative=False, is_content_creation=False, points=1)
        
        points = state.get_points_in_last_minute()
        self.assertEqual(points, 100)
    
    def test_content_creation_tracking(self):
        """Test content creation tracking."""
        state = SecondaryRateLimitState()
        
        for _ in range(50):
            state.record_request(is_mutative=True, is_content_creation=True, points=5)
        
        minute_count = state.get_content_creations_in_last_minute()
        hour_count = state.get_content_creations_in_last_hour()
        
        self.assertEqual(minute_count, 50)
        self.assertEqual(hour_count, 50)


class TestGitHubRateLimiter(unittest.TestCase):
    """Test GitHubRateLimiter functionality."""
    
    def test_initialization_authenticated(self):
        """Test initialization for authenticated user."""
        limiter = GitHubRateLimiter(auth_type="authenticated")
        
        self.assertEqual(limiter.primary_limit.limit, 5000)
        self.assertEqual(limiter.primary_limit.remaining, 5000)
    
    def test_initialization_unauthenticated(self):
        """Test initialization for unauthenticated user."""
        limiter = GitHubRateLimiter(auth_type="unauthenticated")
        
        self.assertEqual(limiter.primary_limit.limit, 60)
        self.assertEqual(limiter.primary_limit.remaining, 60)
    
    def test_can_make_request_with_remaining(self):
        """Test request permission with remaining quota."""
        limiter = GitHubRateLimiter(auth_type="authenticated")
        
        can_make = limiter._can_make_request(
            is_mutative=False,
            is_content_creation=False,
            points=1
        )
        
        self.assertTrue(can_make)
    
    def test_cannot_make_request_when_exhausted(self):
        """Test request blocking when exhausted."""
        limiter = GitHubRateLimiter(auth_type="authenticated")
        limiter.primary_limit.remaining = 0
        limiter.primary_limit.reset_time = time.time() + 100
        
        can_make = limiter._can_make_request(
            is_mutative=False,
            is_content_creation=False,
            points=1
        )
        
        self.assertFalse(can_make)
    
    def test_mutative_request_spacing(self):
        """Test that mutative requests are spaced properly."""
        limiter = GitHubRateLimiter(auth_type="authenticated")
        
        limiter.secondary_limit.last_mutative_request_time = time.time()
        
        can_make = limiter._can_make_request(
            is_mutative=True,
            is_content_creation=False,
            points=5
        )
        
        self.assertFalse(can_make)
        
        time.sleep(1.1)
        
        can_make = limiter._can_make_request(
            is_mutative=True,
            is_content_creation=False,
            points=5
        )
        
        self.assertTrue(can_make)
    
    def test_points_limit_enforcement(self):
        """Test points per minute limit enforcement."""
        limiter = GitHubRateLimiter(auth_type="authenticated")
        
        for _ in range(900):
            limiter.secondary_limit.record_request(
                is_mutative=False,
                is_content_creation=False,
                points=1
            )
        
        can_make = limiter._can_make_request(
            is_mutative=False,
            is_content_creation=False,
            points=1
        )
        
        self.assertFalse(can_make)
    
    def test_content_creation_limit_enforcement(self):
        """Test content creation limit enforcement."""
        limiter = GitHubRateLimiter(auth_type="authenticated")
        
        for _ in range(80):
            limiter.secondary_limit.record_request(
                is_mutative=True,
                is_content_creation=True,
                points=5
            )
        
        can_make = limiter._can_make_request(
            is_mutative=True,
            is_content_creation=True,
            points=5
        )
        
        self.assertFalse(can_make)
    
    def test_release_with_success(self):
        """Test release after successful request."""
        limiter = GitHubRateLimiter(auth_type="authenticated")
        
        limiter.secondary_limit.concurrent_requests = 1
        limiter.secondary_limit.consecutive_failures = 3
        limiter.secondary_limit.exponential_backoff_seconds = 8.0
        
        headers = {
            "x-ratelimit-remaining": "4999",
            "x-ratelimit-reset": str(int(time.time() + 3600))
        }
        
        limiter.release(response_headers=headers, status_code=200)
        
        self.assertEqual(limiter.secondary_limit.concurrent_requests, 0)
        self.assertEqual(limiter.secondary_limit.consecutive_failures, 0)
        self.assertEqual(limiter.secondary_limit.exponential_backoff_seconds, 1.0)
    
    def test_release_with_rate_limit_error(self):
        """Test release after rate limit error."""
        limiter = GitHubRateLimiter(auth_type="authenticated")
        
        limiter.secondary_limit.concurrent_requests = 1
        
        headers = {
            "x-ratelimit-remaining": "0",
            "x-ratelimit-reset": str(int(time.time() + 3600)),
            "retry-after": "60"
        }
        
        limiter.release(response_headers=headers, status_code=429)
        
        self.assertEqual(limiter.secondary_limit.consecutive_failures, 1)
        self.assertGreater(limiter.secondary_limit.exponential_backoff_seconds, 1.0)
    
    def test_get_status(self):
        """Test getting rate limit status."""
        limiter = GitHubRateLimiter(auth_type="authenticated")
        
        status = limiter.get_status()
        
        self.assertIn("primary", status)
        self.assertIn("secondary", status)
        self.assertIn("remaining", status["primary"])
        self.assertIn("concurrent_requests", status["secondary"])


class TestGitHubAPIClient(unittest.TestCase):
    """Test GitHubAPIClient functionality."""
    
    def test_request_success(self):
        """Test successful API request."""
        rate_limiter = GitHubRateLimiter(auth_type="authenticated")
        
        mock_http_client = Mock()
        mock_http_client.return_value = (
            200,
            {"x-ratelimit-remaining": "4999"},
            {"data": "test"}
        )
        
        client = GitHubAPIClient(rate_limiter, mock_http_client)
        
        status_code, headers, body = client.request(
            url="https://api.github.com/user",
            method="GET"
        )
        
        self.assertEqual(status_code, 200)
        self.assertEqual(body["data"], "test")
        mock_http_client.assert_called_once()
    
    def test_request_with_rate_limit_error(self):
        """Test request with rate limit error."""
        rate_limiter = GitHubRateLimiter(auth_type="authenticated")
        
        mock_http_client = Mock()
        mock_http_client.return_value = (
            429,
            {
                "x-ratelimit-remaining": "0",
                "x-ratelimit-reset": str(int(time.time() + 3600)),
                "retry-after": "60"
            },
            {"message": "rate limited"}
        )
        
        client = GitHubAPIClient(rate_limiter, mock_http_client)
        
        status_code, headers, body = client.request(
            url="https://api.github.com/user",
            method="GET"
        )
        
        self.assertEqual(status_code, 429)
        self.assertEqual(rate_limiter.secondary_limit.consecutive_failures, 1)


class TestRateLimitScenarios(unittest.TestCase):
    """Test realistic rate limiting scenarios."""
    
    def test_burst_requests_blocked(self):
        """Test that burst requests are properly rate limited."""
        limiter = GitHubRateLimiter(auth_type="authenticated")
        
        for i in range(900):
            limiter.secondary_limit.record_request(
                is_mutative=False,
                is_content_creation=False,
                points=1
            )
        
        can_make = limiter._can_make_request(
            is_mutative=False,
            is_content_creation=False,
            points=1
        )
        
        self.assertFalse(can_make)
    
    def test_content_creation_rapid_fire_blocked(self):
        """Test that rapid content creation is blocked."""
        limiter = GitHubRateLimiter(auth_type="authenticated")
        
        for i in range(80):
            limiter.secondary_limit.record_request(
                is_mutative=True,
                is_content_creation=True,
                points=5
            )
        
        can_make = limiter._can_make_request(
            is_mutative=True,
            is_content_creation=True,
            points=5
        )
        
        self.assertFalse(can_make)
    
    def test_primary_limit_near_exhaustion(self):
        """Test behavior near primary rate limit exhaustion."""
        limiter = GitHubRateLimiter(auth_type="authenticated")
        limiter.primary_limit.remaining = 5
        limiter.primary_limit.reset_time = time.time() + 100
        
        can_make = limiter._can_make_request(
            is_mutative=False,
            is_content_creation=False,
            points=1
        )
        
        self.assertFalse(can_make)


if __name__ == "__main__":
    unittest.main(verbosity=2)
