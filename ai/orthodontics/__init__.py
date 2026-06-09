"""Constraint-aware orthodontic treatment planning.

The package consumes tooth poses extracted from a reconstructed dental mesh.
PointNet++, MeshSegNet, or another landmark model can provide those poses
without changing the planning pipeline.
"""

from .pipeline import build_treatment_plan

__all__ = ["build_treatment_plan"]
