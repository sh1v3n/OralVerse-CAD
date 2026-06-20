"""MeshSegNet — graph-based tooth segmentation model.

Architecture (simplified from the 2020 MICCAI paper):

  Input: (F, C_in) per-face features
    ↓
  GraphConvBlock × 3  — local neighbourhood aggregation via k-NN
    ↓
  Global context      — max-pool over all faces → (C_g,) broadcast back to (F, C_g)
    ↓
  Classifier MLP      — (F, C_local + C_g) → (F, num_classes)

Each GraphConvBlock:
  For face i with neighbours j ∈ N(i):
    edge_feat[i,j] = MLP([x_i, x_j - x_i])   — local difference encoding
    x_i'          = max_{j} edge_feat[i,j]    — neighbourhood aggregation

This captures local surface curvature and topology without requiring an
explicit graph library — all operations are dense matrix multiplications.
"""

from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F


class EdgeConv(nn.Module):
    """One EdgeConv block: aggregate k-NN edge features via max-pool."""

    def __init__(self, in_ch: int, out_ch: int) -> None:
        super().__init__()
        self.mlp = nn.Sequential(
            nn.Linear(in_ch * 2, out_ch, bias=False),
            nn.BatchNorm1d(out_ch),
            nn.LeakyReLU(0.2, inplace=True),
            nn.Linear(out_ch, out_ch, bias=False),
            nn.BatchNorm1d(out_ch),
            nn.LeakyReLU(0.2, inplace=True),
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
    """

    def __init__(
        self,
        in_features: int = 9,
        num_classes: int = 17,
        k: int = 6,
    ) -> None:
        super().__init__()
        self.k = k

        # Local feature encoder (3 EdgeConv blocks)
        self.ec1 = EdgeConv(in_features, 64)
        self.ec2 = EdgeConv(64, 128)
        self.ec3 = EdgeConv(128, 256)

        # Combine multi-scale local features
        local_ch = 64 + 128 + 256  # 448

        # Global context MLP (applied after global max-pool)
        self.global_mlp = nn.Sequential(
            nn.Linear(local_ch, 256, bias=False),
            nn.BatchNorm1d(256),
            nn.LeakyReLU(0.2, inplace=True),
        )

        # Per-face classifier
        classifier_in = local_ch + 256  # local + global
        self.classifier = nn.Sequential(
            nn.Linear(classifier_in, 256, bias=False),
            nn.BatchNorm1d(256),
            nn.LeakyReLU(0.2),
            nn.Dropout(0.4),
            nn.Linear(256, 128, bias=False),
            nn.BatchNorm1d(128),
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

        # Global context: max-pool → broadcast
        global_feat = local_feat.max(dim=0)[0]           # (448,)
        global_feat = self.global_mlp(global_feat.unsqueeze(0))  # (1, 256)
        global_feat = global_feat.expand(features.shape[0], -1)  # (F, 256)

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
    """Cross-entropy + Dice loss.

    CE handles per-face accuracy; Dice counters class imbalance (gingiva
    typically accounts for 60–70% of faces, making per-face accuracy easy
    to game without Dice).
    """

    def __init__(self, num_classes: int = 17, ce_weight: float = 0.5) -> None:
        super().__init__()
        self.num_classes = num_classes
        self.ce_weight = ce_weight
        self.ce = nn.CrossEntropyLoss()

    def forward(
        self,
        logits: torch.Tensor,  # (F, num_classes)
        labels: torch.Tensor,  # (F,) long
    ) -> torch.Tensor:
        ce_loss = self.ce(logits, labels)

        probs = F.softmax(logits, dim=-1)               # (F, num_classes)
        one_hot = F.one_hot(labels, self.num_classes).float()  # (F, num_classes)

        intersection = (probs * one_hot).sum(dim=0)     # (num_classes,)
        union = probs.sum(dim=0) + one_hot.sum(dim=0)   # (num_classes,)
        dice = 1.0 - (2.0 * intersection + 1e-6) / (union + 1e-6)
        dice_loss = dice.mean()

        return self.ce_weight * ce_loss + (1.0 - self.ce_weight) * dice_loss
