from __future__ import annotations

import os

from .heuristic import HeuristicSegmenter
from .interface import Segmenter

_SEGMENTER_ENV_KEY = "ORALVERSE_SEGMENTER"
_cached_segmenter: Segmenter | None = None


def get_segmenter() -> Segmenter:
    """Return the configured segmenter, cached after first load.

    Supported values for ORALVERSE_SEGMENTER:
      "heuristic"  (default) — rule-based, no GPU needed
      "meshsegnet" — requires MESHSEGNET_CHECKPOINT_DIR env var
    """
    global _cached_segmenter
    if _cached_segmenter is not None:
        return _cached_segmenter

    name = os.environ.get(_SEGMENTER_ENV_KEY, "heuristic").lower()
    if name == "heuristic":
        _cached_segmenter = HeuristicSegmenter()
    elif name == "meshsegnet":
        weights = (
            os.environ.get("MESHSEGNET_CHECKPOINT_DIR")
            or os.environ.get("MESHSEGNET_WEIGHTS")
        )
        if not weights:
            raise ValueError(
                "Set MESHSEGNET_CHECKPOINT_DIR=/path/to/checkpoints/  "
                "(or MESHSEGNET_WEIGHTS=/path/to/single_arch.pt)"
            )
        from .meshsegnet import MeshSegNetSegmenter
        _cached_segmenter = MeshSegNetSegmenter(weights)
    else:
        raise ValueError(f"Unknown segmenter: {name!r}.  Set {_SEGMENTER_ENV_KEY}=heuristic or meshsegnet.")

    return _cached_segmenter
