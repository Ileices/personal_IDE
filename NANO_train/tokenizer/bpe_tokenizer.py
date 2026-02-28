"""
BPE Tokenizer — Byte-Pair Encoding shared across all nano categories.

Architecture:
  - Byte-level BPE (like GPT-2): works on UTF-8 byte sequences
  - Configurable vocab size (default 8192 — suitable for tiny nanos)
  - Special tokens: <pad>=0, <unk>=1, <bos>=2, <eos>=3
  - Thread-safe encode/decode via immutable vocab after training
  - Serializable to JSON for checkpoint persistence

Usage:
  from tokenizer import SharedTokenizer
  tok = SharedTokenizer.get()           # Singleton, auto-loads if vocab exists
  ids = tok.encode("hello world")       # [72, 101, 108, ...]
  text = tok.decode(ids)                # "hello world"
  tensor = tok.encode_to_tensor("hi", max_len=128)  # torch.Tensor (1, 128)
"""
from __future__ import annotations
import json
import re
import logging
import os
from collections import Counter, OrderedDict
from pathlib import Path
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# ─── Special Tokens ─────────────────────────────────────────
PAD_TOKEN = "<pad>"
UNK_TOKEN = "<unk>"
BOS_TOKEN = "<bos>"
EOS_TOKEN = "<eos>"
SPECIAL_TOKENS = [PAD_TOKEN, UNK_TOKEN, BOS_TOKEN, EOS_TOKEN]
PAD_ID = 0
UNK_ID = 1
BOS_ID = 2
EOS_ID = 3

DEFAULT_VOCAB_SIZE = 8192
DEFAULT_VOCAB_DIR = Path(__file__).parent.parent / "checkpoints" / "tokenizer"


