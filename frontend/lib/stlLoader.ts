/**
 * STL Loader & Mesh Processing Utilities (Optimized)
 *
 * Delegates parsing and decimation to Web Worker.
 * Returns both high-resolution and low-resolution optimized BufferGeometries.
 */

import * as THREE from "three";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Target bounding-box span (largest axis) after normalization. */
const TARGET_SPAN = 5.0;

/** Dental STL scans are typically in millimeters with Z-up.
 *  Our Three.js scene uses Y-up, so we rotate -90° around X. */
const DENTAL_ROTATION = new THREE.Matrix4().makeRotationX(-Math.PI / 2);

export interface OptimizedGeometries {
  highRes: THREE.BufferGeometry;
  lowRes: THREE.BufferGeometry;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Load an STL file from a URL, parsing and optimizing it via Web Worker.
 */
export async function loadSTLFromUrl(url: string): Promise<OptimizedGeometries> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`STL fetch failed: ${response.status}`);
  const buffer = await response.arrayBuffer();
  return parseAndOptimizeSTL(buffer);
}

/**
 * Load an STL from a browser File object, parsing and optimizing it via Web Worker.
 */
export async function loadSTLFromFile(file: File): Promise<OptimizedGeometries> {
  const buffer = await file.arrayBuffer();
  return parseAndOptimizeSTL(buffer);
}

/**
 * Re-create Three.js BufferGeometries from Web Worker outputs and normalize their coordinate space.
 */
function parseAndOptimizeSTL(buffer: ArrayBuffer): Promise<OptimizedGeometries> {
  return new Promise((resolve, reject) => {
    // Spin up Web Worker
    const worker = new Worker("/workers/stl-worker.js");

    worker.onmessage = (e) => {
      const { status, high, low, error } = e.data;
      
      // Terminate worker immediately after finishing
      worker.terminate();

      if (status === "error") {
        reject(new Error(error || "Worker failed to process STL"));
        return;
      }

      try {
        // Reconstruct high-res geometry
        const highGeom = new THREE.BufferGeometry();
        highGeom.setAttribute("position", new THREE.BufferAttribute(high.positions, 3));
        highGeom.setAttribute("normal", new THREE.BufferAttribute(high.normals, 3));
        highGeom.setIndex(new THREE.BufferAttribute(high.indices, 1));

        // Reconstruct low-res geometry
        const lowGeom = new THREE.BufferGeometry();
        lowGeom.setAttribute("position", new THREE.BufferAttribute(low.positions, 3));
        lowGeom.setAttribute("normal", new THREE.BufferAttribute(low.normals, 3));
        lowGeom.setIndex(new THREE.BufferAttribute(low.indices, 1));

        // Center, rotate, and scale both geometries identically so they align perfectly
        normalizeGeometriesPair(highGeom, lowGeom);

        resolve({ highRes: highGeom, lowRes: lowGeom });
      } catch (err) {
        reject(err);
      }
    };

    worker.onerror = (err) => {
      worker.terminate();
      reject(err);
    };

    // Send array buffer to worker as Transferable
    worker.postMessage({ buffer, options: { gridResolution: 64 } }, [buffer]);
  });
}

/**
 * Align both high-res and low-res meshes to origin, rotate Z-up to Y-up, and scale uniformly.
 */
export function normalizeGeometriesPair(
  high: THREE.BufferGeometry,
  low: THREE.BufferGeometry
): void {
  // 1. Compute bounding box using high-res
  high.computeBoundingBox();
  const box = high.boundingBox!;
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());

  // 2. Center both at origin
  high.translate(-center.x, -center.y, -center.z);
  low.translate(-center.x, -center.y, -center.z);

  // 3. Apply dental rotation (Z-up → Y-up)
  high.applyMatrix4(DENTAL_ROTATION);
  low.applyMatrix4(DENTAL_ROTATION);

  // 4. Scale both to fit TARGET_SPAN based on high-res dimensions
  const maxDim = Math.max(size.x, size.y, size.z, 0.001);
  const scale = TARGET_SPAN / maxDim;
  high.scale(scale, scale, scale);
  low.scale(scale, scale, scale);

  // 5. Re-center after rotation
  high.computeBoundingBox();
  const newCenter = high.boundingBox!.getCenter(new THREE.Vector3());
  high.translate(-newCenter.x, -newCenter.y, -newCenter.z);
  low.translate(-newCenter.x, -newCenter.y, -newCenter.z);

  // 6. Compute vertex normals
  high.computeVertexNormals();
  low.computeVertexNormals();
}

/**
 * Return mesh statistics for display in the UI.
 */
export function meshStats(geom: THREE.BufferGeometry): {
  vertices: number;
  triangles: number;
  boundingBox: THREE.Box3;
} {
  geom.computeBoundingBox();
  const posAttr = geom.getAttribute("position");
  const indexAttr = geom.getIndex();
  return {
    vertices: posAttr ? posAttr.count : 0,
    triangles: indexAttr ? Math.floor(indexAttr.count / 3) : (posAttr ? Math.floor(posAttr.count / 3) : 0),
    boundingBox: geom.boundingBox!.clone(),
  };
}

