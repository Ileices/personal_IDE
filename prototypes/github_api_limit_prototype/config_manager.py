from typing import Dict, Any, Optional
from dataclasses import dataclass
import os
import json


@dataclass
class RateLimitConfig:
    """Configuration for GitHub API rate limits based on authentication type."""
    
    primary_limit_per_hour: int
    search_limit_per_minute: int
    concurrent_limit: int
    points_per_minute: int
    mutative_pause_seconds: float
    content_creation_per_minute: int
    content_creation_per_hour: int
    oauth_tokens_per_hour: int
    
    @classmethod
    def for_unauthenticated(cls) -> 'RateLimitConfig':
        """Rate limits for unauthenticated requests."""
        return cls(
            primary_limit_per_hour=60,
            search_limit_per_minute=10,
            concurrent_limit=100,
            points_per_minute=900,
            mutative_pause_seconds=1.0,
            content_creation_per_minute=80,
            content_creation_per_hour=500,
            oauth_tokens_per_hour=2000
        )
    
    @classmethod
    def for_authenticated_user(cls) -> 'RateLimitConfig':
        """Rate limits for authenticated users with personal access token."""
        return cls(
            primary_limit_per_hour=5000,
            search_limit_per_minute=30,
            concurrent_limit=100,
            points_per_minute=900,
            mutative_pause_seconds=1.0,
            content_creation_per_minute=80,
            content_creation_per_hour=500,
            oauth_tokens_per_hour=2000
        )
    
    @classmethod
    def for_github_app(cls, num_repos: int = 1, num_users: int = 1, 
                       is_enterprise: bool = False) -> 'RateLimitConfig':
        """
        Rate limits for GitHub App installations.
        
        Args:
            num_repos: Number of repositories the app has access to
            num_users: Number of users in the organization
            is_enterprise: Whether the installation is on GitHub Enterprise Cloud
        """
        if is_enterprise:
            base_limit = 15000
        else:
            base_limit = 5000
            
            if num_repos > 20:
                additional_repo_limit = (num_repos - 20) * 50
                base_limit = min(base_limit + additional_repo_limit, 12500)
            
            if num_users > 20:
                additional_user_limit = (num_users - 20) * 50
                base_limit = min(base_limit + additional_user_limit, 12500)
        
        return cls(
            primary_limit_per_hour=base_limit,
            search_limit_per_minute=30,
            concurrent_limit=100,
            points_per_minute=900,
            mutative_pause_seconds=1.0,
            content_creation_per_minute=80,
            content_creation_per_hour=500,
            oauth_tokens_per_hour=2000
        )
    
    @classmethod
    def for_oauth_app(cls, is_enterprise: bool = False) -> 'RateLimitConfig':
        """
        Rate limits for OAuth apps.
        
        Args:
            is_enterprise: Whether the OAuth app is owned by a GitHub Enterprise Cloud org
        """
        primary_limit = 15000 if is_enterprise else 5000
        
        return cls(
            primary_limit_per_hour=primary_limit,
            search_limit_per_minute=30,
            concurrent_limit=100,
            points_per_minute=900,
            mutative_pause_seconds=1.0,
            content_creation_per_minute=80,
            content_creation_per_hour=500,
            oauth_tokens_per_hour=2000
        )
    
    @classmethod
    def for_github_actions(cls, is_enterprise: bool = False) -> 'RateLimitConfig':
        """
        Rate limits for GITHUB_TOKEN in GitHub Actions.
        
        Args:
            is_enterprise: Whether the repo is in a GitHub Enterprise Cloud account
        """
        primary_limit = 15000 if is_enterprise else 1000
        
        return cls(
            primary_limit_per_hour=primary_limit,
            search_limit_per_minute=30,
            concurrent_limit=100,
            points_per_minute=900,
            mutative_pause_seconds=1.0,
            content_creation_per_minute=80,
            content_creation_per_hour=500,
            oauth_tokens_per_hour=2000
        )
    
    @classmethod
    def for_git_lfs(cls, authenticated: bool = True) -> 'RateLimitConfig':
        """
        Rate limits for Git LFS operations.
        
        Args:
            authenticated: Whether requests are authenticated
        """
        primary_limit = 3000 if authenticated else 300
        
        return cls(
            primary_limit_per_hour=primary_limit * 60,
            search_limit_per_minute=30,
            concurrent_limit=100,
            points_per_minute=primary_limit,
            mutative_pause_seconds=0.02,
            content_creation_per_minute=primary_limit,
            content_creation_per_hour=primary_limit * 60,
            oauth_tokens_per_hour=2000
        )