class BPETokenizer:
    """
    Byte-Pair Encoding tokenizer.
    
    Training:
      1. Start with byte-level vocabulary (256 entries + special tokens)
      2. Iteratively merge the most frequent adjacent pair
      3. Stop when vocab_size is reached
    
    Encoding:
      1. Convert text to UTF-8 bytes
      2. Greedily apply learned merges in priority order
      3. Map merged tokens to integer IDs
    
    Decoding:
      1. Map IDs back to byte sequences
      2. Decode UTF-8 bytes to text
    """

    def __init__(self, vocab_size: int = DEFAULT_VOCAB_SIZE):
        self.target_vocab_size = vocab_size
        
        # Core vocab: special tokens + 256 byte tokens
        self.token_to_id: Dict[str, int] = {}
        self.id_to_token: Dict[int, str] = {}
        self.merges: List[Tuple[str, str]] = []  # Ordered merge rules
        self._merge_set: set = set()  # For fast lookup
        
        # Initialize with special + byte tokens
        self._init_base_vocab()
        self._trained = False

    def _init_base_vocab(self) -> None:
        """Initialize vocabulary with special tokens + all 256 byte values."""
        self.token_to_id = {}
        self.id_to_token = {}
        
        # Special tokens first
        for i, tok in enumerate(SPECIAL_TOKENS):
            self.token_to_id[tok] = i
            self.id_to_token[i] = tok
        
        # Byte tokens: represent each byte as a hex string <0x00> through <0xFF>
        for byte_val in range(256):
            token = f"<0x{byte_val:02X}>"
            idx = len(SPECIAL_TOKENS) + byte_val
            self.token_to_id[token] = idx
            self.id_to_token[idx] = token

    def _byte_to_token(self, b: int) -> str:
        """Convert a single byte to its token string."""
        return f"<0x{b:02X}>"

    def _token_to_bytes(self, token: str) -> bytes:
        """Convert a token string to bytes. Handles both byte tokens and merged tokens."""
        if token in SPECIAL_TOKENS:
            return b""
        if token.startswith("<0x") and token.endswith(">") and len(token) == 6:
            return bytes([int(token[3:5], 16)])
        # Merged token: recursively resolve
        result = b""
        for sub in self._split_merged_token(token):
            result += self._token_to_bytes(sub)
        return result

    def _split_merged_token(self, token: str) -> List[str]:
        """Split a merged token into its constituent byte tokens."""
        # A merged token is just a concatenation of byte tokens
        parts = []
        i = 0
        while i < len(token):
            if token[i:i+4].startswith("<0x") and i + 5 < len(token) and token[i+5] == ">":
                parts.append(token[i:i+6])
                i += 6
            else:
                # Shouldn't happen with well-formed tokens, but handle gracefully
                parts.append(token[i])
                i += 1
        return parts if parts else [token]

    # ─── Training ────────────────────────────────────────────
    def train(self, texts: List[str], verbose: bool = True) -> None:
        """
        Train BPE vocabulary from a list of text strings.
        
        Algorithm:
          1. Encode all text as byte sequences
          2. Count all adjacent byte pairs
          3. Merge the most frequent pair into a new token
          4. Repeat until vocab_size is reached
        """
        if verbose:
            logger.info(f"Training BPE tokenizer — target vocab: {self.target_vocab_size}, "
                       f"corpus size: {sum(len(t) for t in texts)} chars across {len(texts)} texts")

        # Step 1: Convert corpus to sequences of byte tokens
        sequences: List[List[str]] = []
        for text in texts:
            raw_bytes = text.encode("utf-8", errors="replace")
            seq = [self._byte_to_token(b) for b in raw_bytes]
            if seq:
                sequences.append(seq)

        if not sequences:
            logger.warning("Empty corpus — skipping BPE training")
            return

        # Step 2: Iterative merging
        current_vocab_size = len(self.token_to_id)
        merges_needed = self.target_vocab_size - current_vocab_size

        for merge_idx in range(merges_needed):
            # Count all adjacent pairs
            pair_counts: Counter = Counter()
            for seq in sequences:
                for i in range(len(seq) - 1):
                    pair_counts[(seq[i], seq[i + 1])] += 1

            if not pair_counts:
                break

            # Find most frequent pair
            best_pair = pair_counts.most_common(1)[0]
            (tok_a, tok_b), count = best_pair

            if count < 2:
                # No pair occurs more than once — stop
                break

            # Create merged token
            merged = tok_a + tok_b
            new_id = len(self.token_to_id)
            self.token_to_id[merged] = new_id
            self.id_to_token[new_id] = merged
            self.merges.append((tok_a, tok_b))
            self._merge_set.add((tok_a, tok_b))

            # Apply merge to all sequences
            for s_idx in range(len(sequences)):
                sequences[s_idx] = self._apply_merge(sequences[s_idx], tok_a, tok_b, merged)

            if verbose and (merge_idx + 1) % 500 == 0:
                logger.info(f"  BPE merge {merge_idx + 1}/{merges_needed}: "
                           f"'{tok_a}'+'{tok_b}' → '{merged}' (count={count})")

        self._trained = True
        logger.info(f"BPE training complete: {len(self.token_to_id)} tokens, "
                    f"{len(self.merges)} merges learned")

    @staticmethod
    def _apply_merge(seq: List[str], tok_a: str, tok_b: str, merged: str) -> List[str]:
        """Apply a single merge rule to a token sequence."""
        result = []
        i = 0
        while i < len(seq):
            if i < len(seq) - 1 and seq[i] == tok_a and seq[i + 1] == tok_b:
                result.append(merged)
                i += 2
            else:
                result.append(seq[i])
                i += 1
        return result

    # ─── Encoding ────────────────────────────────────────────
    def encode(self, text: str, add_special: bool = False) -> List[int]:
        """
        Encode text to a list of token IDs.
        
        1. Convert to UTF-8 bytes → byte tokens
        2. Apply all learned merges in order
        3. Map to integer IDs
        """
        if not text:
            return [BOS_ID, EOS_ID] if add_special else []

        # Convert to byte tokens
        raw_bytes = text.encode("utf-8", errors="replace")
        tokens = [self._byte_to_token(b) for b in raw_bytes]

        # Apply merges in learned order
        for tok_a, tok_b in self.merges:
            merged = tok_a + tok_b
            tokens = self._apply_merge(tokens, tok_a, tok_b, merged)

        # Map to IDs
        ids = []
        if add_special:
            ids.append(BOS_ID)
        for tok in tokens:
            ids.append(self.token_to_id.get(tok, UNK_ID))
        if add_special:
            ids.append(EOS_ID)

        return ids

    def decode(self, ids: List[int], skip_special: bool = True) -> str:
        """
        Decode a list of token IDs back to text.
        
        1. Map IDs to tokens
        2. Resolve merged tokens to bytes
        3. Decode UTF-8
        """
        raw_bytes = bytearray()
        for token_id in ids:
            token = self.id_to_token.get(token_id, UNK_TOKEN)
            if skip_special and token in SPECIAL_TOKENS:
                continue
            raw_bytes.extend(self._token_to_bytes(token))

        return raw_bytes.decode("utf-8", errors="replace")

    # ─── Tensor Interface (for nano integration) ─────────────
    def encode_to_tensor(self, text: str, max_len: int = 128,
                         add_special: bool = True) -> "torch.Tensor":
        """
        Encode text to a padded float tensor of shape (1, max_len).
        Token IDs are normalized to [0, 1] range for nano input compatibility.
        """
        import torch
        ids = self.encode(text, add_special=add_special)

        # Truncate or pad
        if len(ids) > max_len:
            ids = ids[:max_len]
        while len(ids) < max_len:
            ids.append(PAD_ID)

        # Normalize: id / vocab_size → [0, 1]
        vocab_size = max(len(self.token_to_id), 1)
        normalized = [float(i) / vocab_size for i in ids]
        return torch.tensor([normalized], dtype=torch.float32)

    def decode_from_tensor(self, tensor: "torch.Tensor") -> str:
        """
        Decode a nano output tensor back to text.
        Inverse of encode_to_tensor: denormalize → round to IDs → decode.
        """
        values = tensor.squeeze().detach().cpu().tolist()
        if isinstance(values, float):
            values = [values]

        vocab_size = max(len(self.token_to_id), 1)
        ids = []
        for v in values:
            token_id = int(round(v * vocab_size))
            token_id = max(0, min(token_id, vocab_size - 1))
            if token_id == PAD_ID:
                continue  # Skip padding
            ids.append(token_id)

        return self.decode(ids)

    # ─── Persistence ─────────────────────────────────────────
    def save(self, path: Optional[Path] = None) -> Path:
        """Save vocabulary and merges to JSON."""
        save_dir = Path(path) if path else DEFAULT_VOCAB_DIR
        save_dir.mkdir(parents=True, exist_ok=True)
        vocab_path = save_dir / "vocab.json"
        merges_path = save_dir / "merges.json"
        meta_path = save_dir / "tokenizer_meta.json"

        with open(vocab_path, "w", encoding="utf-8") as f:
            json.dump(self.token_to_id, f, ensure_ascii=False, indent=1)

        with open(merges_path, "w", encoding="utf-8") as f:
            json.dump(self.merges, f, ensure_ascii=False, indent=1)

        meta = {
            "type": "BPE",
            "vocab_size": len(self.token_to_id),
            "num_merges": len(self.merges),
            "target_vocab_size": self.target_vocab_size,
            "special_tokens": {tok: self.token_to_id[tok] for tok in SPECIAL_TOKENS},
            "byte_tokens": 256,
        }
        with open(meta_path, "w") as f:
            json.dump(meta, f, indent=2)

        logger.info(f"Tokenizer saved: {vocab_path} ({len(self.token_to_id)} tokens, {len(self.merges)} merges)")
        return save_dir

    @classmethod
    def load(cls, path: Optional[Path] = None) -> "BPETokenizer":
        """Load a trained tokenizer from disk."""
        load_dir = Path(path) if path else DEFAULT_VOCAB_DIR
        vocab_path = load_dir / "vocab.json"
        merges_path = load_dir / "merges.json"

        if not vocab_path.exists():
            raise FileNotFoundError(f"No vocabulary found at {vocab_path}")

        with open(vocab_path, "r", encoding="utf-8") as f:
            token_to_id = json.load(f)

        with open(merges_path, "r", encoding="utf-8") as f:
            merges = [tuple(m) for m in json.load(f)]

        tok = cls(vocab_size=len(token_to_id))
        tok.token_to_id = token_to_id
        tok.id_to_token = {v: k for k, v in token_to_id.items()}
        tok.merges = merges
        tok._merge_set = set(merges)
        tok._trained = True

        logger.info(f"Tokenizer loaded: {len(tok.token_to_id)} tokens, {len(tok.merges)} merges")
        return tok

    @property
    def vocab_size(self) -> int:
        return len(self.token_to_id)

    @property
    def is_trained(self) -> bool:
        return self._trained

    def __repr__(self) -> str:
        return f"<BPETokenizer vocab={self.vocab_size} merges={len(self.merges)} trained={self._trained}>"


