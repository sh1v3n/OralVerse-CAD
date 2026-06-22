"""Backward-compatibility shim — imports everything from infer.py.

Use infer.py directly for new code.
"""
from .infer import MeshSegNetSegmenter

__all__ = ["MeshSegNetSegmenter"]