class AgenticLoopConfig:
    """Configuration for agentic coding loops with rate limiting."""
    
    def __init__(self, config_path: Optional[str] = None):
        """
        Initialize configuration.
        
        Args:
            config_path: Path to JSON configuration file
        """
        self.config = self._load_config(config_path) if config_path else {}
        self._validate_config()
    
    def _load_config(self, config_path: str) -> Dict[str, Any]:
        """Load configuration from JSON file."""
        if not os.path.exists(config_path):
            raise FileNotFoundError(f"Configuration file not found: {config_path}")
        
        with open(config_path, 'r') as f:
            return json.load(f)
    
    def _validate_config(self) -> None:
        """Validate configuration values."""
        auth_type = self.config.get("auth_type", "authenticated")
        valid_auth_types = {
            "unauthenticated",
            "authenticated",
            "github_app",
            "github_app_enterprise",
            "oauth_app",
            "oauth_app_enterprise",
            "github_actions",
            "github_actions_enterprise",
            "git_lfs_authenticated",
            "git_lfs_unauthenticated"
        }
        
        if auth_type not in valid_auth_types:
            raise ValueError(f"Invalid auth_type: {auth_type}. Must be one of {valid_auth_types}")
    
    def get_rate_limit_config(self) -> RateLimitConfig:
        """Get rate limit configuration based on auth type."""
        auth_type = self.config.get("auth_type", "authenticated")
        
        if auth_type == "unauthenticated":
            return RateLimitConfig.for_unauthenticated()
        
        elif auth_type == "authenticated":
            return RateLimitConfig.for_authenticated_user()
        
        elif auth_type in {"github_app", "github_app_enterprise"}:
            is_enterprise = auth_type == "github_app_enterprise"
            num_repos = self.config.get("num_repositories", 1)
            num_users = self.config.get("num_users", 1)
            return RateLimitConfig.for_github_app(num_repos, num_users, is_enterprise)
        
        elif auth_type in {"oauth_app", "oauth_app_enterprise"}:
            is_enterprise = auth_type == "oauth_app_enterprise"
            return RateLimitConfig.for_oauth_app(is_enterprise)
        
        elif auth_type in {"github_actions", "github_actions_enterprise"}:
            is_enterprise = auth_type == "github_actions_enterprise"
            return RateLimitConfig.for_github_actions(is_enterprise)
        
        elif auth_type in {"git_lfs_authenticated", "git_lfs_unauthenticated"}:
            authenticated = auth_type == "git_lfs_authenticated"
            return RateLimitConfig.for_git_lfs(authenticated)
        
        else:
            return RateLimitConfig.for_authenticated_user()
    
    def get_agentic_loop_settings(self) -> Dict[str, Any]:
        """Get settings for the agentic coding loop."""
        defaults = {
            "max_iterations": 100,
            "max_retries_on_rate_limit": 5,
            "exponential_backoff_base": 2.0,
            "max_backoff_seconds": 300.0,
            "safety_margin_percent": 10,
            "enable_conditional_requests": True,
            "batch_operations": True,
            "batch_size": 10,
            "pause_between_batches_seconds": 60.0,
            "monitor_rate_limits": True,
            "log_rate_limit_status": True,
            "fail_fast_on_exhaustion": False,
        }
        
        user_settings = self.config.get("agentic_loop_settings", {})
        defaults.update(user_settings)
        
        return defaults
    
    def should_use_batch_operations(self) -> bool:
        """Check if batch operations should be used."""
        return self.get_agentic_loop_settings().get("batch_operations", True)
    
    def get_batch_size(self) -> int:
        """Get batch size for operations."""
        return self.get_agentic_loop_settings().get("batch_size", 10)
    
    def get_safety_margin(self) -> float:
        """Get safety margin percentage for rate limiting."""
        percent = self.get_agentic_loop_settings().get("safety_margin_percent", 10)
        return percent / 100.0
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert configuration to dictionary."""
        return {
            "auth_type": self.config.get("auth_type", "authenticated"),
            "rate_limits": self.get_rate_limit_config().__dict__,
            "agentic_loop_settings": self.get_agentic_loop_settings(),
        }
    
    def save(self, output_path: str) -> None:
        """Save configuration to JSON file."""
        with open(output_path, 'w') as f:
            json.dump(self.to_dict(), f, indent=2)


def create_default_config(output_path: str, auth_type: str = "authenticated") -> None:
    """
    Create a default configuration file.
    
    Args:
        output_path: Path where the config file should be created
        auth_type: Type of authentication to configure
    """
    config = {
        "auth_type": auth_type,
        "num_repositories": 1,
        "num_users": 1,
        "agentic_loop_settings": {
            "max_iterations": 100,
            "max_retries_on_rate_limit": 5,
            "exponential_backoff_base": 2.0,
            "max_backoff_seconds": 300.0,
            "safety_margin_percent": 10,
            "enable_conditional_requests": True,
            "batch_operations": True,
            "batch_size": 10,
            "pause_between_batches_seconds": 60.0,
            "monitor_rate_limits": True,
            "log_rate_limit_status": True,
            "fail_fast_on_exhaustion": False,
        }
    }
    
    with open(output_path, 'w') as f:
        json.dump(config, f, indent=2)
    
    print(f"Default configuration created at: {output_path}")


if __name__ == "__main__":
    create_default_config("agent_config.json", auth_type="authenticated")
    
    config = AgenticLoopConfig("agent_config.json")
    print("\nRate Limit Configuration:")
    print(json.dumps(config.to_dict(), indent=2))
