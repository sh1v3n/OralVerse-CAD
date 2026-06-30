"""MeshSegNet — graph-based tooth segmentation model.

Production architecture (Run 5 validated baseline, 502,033 params):

  Input: (F, C_in) per-face features
    ↓
  EdgeConv × 3  — local neighbourhood aggregation via k-NN (9→64→128→256)
    ↓
  Local features: cat([x1, x2, x3])  →  (F, 448)
  Global context: max-pool over all faces → (448,) → MLP → broadcast (F, 256)
    ↓
  Classifier MLP  — (F, 704) → (F, num_classes)

Each EdgeConv block:
  For face i with neighbours j ∈ N(i):
    edge_feat[i,j] = MLP([x_i, x_j - x_i])   — local difference encoding
    x_i'          = max_{j} edge_feat[i,j]    — neighbourhood aggregation

All normalisation uses LayerNorm — no BatchNorm, no running-stat buffers.
Train and eval forward passes are identical. See docs/research/segmentation_findings.md
for full experiment history and architectural rationale.
"""

from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F


class EdgeConv(nn.Module):
    """One EdgeConv block: aggregate k-NN edge features via max-pool."""

    def __init__(self, in_ch: int, out_ch: int, dropout: float = 0.0) -> None:
        super().__init__()
        # Dropout is appended at the END so the indices of the parametered
        # layers (0-5) are unchanged vs. the original block — this keeps old
        # checkpoints loadable (nn.Dropout has no params and adds no keys).
        self.mlp = nn.Sequential(
            nn.Linear(in_ch * 2, out_ch, bias=False),
            nn.LayerNorm(out_ch),
            nn.LeakyReLU(0.2, inplace=True),
            nn.Linear(out_ch, out_ch, bias=False),
            nn.LayerNorm(out_ch),
            nn.LeakyReLU(0.2, inplace=True),
            nn.Dropout(dropout),
        )

    def forward(self, x: torch.Tensor, knn_idx: torch.Tensor) -> torch.Tensor:
        """
        x       : (F, C_in)
        knn_idx : (F, k)  indices of k nearest neighbours
        returns : (F, out_ch)
        """
        F_, C = x.shape
        k = knn_idx.shape[1]

        # Gather neighbour features: (F, k, C)
        neighbors = x[knn_idx.reshape(-1)].reshape(F_, k, C)

        # Edge features: [x_i repeated, x_j - x_i]
        x_i = x.unsqueeze(1).expand(-1, k, -1)          # (F, k, C)
        edge = torch.cat([x_i, neighbors - x_i], dim=-1) # (F, k, 2C)

        # Apply MLP to each edge, then max-pool over k
        edge = edge.reshape(F_ * k, 2 * C)
        edge = self.mlp(edge).reshape(F_, k, -1)          # (F, k, out_ch)
        out, _ = edge.max(dim=1)                           # (F, out_ch)
        return out


