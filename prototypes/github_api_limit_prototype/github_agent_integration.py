import requests
import time
from typing import Dict, Any, Optional
from github_rate_limiter import GitHubRateLimiter, GitHubAPIClient
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class RequestsHTTPClient:
    """HTTP client adapter for requests library."""
    
    def __init__(self, auth_token: str):
        self.auth_token = auth_token
        self.session = requests.Session()
    
    def __call__(self, url: str, method: str, headers: Optional[Dict[str, str]], 
                 data: Optional[Any]) -> tuple:
        """
        Make HTTP request using requests library.
        
        Returns:
            Tuple of (status_code, response_headers, response_body)
        """
        request_headers = {
            "Authorization": f"Bearer {self.auth_token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        
        if headers:
            request_headers.update(headers)
        
        response = self.session.request(
            method=method,
            url=url,
            headers=request_headers,
            json=data,
            timeout=30
        )
        
        return response.status_code, dict(response.headers), response.json() if response.text else None


class GitHubCopilotAgenticLoop:
    """
    Agentic loop for GitHub Copilot that respects rate limits.
    
    This demonstrates how to integrate the rate limiter into your agentic coding system.
    """
    
    def __init__(self, github_token: str, copilot_token: str, auth_type: str = "authenticated"):
        """
        Initialize agentic loop.
        
        Args:
            github_token: GitHub personal access token
            copilot_token: GitHub Copilot API token
            auth_type: Authentication type for rate limiting
        """
        self.github_token = github_token
        self.copilot_token = copilot_token
        
        self.github_rate_limiter = GitHubRateLimiter(auth_type=auth_type)
        
        http_client = RequestsHTTPClient(github_token)
        self.github_client = GitHubAPIClient(self.github_rate_limiter, http_client)
        
        self.copilot_session = requests.Session()
        self.copilot_session.headers.update({
            "Authorization": f"Bearer {copilot_token}",
            "Content-Type": "application/json",
        })
    
    def check_rate_limit_status(self) -> Dict[str, Any]:
        """Check current rate limit status without counting against the limit."""
        status_code, headers, body = self.github_client.request(
            url="https://api.github.com/rate_limit",
            method="GET"
        )
        
        if status_code == 200:
            return body
        else:
            raise Exception(f"Failed to check rate limit: {status_code}")
    
    def create_repository(self, repo_name: str, description: str, private: bool = True) -> Dict[str, Any]:
        """
        Create a GitHub repository with rate limiting.
        
        This is a content creation operation with stricter limits.
        """
        status_code, headers, body = self.github_client.request(
            url="https://api.github.com/user/repos",
            method="POST",
            data={
                "name": repo_name,
                "description": description,
                "private": private,
                "auto_init": True
            },
            is_content_creation=True
        )
        
        if status_code == 201:
            logger.info(f"Repository '{repo_name}' created successfully")
            return body
        else:
            raise Exception(f"Failed to create repository: {status_code} - {body}")
    
    def create_file_in_repo(self, owner: str, repo: str, path: str, content: str, 
                           message: str, branch: str = "main") -> Dict[str, Any]:
        """
        Create or update a file in a repository.
        
        This is a content creation operation.
        """
        import base64
        
        encoded_content = base64.b64encode(content.encode()).decode()
        
        status_code, headers, body = self.github_client.request(
            url=f"https://api.github.com/repos/{owner}/{repo}/contents/{path}",
            method="PUT",
            data={
                "message": message,
                "content": encoded_content,
                "branch": branch
            },
            is_content_creation=True
        )
        
        if status_code in {200, 201}:
            logger.info(f"File '{path}' created/updated in {owner}/{repo}")
            return body
        else:
            raise Exception(f"Failed to create file: {status_code} - {body}")
    
    def get_repository_contents(self, owner: str, repo: str, path: str = "") -> Dict[str, Any]:
        """
        Get contents of a repository path.
        
        This is a read operation with standard rate limits.
        """
        status_code, headers, body = self.github_client.request(
            url=f"https://api.github.com/repos/{owner}/{repo}/contents/{path}",
            method="GET"
        )
        
        if status_code == 200:
            return body
        else:
            raise Exception(f"Failed to get repository contents: {status_code} - {body}")
    
    def create_issue(self, owner: str, repo: str, title: str, body_text: str, 
                    labels: Optional[list] = None) -> Dict[str, Any]:
        """
        Create an issue in a repository.
        
        This is a content creation operation.
        """
        data = {
            "title": title,
            "body": body_text,
        }
        
        if labels:
            data["labels"] = labels
        
        status_code, headers, body = self.github_client.request(
            url=f"https://api.github.com/repos/{owner}/{repo}/issues",
            method="POST",
            data=data,
            is_content_creation=True
        )
        
        if status_code == 201:
            logger.info(f"Issue '{title}' created in {owner}/{repo}")
            return body
        else:
            raise Exception(f"Failed to create issue: {status_code} - {body}")
    
    def query_copilot_for_code(self, prompt: str, language: str = "python") -> str:
        """
        Query GitHub Copilot for code generation.
        
        This doesn't use GitHub's REST API so doesn't count against those limits.
        Note: Copilot has its own rate limits that should be handled separately.
        """
        try:
            response = self.copilot_session.post(
                "https://api.github.com/copilot/completions",
                json={
                    "prompt": prompt,
                    "language": language,
                    "max_tokens": 2000
                },
                timeout=30
            )
            
            if response.status_code == 200:
                return response.json().get("choices", [{}])[0].get("text", "")
            else:
                logger.error(f"Copilot request failed: {response.status_code}")
                return ""
        except Exception as e:
            logger.error(f"Error querying Copilot: {e}")
            return ""
    
    def agentic_codebase_builder(self, project_spec: Dict[str, Any], owner: str, 
                                 max_iterations: int = 50) -> Dict[str, Any]:
        """
        Agentic loop that builds a codebase iteratively while respecting rate limits.
        
        Args:
            project_spec: Specification of the project to build
            owner: GitHub username/org
            max_iterations: Maximum number of agentic iterations
            
        Returns:
            Dictionary with build results and statistics
        """
        repo_name = project_spec["name"]
        description = project_spec.get("description", "")
        files_to_create = project_spec.get("files", [])
        
        logger.info(f"Starting agentic codebase builder for '{repo_name}'")
        
        try:
            repo = self.create_repository(repo_name, description)
            logger.info(f"Repository created at: {repo['html_url']}")
        except Exception as e:
            logger.error(f"Failed to create repository: {e}")
            return {"success": False, "error": str(e)}
        
        created_files = []
        failed_files = []
        
        for iteration in range(max_iterations):
            if iteration >= len(files_to_create):
                break
            
            file_spec = files_to_create[iteration]
            file_path = file_spec["path"]
            file_description = file_spec.get("description", "")
            
            logger.info(f"Iteration {iteration + 1}/{max_iterations}: Creating {file_path}")
            
            prompt = f"Create a {file_path} file that {file_description}. Project context: {description}"
            code = self.query_copilot_for_code(prompt, language=file_spec.get("language", "python"))
            
            if not code:
                logger.warning(f"No code generated for {file_path}, skipping")
                failed_files.append(file_path)
                continue
            
            try:
                result = self.create_file_in_repo(
                    owner=owner,
                    repo=repo_name,
                    path=file_path,
                    content=code,
                    message=f"Add {file_path}"
                )
                created_files.append(file_path)
                logger.info(f"Successfully created {file_path}")
            except Exception as e:
                logger.error(f"Failed to create {file_path}: {e}")
                failed_files.append(file_path)
                
                if "rate limit" in str(e).lower() or "429" in str(e) or "403" in str(e):
                    status = self.github_rate_limiter.get_status()
                    logger.error(f"Rate limit status: {status}")
                    
                    if not self.github_rate_limiter.secondary_limit.should_retry():
                        logger.error("Max retries exceeded, stopping build")
                        break
            
            if (iteration + 1) % 10 == 0:
                status = self.github_rate_limiter.get_status()
                logger.info(f"Rate limit status after {iteration + 1} iterations: {status}")
        
        final_status = self.github_rate_limiter.get_status()
        
        return {
            "success": True,
            "repository": repo.get("html_url"),
            "created_files": created_files,
            "failed_files": failed_files,
            "total_iterations": iteration + 1,
            "rate_limit_status": final_status
        }


def example_usage():
    """Example of how to use the agentic loop."""
    
    GITHUB_TOKEN = "your_github_personal_access_token"
    COPILOT_TOKEN = "your_copilot_api_token"
    
    agent = GitHubCopilotAgenticLoop(
        github_token=GITHUB_TOKEN,
        copilot_token=COPILOT_TOKEN,
        auth_type="authenticated"
    )
    
    project_spec = {
        "name": "my-ai-project",
        "description": "An AI-powered application built by agentic coding",
        "files": [
            {
                "path": "README.md",
                "description": "provides project overview and setup instructions",
                "language": "markdown"
            },
            {
                "path": "main.py",
                "description": "contains the main application entry point",
                "language": "python"
            },
            {
                "path": "requirements.txt",
                "description": "lists all Python dependencies",
                "language": "text"
            },
            {
                "path": "src/__init__.py",
                "description": "makes src a Python package",
                "language": "python"
            },
            {
                "path": "src/agent.py",
                "description": "implements the main AI agent logic",
                "language": "python"
            },
        ]
    }
    
    result = agent.agentic_codebase_builder(
        project_spec=project_spec,
        owner="your-github-username",
        max_iterations=50
    )
    
    logger.info(f"Build completed: {result}")


if __name__ == "__main__":
    example_usage()
