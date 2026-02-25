import queue
import threading
import time
from typing import Dict, Any, List, Optional, Callable
from dataclasses import dataclass, field
from enum import Enum
import logging

from github_rate_limiter import GitHubRateLimiter

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class RequestPriority(Enum):
    """Priority levels for queued requests."""
    LOW = 3
    NORMAL = 2
    HIGH = 1
    CRITICAL = 0


@dataclass(order=True)
class QueuedRequest:
    """Request to be processed by the queue."""
    priority: int = field(compare=True)
    timestamp: float = field(compare=True, default_factory=time.time)
    request_id: str = field(compare=False)
    url: str = field(compare=False)
    method: str = field(compare=False, default="GET")
    headers: Optional[Dict[str, str]] = field(compare=False, default=None)
    data: Optional[Any] = field(compare=False, default=None)
    is_content_creation: bool = field(compare=False, default=False)
    callback: Optional[Callable] = field(compare=False, default=None)
    error_callback: Optional[Callable] = field(compare=False, default=None)
    metadata: Dict[str, Any] = field(compare=False, default_factory=dict)


class RequestQueue:
    """
    Thread-safe priority queue for GitHub API requests.
    
    Processes requests in order of priority while respecting rate limits.
    """
    
    def __init__(self, rate_limiter: GitHubRateLimiter, http_client: Callable,
                 max_workers: int = 1, enable_batching: bool = True):
        """
        Initialize request queue.
        
        Args:
            rate_limiter: GitHubRateLimiter instance
            http_client: HTTP client function
            max_workers: Number of worker threads (default 1 for serial processing)
            enable_batching: Whether to enable batch processing optimizations
        """
        self.rate_limiter = rate_limiter
        self.http_client = http_client
        self.enable_batching = enable_batching
        
        self.request_queue = queue.PriorityQueue()
        self.results = {}
        self.results_lock = threading.Lock()
        
        self.workers = []
        self.running = False
        self.max_workers = max_workers
        
        self.stats = {
            "total_requests": 0,
            "successful_requests": 0,
            "failed_requests": 0,
            "rate_limited_requests": 0,
            "total_wait_time": 0.0,
        }
        self.stats_lock = threading.Lock()
    
    def start(self) -> None:
        """Start worker threads to process requests."""
        if self.running:
            logger.warning("Request queue already running")
            return
        
        self.running = True
        
        for i in range(self.max_workers):
            worker = threading.Thread(target=self._worker, name=f"Worker-{i}", daemon=True)
            worker.start()
            self.workers.append(worker)
        
        logger.info(f"Started {self.max_workers} worker thread(s)")
    
    def stop(self, wait: bool = True) -> None:
        """
        Stop worker threads.
        
        Args:
            wait: Whether to wait for current requests to complete
        """
        logger.info("Stopping request queue...")
        self.running = False
        
        if wait:
            for worker in self.workers:
                worker.join(timeout=30)
        
        self.workers.clear()
        logger.info("Request queue stopped")
    
    def enqueue(self, request: QueuedRequest) -> str:
        """
        Add a request to the queue.
        
        Args:
            request: QueuedRequest to process
            
        Returns:
            Request ID for tracking
        """
        self.request_queue.put(request)
        
        with self.stats_lock:
            self.stats["total_requests"] += 1
        
        logger.debug(f"Enqueued request {request.request_id} with priority {request.priority}")
        return request.request_id
    
    def enqueue_bulk(self, requests: List[QueuedRequest]) -> List[str]:
        """
        Add multiple requests to the queue.
        
        Args:
            requests: List of QueuedRequest objects
            
        Returns:
            List of request IDs
        """
        request_ids = []
        for request in requests:
            request_id = self.enqueue(request)
            request_ids.append(request_id)
        
        logger.info(f"Enqueued {len(requests)} requests")
        return request_ids
    
    def get_result(self, request_id: str, timeout: Optional[float] = None) -> Optional[Dict[str, Any]]:
        """
        Get result for a request.
        
        Args:
            request_id: Request ID to retrieve
            timeout: Maximum time to wait for result (None = wait indefinitely)
            
        Returns:
            Result dictionary or None if not available
        """
        start_time = time.time()
        
        while True:
            with self.results_lock:
                if request_id in self.results:
                    return self.results.pop(request_id)
            
            if timeout and (time.time() - start_time) > timeout:
                logger.warning(f"Timeout waiting for result {request_id}")
                return None
            
            time.sleep(0.1)
    
    def wait_for_completion(self, timeout: Optional[float] = None) -> bool:
        """
        Wait for all queued requests to complete.
        
        Args:
            timeout: Maximum time to wait in seconds
            
        Returns:
            True if queue is empty, False if timeout occurred
        """
        start_time = time.time()
        
        while not self.request_queue.empty():
            if timeout and (time.time() - start_time) > timeout:
                logger.warning("Timeout waiting for queue completion")
                return False
            time.sleep(0.5)
        
        time.sleep(1.0)
        
        return self.request_queue.empty()
    
    def get_stats(self) -> Dict[str, Any]:
        """Get processing statistics."""
        with self.stats_lock:
            return self.stats.copy()
    
    def _worker(self) -> None:
        """Worker thread that processes requests from the queue."""
        logger.info(f"Worker {threading.current_thread().name} started")
        
        while self.running:
            try:
                request = self.request_queue.get(timeout=1.0)
            except queue.Empty:
                continue
            
            self._process_request(request)
            self.request_queue.task_done()
        
        logger.info(f"Worker {threading.current_thread().name} stopped")
    
    def _process_request(self, request: QueuedRequest) -> None:
        """Process a single request with rate limiting."""
        start_time = time.time()
        
        try:
            self.rate_limiter.acquire(
                method=request.method,
                is_content_creation=request.is_content_creation
            )
            
            wait_time = time.time() - start_time
            with self.stats_lock:
                self.stats["total_wait_time"] += wait_time
            
            status_code, headers, body = self.http_client(
                request.url,
                request.method,
                request.headers,
                request.data
            )
            
            self.rate_limiter.release(
                response_headers=headers,
                status_code=status_code
            )
            
            result = {
                "request_id": request.request_id,
                "status_code": status_code,
                "headers": headers,
                "body": body,
                "success": 200 <= status_code < 300,
                "wait_time": wait_time,
                "metadata": request.metadata
            }
            
            with self.results_lock:
                self.results[request.request_id] = result
            
            if result["success"]:
                with self.stats_lock:
                    self.stats["successful_requests"] += 1
                
                if request.callback:
                    request.callback(result)
            else:
                with self.stats_lock:
                    self.stats["failed_requests"] += 1
                    if status_code in {403, 429}:
                        self.stats["rate_limited_requests"] += 1
                
                if request.error_callback:
                    request.error_callback(result)
            
            logger.debug(f"Processed request {request.request_id}: {status_code}")
            
        except Exception as e:
            logger.error(f"Error processing request {request.request_id}: {e}")
            
            with self.stats_lock:
                self.stats["failed_requests"] += 1
            
            error_result = {
                "request_id": request.request_id,
                "success": False,
                "error": str(e),
                "metadata": request.metadata
            }
            
            with self.results_lock:
                self.results[request.request_id] = error_result
            
            if request.error_callback:
                request.error_callback(error_result)


