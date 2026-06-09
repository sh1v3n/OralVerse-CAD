import type { ToothKind } from "./teeth";

export interface ToothAssetDefinition {
  file: string;
  height: number;
}

const UPPER_ASSETS: Record<number, ToothAssetDefinition> = {
  1: { file: "maxillary_left_central_incisor.glb", height: 1.55 },
  2: { file: "maxillary_lateral_incisor.glb", height: 1.42 },
  3: { file: "maxillary_canine.glb", height: 1.68 },
  4: { file: "maxillary_first_premolar.glb", height: 1.48 },
  5: { file: "maxillary_second_premolar.glb", height: 1.44 },
  6: { file: "maxillary_first_molar.glb", height: 1.42 },
  7: { file: "maxillary_second_molar.glb", height: 1.36 },
  8: { file: "maxillary_third_molar.glb", height: 1.28 },
};

const LOWER_ASSETS: Record<number, ToothAssetDefinition> = {
  1: { file: "mandibular_left_central_incisor.glb", height: 1.38 },
  2: { file: "mandibular_left_lateral_incisor.glb", height: 1.42 },
  3: { file: "mandibular_left_canine.glb", height: 1.62 },
  4: { file: "mandibular_first_premolar.glb", height: 1.46 },
  5: { file: "mandibular_left_second_premolar.glb", height: 1.42 },
  6: { file: "mandibular_first_molar.glb", height: 1.42 },
  7: { file: "mandibular_second_molar.glb", height: 1.35 },
  8: { file: "mandibular_third_molar.glb", height: 1.25 },
};

export function toothAsset(
  fdi: number
): ToothAssetDefinition | undefined {
  const assets = fdi < 30 ? UPPER_ASSETS : LOWER_ASSETS;

  const toothNumber = fdi % 10;

  return assets[toothNumber];
}

export function toothAssetUrl(fdi: number): string {
  const asset = toothAsset(fdi);

  if (!asset) {
    console.warn(`Missing tooth asset for FDI ${fdi}`);

    // fallback asset to prevent GLTFLoader crash
    return "/models/teeth/maxillary_canine.glb";
  }

  return `/models/teeth/${encodeURIComponent(asset.file)}`;
}

export function isPatientRight(fdi: number): boolean {
  return Math.floor(fdi / 10) === 1 || Math.floor(fdi / 10) === 4;
}

export function attachmentSize(
  kind: ToothKind
): [number, number, number] {
  if (kind === "molar") return [0.23, 0.2, 0.09];
  if (kind === "premolar") return [0.2, 0.24, 0.085];

  return [0.17, 0.27, 0.075];
}