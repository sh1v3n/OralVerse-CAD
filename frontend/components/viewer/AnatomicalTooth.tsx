"use client";

import { useMemo } from "react";
import { ThreeEvent, useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as THREE from "three";
import {
  isPatientRight,
  toothAsset,
  toothAssetUrl,
} from "@/lib/toothAssets";

interface Props {
  fdi: number;
  color?: string;
  emissive?: string;
  emissiveIntensity?: number;
  opacity?: number;
  onSelect?: (fdi: number) => void;
}

export function AnatomicalTooth({
  fdi,
  color = "#f2ead8",
  emissive = "#000000",
  emissiveIntensity = 0,
  opacity = 1,
  onSelect,
}: Props) {
  const gltf = useLoader(GLTFLoader, toothAssetUrl(fdi));
  const model = useMemo(() => {
    const clone = gltf.scene.clone(true);
    const bounds = new THREE.Box3().setFromObject(clone);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const asset = toothAsset(fdi);

    const targetHeight = asset?.height ?? 1.4;

    const scale = targetHeight / Math.max(size.y, 0.001);
    clone.position.sub(center);
    clone.scale.setScalar(scale);
    clone.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const source = Array.isArray(object.material)
        ? object.material[0]
        : object.material;
      const sourceMaterial = source as THREE.MeshStandardMaterial;
      const material = new THREE.MeshPhysicalMaterial({
        color,
        map: sourceMaterial?.map ?? null,
        normalMap: sourceMaterial?.normalMap ?? null,
        roughness: 0.25,
        metalness: 0.0,
        clearcoat: 0.6,
        clearcoatRoughness: 0.15,
        emissive,
        emissiveIntensity,
        transparent: opacity < 1,
        opacity,
      });
      material.map?.colorSpace && (material.map.colorSpace = THREE.SRGBColorSpace);
      object.material = material;
      object.castShadow = true;
      object.receiveShadow = true;
    });

    return clone;
  }, [color, emissive, emissiveIntensity, fdi, gltf.scene, opacity]);

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    if (!onSelect) return;
    event.stopPropagation();
    onSelect(fdi);
  };

  return (
    <group
      scale={[isPatientRight(fdi) ? -1 : 1, 1, 1]}
      onClick={handleClick}
      onPointerOver={(event) => {
        if (!onSelect) return;
        event.stopPropagation();
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        if (onSelect) document.body.style.cursor = "auto";
      }}
    >
      <primitive object={model} />
    </group>
  );
}
