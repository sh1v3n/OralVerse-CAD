from __future__ import annotations

import os

from .heuristic import HeuristicSegmenter
from .interface import Segmenter

_SEGMENTER_ENV_KEY = "ORALVERSE_SEGMENTER"


def get_segmenter() -> Segmenter:
    """Return the configured segmenter.  Reads ORALVERSE_SEGMENTER env var.

    Supported values:
      "heuristic"  (default) — rule-based, no GPU needed
      "meshsegnet" — requires MESHSEGNET_WEIGHTS env var pointing to .pt file
    """
    name = os.environ.get(_SEGMENTER_ENV_KEY, "heuristic").lower()
    if name == "heuristic":
        return HeuristicSegmenter()
    if name == "meshsegnet":
        weights = os.environ.get("MESHSEGNET_WEIGHTS")
        if not weights:
            raise ValueError("Set MESHSEGNET_WEIGHTS=/path/to/meshsegnet_upper_best.pt")
        from .meshsegnet import MeshSegNetSegmenter
        return MeshSegNetSegmenter(weights)
    raise ValueError(f"Unknown segmenter: {name!r}.  Set {_SEGMENTER_ENV_KEY}=heuristic or meshsegnet.")