class BatchProcessor:
    """
    Batch processor for efficiently handling multiple related GitHub API operations.
    
    Groups related operations together and processes them with optimal timing.
    """
    
    def __init__(self, request_queue: RequestQueue, batch_size: int = 10,
                 batch_delay: float = 60.0):
        """
        Initialize batch processor.
        
        Args:
            request_queue: RequestQueue instance
            batch_size: Maximum number of requests per batch
            batch_delay: Delay in seconds between batches
        """
        self.request_queue = request_queue
        self.batch_size = batch_size
        self.batch_delay = batch_delay
    
    def process_file_creations(self, owner: str, repo: str, 
                               files: List[Dict[str, str]],
                               priority: RequestPriority = RequestPriority.NORMAL) -> List[str]:
        """
        Process multiple file creation operations in batches.
        
        Args:
            owner: Repository owner
            repo: Repository name
            files: List of dicts with 'path', 'content', and 'message'
            priority: Request priority
            
        Returns:
            List of request IDs
        """
        import base64
        
        request_ids = []
        batches = [files[i:i + self.batch_size] for i in range(0, len(files), self.batch_size)]
        
        logger.info(f"Processing {len(files)} file creations in {len(batches)} batch(es)")
        
        for batch_num, batch in enumerate(batches):
            batch_requests = []
            
            for file_spec in batch:
                encoded_content = base64.b64encode(file_spec["content"].encode()).decode()
                
                request = QueuedRequest(
                    priority=priority.value,
                    request_id=f"create-file-{owner}-{repo}-{file_spec['path']}-{int(time.time() * 1000)}",
                    url=f"https://api.github.com/repos/{owner}/{repo}/contents/{file_spec['path']}",
                    method="PUT",
                    data={
                        "message": file_spec.get("message", f"Add {file_spec['path']}"),
                        "content": encoded_content,
                        "branch": file_spec.get("branch", "main")
                    },
                    is_content_creation=True,
                    metadata={
                        "batch_num": batch_num,
                        "file_path": file_spec['path'],
                        "operation": "file_creation"
                    }
                )
                
                batch_requests.append(request)
            
            batch_ids = self.request_queue.enqueue_bulk(batch_requests)
            request_ids.extend(batch_ids)
            
            if batch_num < len(batches) - 1:
                logger.info(f"Batch {batch_num + 1}/{len(batches)} queued, pausing {self.batch_delay}s before next batch")
                time.sleep(self.batch_delay)
        
        return request_ids
    
    def process_issue_creations(self, owner: str, repo: str,
                                issues: List[Dict[str, Any]],
                                priority: RequestPriority = RequestPriority.NORMAL) -> List[str]:
        """
        Process multiple issue creation operations in batches.
        
        Args:
            owner: Repository owner
            repo: Repository name
            issues: List of issue specifications
            priority: Request priority
            
        Returns:
            List of request IDs
        """
        request_ids = []
        batches = [issues[i:i + self.batch_size] for i in range(0, len(issues), self.batch_size)]
        
        logger.info(f"Processing {len(issues)} issue creations in {len(batches)} batch(es)")
        
        for batch_num, batch in enumerate(batches):
            batch_requests = []
            
            for issue in batch:
                request = QueuedRequest(
                    priority=priority.value,
                    request_id=f"create-issue-{owner}-{repo}-{int(time.time() * 1000)}",
                    url=f"https://api.github.com/repos/{owner}/{repo}/issues",
                    method="POST",
                    data=issue,
                    is_content_creation=True,
                    metadata={
                        "batch_num": batch_num,
                        "operation": "issue_creation",
                        "title": issue.get("title", "")
                    }
                )
                
                batch_requests.append(request)
            
            batch_ids = self.request_queue.enqueue_bulk(batch_requests)
            request_ids.extend(batch_ids)
            
            if batch_num < len(batches) - 1:
                logger.info(f"Batch {batch_num + 1}/{len(batches)} queued, pausing {self.batch_delay}s before next batch")
                time.sleep(self.batch_delay)
        
        return request_ids
    
    def process_repository_queries(self, queries: List[Dict[str, str]],
                                   priority: RequestPriority = RequestPriority.NORMAL) -> List[str]:
        """
        Process multiple repository query operations.
        
        Args:
            queries: List of query specifications with 'owner', 'repo', 'path'
            priority: Request priority
            
        Returns:
            List of request IDs
        """
        request_ids = []
        
        for query in queries:
            owner = query["owner"]
            repo = query["repo"]
            path = query.get("path", "")
            
            request = QueuedRequest(
                priority=priority.value,
                request_id=f"query-repo-{owner}-{repo}-{path}-{int(time.time() * 1000)}",
                url=f"https://api.github.com/repos/{owner}/{repo}/contents/{path}",
                method="GET",
                is_content_creation=False,
                metadata={
                    "operation": "repository_query",
                    "owner": owner,
                    "repo": repo,
                    "path": path
                }
            )
            
            request_ids.append(self.request_queue.enqueue(request))
        
        logger.info(f"Queued {len(queries)} repository queries")
        return request_ids