# ─── Singleton Shared Tokenizer ──────────────────────────────
class SharedTokenizer:
    """
    Singleton accessor for the project-wide BPE tokenizer.
    Auto-loads from checkpoint if available, otherwise returns untrained
    (byte-level only) tokenizer.
    """
    _instance: Optional[BPETokenizer] = None

    @classmethod
    def get(cls, vocab_size: int = DEFAULT_VOCAB_SIZE) -> BPETokenizer:
        """Get or create the shared tokenizer instance."""
        if cls._instance is None:
            try:
                cls._instance = BPETokenizer.load()
                logger.info(f"Shared tokenizer loaded: {cls._instance}")
            except FileNotFoundError:
                cls._instance = BPETokenizer(vocab_size=vocab_size)
                logger.info(f"Shared tokenizer created (untrained): {cls._instance}")
        return cls._instance

    @classmethod
    def reset(cls) -> None:
        """Reset singleton (for testing or retraining)."""
        cls._instance = None

    @classmethod
    def train_on_corpus(cls, corpus_dir: Optional[Path] = None,
                        vocab_size: int = DEFAULT_VOCAB_SIZE) -> BPETokenizer:
        """
        Train the shared tokenizer on the NANO_corpus directory.
        Replaces the existing singleton.
        """
        cls.reset()
        tok = BPETokenizer(vocab_size=vocab_size)

        # Gather corpus texts
        if corpus_dir is None:
            corpus_dir = Path(__file__).parent.parent / "NANO_corpus"
        
        texts = []
        if corpus_dir.exists():
            for f in sorted(corpus_dir.rglob("*.md")):
                try:
                    texts.append(f.read_text(encoding="utf-8", errors="replace"))
                except Exception:
                    continue
            for f in sorted(corpus_dir.rglob("*.txt")):
                try:
                    texts.append(f.read_text(encoding="utf-8", errors="replace"))
                except Exception:
                    continue
            for f in sorted(corpus_dir.rglob("*.py")):
                try:
                    texts.append(f.read_text(encoding="utf-8", errors="replace"))
                except Exception:
                    continue

        if not texts:
            logger.warning("No corpus files found — training on empty corpus")

        logger.info(f"Training shared tokenizer on {len(texts)} files from {corpus_dir}")
        tok.train(texts, verbose=True)
        tok.save()

        cls._instance = tok
        return tok