class MeshSegNet(nn.Module):
    """MeshSegNet for per-face tooth segmentation.

    Parameters
    ----------
    in_features : int
        Number of input features per face (default 9).
    num_classes : int
        Number of output classes: 17 per arch (0=gingiva, 1–16=teeth).
    k : int
        Number of nearest neighbours used in EdgeConv (must match dataset).
    dropout : float
        Dropout probability applied inside the EdgeConv encoder and the global
        MLP (the classifier keeps its own fixed 0.4/0.3). Defaults to 0.1; the
        default is intentionally usable so inference (which constructs the model
        without this arg) gets the same architecture — eval() disables dropout.
    """

    def __init__(
        self,
        in_features: int = 9,
        num_classes: int = 17,
        k: int = 6,
        dropout: float = 0.2,
    ) -> None:
        super().__init__()
        self.k = k

        # Local feature encoder (3 EdgeConv blocks)
        self.ec1 = EdgeConv(in_features, 64, dropout=dropout)
        self.ec2 = EdgeConv(64, 128, dropout=dropout)
        self.ec3 = EdgeConv(128, 256, dropout=dropout)

        # Combine multi-scale local features
        local_ch = 64 + 128 + 256  # 448

        # Global context MLP: applied after global max-pool over all faces.
        # Input: max-pool of local_feat → (local_ch,) = (448,).
        # LayerNorm: no running stats, train/eval identical (same reason as EdgeConv).
        self.global_mlp = nn.Sequential(
            nn.Linear(local_ch, 256, bias=False),
            nn.LayerNorm(256),
            nn.LeakyReLU(0.2, inplace=True),
            nn.Dropout(dropout),
        )

        # Per-face classifier
        classifier_in = local_ch + 256  # local + global
        self.classifier = nn.Sequential(
            nn.Linear(classifier_in, 256, bias=False),
            nn.LayerNorm(256),
            nn.LeakyReLU(0.2),
            nn.Dropout(0.4),
            nn.Linear(256, 128, bias=False),
            nn.LayerNorm(128),
            nn.LeakyReLU(0.2),
            nn.Dropout(0.3),
            nn.Linear(128, num_classes),
        )

    def forward(
        self,
        features: torch.Tensor,    # (F, in_features)
        knn_idx: torch.Tensor,     # (F, k)
    ) -> torch.Tensor:             # (F, num_classes)
        x1 = self.ec1(features, knn_idx)  # (F, 64)
        x2 = self.ec2(x1, knn_idx)        # (F, 128)
        x3 = self.ec3(x2, knn_idx)        # (F, 256)

        local_feat = torch.cat([x1, x2, x3], dim=-1)   # (F, 448)

        # Global context: max-pool over all faces → broadcast
        global_feat = local_feat.max(dim=0)[0]                    # (448,)
        global_feat = self.global_mlp(global_feat.unsqueeze(0))   # (1, 256)
        global_feat = global_feat.expand(features.shape[0], -1)   # (F, 256)

        combined = torch.cat([local_feat, global_feat], dim=-1)  # (F, 704)
        return self.classifier(combined)                           # (F, num_classes)

    def predict_labels(
        self,
        features: torch.Tensor,
        knn_idx: torch.Tensor,
    ) -> torch.Tensor:
        """Return (F,) int64 predicted class indices."""
        with torch.no_grad():
            logits = self.forward(features, knn_idx)
        return logits.argmax(dim=-1)


# ── Loss ───────────────────────────────────────────────────────────────────────

class CombinedLoss(nn.Module):
    """Focal cross-entropy + Dice loss.

    The CE term uses *focal* weighting ``(1 - p_t)^gamma`` so easy, abundant
    gingiva faces stop dominating the gradient and the model is forced to learn
    rare classes (wisdom teeth scored 0% DSC under plain CE). Optional per-class
    ``alpha`` weights upweight rare classes further. Dice counters class
    imbalance at the region level (gingiva is typically 60–70% of faces).

    Parameters
    ----------
    num_classes : int
    ce_weight : float
        Blend weight for the (focal) CE term; Dice gets ``1 - ce_weight``.
    gamma : float
        Focal focusing parameter. ``gamma=0`` reduces to plain (optionally
        alpha-weighted) cross-entropy — backward compatible.
    alpha : torch.Tensor | None
        Optional ``(num_classes,)`` per-class weights for the CE term.
    """

    def __init__(
        self,
        num_classes: int = 17,
        ce_weight: float = 0.5,
        gamma: float = 2.0,
        alpha: torch.Tensor | None = None,
    ) -> None:
        super().__init__()
        self.num_classes = num_classes
        self.ce_weight = ce_weight
        self.gamma = gamma
        # Register alpha as a buffer so it moves with .to(device) and is saved.
        if alpha is not None:
            alpha = torch.as_tensor(alpha, dtype=torch.float32)
        self.register_buffer("alpha", alpha)

    def forward(
        self,
        logits: torch.Tensor,  # (F, num_classes)
        labels: torch.Tensor,  # (F,) long
    ) -> torch.Tensor:
        # Per-face (optionally alpha-weighted) cross-entropy, then focal reweight.
        ce = F.cross_entropy(logits, labels, weight=self.alpha, reduction="none")  # (F,)
        if self.gamma > 0:
            pt = torch.exp(-ce)                          # p_t of the true class
            ce_loss = ((1.0 - pt) ** self.gamma * ce).mean()
        else:
            ce_loss = ce.mean()

        probs = F.softmax(logits, dim=-1)               # (F, num_classes)
        one_hot = F.one_hot(labels, self.num_classes).float()  # (F, num_classes)

        intersection = (probs * one_hot).sum(dim=0)     # (num_classes,)
        union = probs.sum(dim=0) + one_hot.sum(dim=0)   # (num_classes,)
        dice = 1.0 - (2.0 * intersection + 1e-6) / (union + 1e-6)
        dice_loss = dice.mean()

        return self.ce_weight * ce_loss + (1.0 - self.ce_weight) * dice_loss