def example_batch_processing():
    """Example of using batch processing for agentic operations."""
    from github_rate_limiter import GitHubRateLimiter
    from github_agent_integration import RequestsHTTPClient
    
    GITHUB_TOKEN = "your_github_personal_access_token"
    
    rate_limiter = GitHubRateLimiter(auth_type="authenticated")
    http_client = RequestsHTTPClient(GITHUB_TOKEN)
    
    request_queue = RequestQueue(
        rate_limiter=rate_limiter,
        http_client=http_client,
        max_workers=1,
        enable_batching=True
    )
    
    request_queue.start()
    
    batch_processor = BatchProcessor(
        request_queue=request_queue,
        batch_size=10,
        batch_delay=60.0
    )
    
    files_to_create = [
        {"path": f"src/module_{i}.py", "content": f"# Module {i}\n\ndef func_{i}():\n    pass\n", "message": f"Add module {i}"}
        for i in range(50)
    ]
    
    request_ids = batch_processor.process_file_creations(
        owner="your-username",
        repo="your-repo",
        files=files_to_create,
        priority=RequestPriority.NORMAL
    )
    
    logger.info(f"Queued {len(request_ids)} file creation requests")
    
    request_queue.wait_for_completion(timeout=3600)
    
    stats = request_queue.get_stats()
    logger.info(f"Processing complete. Stats: {stats}")
    
    request_queue.stop()


if __name__ == "__main__":
    example_batch_processing()
