"""
Peer discovery via mDNS (LAN) and seed nodes (WAN).
"""
import asyncio
import logging
import socket
from typing import List, Tuple

logger = logging.getLogger("ileices.mesh.discovery")


class PeerDiscovery:
    """Discovers peers on LAN via mDNS and WAN via seed nodes."""

    SERVICE_TYPE = "_ileices._tcp.local."

    def __init__(self, node_id: str, listen_port: int, tier: str = "UNKNOWN"):
        self.node_id = node_id
        self.listen_port = listen_port
        self.tier = tier
        self._zeroconf = None
        self._service_info = None
        self._discovered_peers: List[Tuple[str, int]] = []

    async def start_advertising(self):
        """Start advertising this node on LAN via mDNS."""
        try:
            from zeroconf import Zeroconf, ServiceInfo
            local_ip = self._get_local_ip()
            self._zeroconf = Zeroconf()
            self._service_info = ServiceInfo(
                self.SERVICE_TYPE,
                f"ileices-{self.node_id}.{self.SERVICE_TYPE}",
                addresses=[socket.inet_aton(local_ip)],
                port=self.listen_port,
                properties={
                    b'node_id': self.node_id.encode(),
                    b'tier': self.tier.encode(),
                },
            )
            self._zeroconf.register_service(self._service_info)
            logger.info(f"mDNS advertising on {local_ip}:{self.listen_port}")
        except ImportError:
            logger.info("zeroconf not installed -- mDNS discovery disabled. "
                        "Install with: pip install zeroconf")
        except Exception as e:
            logger.warning(f"mDNS advertising failed: {e}")

    async def discover_lan(self, timeout: float = 5.0) -> List[Tuple[str, int]]:
        """Discover peers on LAN via mDNS."""
        peers = []
        try:
            from zeroconf import Zeroconf, ServiceBrowser
            import threading

            found = []
            found_event = asyncio.Event()

            class Listener:
                def __init__(self, our_id):
                    self.our_node_id = our_id
                def add_service(self, zc, service_type, name):
                    info = zc.get_service_info(service_type, name)
                    if info:
                        for addr in info.parsed_addresses():
                            nid = info.properties.get(b'node_id', b'').decode()
                            if nid != self.our_node_id:
                                found.append((addr, info.port))
                def remove_service(self, zc, service_type, name):
                    pass
                def update_service(self, zc, service_type, name):
                    pass

            zc = Zeroconf()
            browser = ServiceBrowser(zc, self.SERVICE_TYPE, Listener(self.node_id))
            # Poll with early exit instead of blocking full timeout
            deadline = asyncio.get_event_loop().time() + timeout
            while asyncio.get_event_loop().time() < deadline:
                if found:
                    break
                await asyncio.sleep(0.5)
            browser.cancel()
            zc.close()
            peers = list(set(found))
            logger.info(f"mDNS discovered {len(peers)} peers")
        except ImportError:
            pass
        except Exception as e:
            logger.warning(f"mDNS discovery error: {e}")
        self._discovered_peers.extend(peers)
        return peers

    async def discover_seeds(self, seed_addresses: List[str]) -> List[Tuple[str, int]]:
        """Try connecting to seed nodes. Returns reachable (host, port) pairs."""
        reachable = []
        for addr in seed_addresses:
            try:
                host, port_str = addr.rsplit(':', 1)
                port = int(port_str)
            except ValueError:
                logger.warning(f"Invalid seed address: {addr}")
                continue
            try:
                reader, writer = await asyncio.wait_for(
                    asyncio.open_connection(host, port), timeout=5.0)
                writer.close()
                await writer.wait_closed()
                reachable.append((host, port))
                logger.info(f"Seed node reachable: {host}:{port}")
            except (asyncio.TimeoutError, ConnectionRefusedError, OSError):
                logger.debug(f"Seed node unreachable: {host}:{port}")
        return reachable

    def stop_advertising(self):
        if self._zeroconf and self._service_info:
            try:
                self._zeroconf.unregister_service(self._service_info)
                self._zeroconf.close()
            except Exception:
                pass

    @staticmethod
    def _get_local_ip() -> str:
        """Get the local IP address."""
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.settimeout(2)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except Exception:
            # Fallback: scan interfaces
            try:
                hostname = socket.gethostname()
                ips = socket.getaddrinfo(hostname, None, socket.AF_INET)
                for _, _, _, _, sockaddr in ips:
                    if not sockaddr[0].startswith('127.'):
                        return sockaddr[0]
            except Exception:
                pass
            return "127.0.0.1"
