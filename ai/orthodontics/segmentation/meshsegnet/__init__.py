"""MeshSegNet — per-face tooth segmentation package.

Import explicitly from submodules:
    from ai.orthodontics.segmentation.meshsegnet.infer import MeshSegNetSegmenter
    from ai.orthodontics.segmentation.meshsegnet.preprocess import compute_features
"""

__all__ = ["MeshSegNetSegmenter"]


def __getattr__(name: str):
    if name == "MeshSegNetSegmenter":
        from .infer import MeshSegNetSegmenter
        return MeshSegNetSegmenter
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
