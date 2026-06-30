/**
 * Heuristic Mesh Segmenter
 *
 * Splits a monolithic arch BufferGeometry into individual tooth regions + gingiva.
 *
 * Algorithm:
 *   1. Classify each triangle as "crown" or "gingiva" based on Y-position threshold
 *   2. Cluster crown triangles into spatial groups using connected-component analysis
 *   3. Assign FDI labels by mapping each cluster centroid to the ideal arch layout
 *   4. Build individual BufferGeometry objects for each tooth + gingiva
 *
 * The interface is designed so a future ML model can replace this heuristic
 * without changing any downstream code — the output contract is identical.
 */

import * as THREE from "three";
import { TOOTH_LAYOUT, toothKind, isUpper } from "./teeth";
import type { ToothKind } from "./teeth";
import {
  type ToothObject,
  type SegmentationMeta,
  emptyTransform,
  getSegmentationColor,
} from "./toothObjectStore";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SegmentationResult {
  teeth: ToothObject[];
  gingivaGeometry: THREE.BufferGeometry;
}

interface TriangleData {
  index: number;         // triangle index in the source mesh
  centroid: THREE.Vector3;
  normal: THREE.Vector3;
  a: THREE.Vector3;
  b: THREE.Vector3;
  c: THREE.Vector3;
}

// ─── Main Entry ───────────────────────────────────────────────────────────────

/**
 * Segment a monolithic arch geometry into individual teeth + gingiva.
 *
 * @param geometry  The full arch BufferGeometry (indexed or non-indexed)
 * @param arch      "upper" or "lower"
 * @returns         Segmented teeth array + gingiva geometry
 */
export function segmentArch(
  geometry: THREE.BufferGeometry,
  arch: "upper" | "lower",
): SegmentationResult {
  // 1. Extract all triangles
  const triangles = extractTriangles(geometry);
  if (triangles.length === 0) {
    return { teeth: [], gingivaGeometry: new THREE.BufferGeometry() };
  }

  // 2. Compute bounding box to find the gingiva threshold
  const bbox = new THREE.Box3();
  for (const tri of triangles) {
    bbox.expandByPoint(tri.a);
    bbox.expandByPoint(tri.b);
    bbox.expandByPoint(tri.c);
  }

  const yMin = bbox.min.y;
  const yMax = bbox.max.y;
  const yRange = yMax - yMin;

  // For upper arch: gingiva is at the TOP (high Y), crowns are at BOTTOM (low Y)
  // For lower arch: gingiva is at the BOTTOM (low Y), crowns are at TOP (high Y)
  const gingivaThreshold = arch === "upper"
    ? yMax - yRange * 0.35  // top 35% is gingiva
    : yMin + yRange * 0.35; // bottom 35% is gingiva

  // 3. Separate gingiva from crown triangles
  const gingivaTriangles: TriangleData[] = [];
  const crownTriangles: TriangleData[] = [];

  for (const tri of triangles) {
    const isGingiva = arch === "upper"
      ? tri.centroid.y > gingivaThreshold
      : tri.centroid.y < gingivaThreshold;

    if (isGingiva) {
      gingivaTriangles.push(tri);
    } else {
      crownTriangles.push(tri);
    }
  }

  // 4. Build gingiva geometry
  const gingivaGeometry = buildGeometryFromTriangles(crownTriangles.length === 0 ? triangles : gingivaTriangles, geometry);

  // 5. Cluster crown triangles spatially
  const clusters = spatialCluster(crownTriangles, arch);

  // 6. Get ideal positions for FDI assignment (filtered by arch)
  const idealPositions = TOOTH_LAYOUT.filter((t) => isUpper(t.fdi) === (arch === "upper"));

  // 7. Assign FDI labels to each cluster
  const assignedTeeth = assignFdiLabels(clusters, idealPositions, arch, geometry);

  return { teeth: assignedTeeth, gingivaGeometry };
}

// ─── Triangle Extraction ──────────────────────────────────────────────────────

function extractTriangles(geometry: THREE.BufferGeometry): TriangleData[] {
  const posAttr = geometry.getAttribute("position") as THREE.BufferAttribute;
  if (!posAttr) return [];

  const index = geometry.getIndex();
  const triangles: TriangleData[] = [];

  const getVertex = (i: number) =>
    new THREE.Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));

  if (index) {
    // Indexed geometry
    for (let i = 0; i < index.count; i += 3) {
      const ia = index.getX(i);
      const ib = index.getX(i + 1);
      const ic = index.getX(i + 2);
      const a = getVertex(ia);
      const b = getVertex(ib);
      const c = getVertex(ic);
      const centroid = new THREE.Vector3().addVectors(a, b).add(c).divideScalar(3);
      const normal = new THREE.Vector3()
        .crossVectors(
          new THREE.Vector3().subVectors(b, a),
          new THREE.Vector3().subVectors(c, a),
        )
        .normalize();
      triangles.push({ index: i / 3, centroid, normal, a, b, c });
    }
  } else {
    // Non-indexed geometry
    for (let i = 0; i < posAttr.count; i += 3) {
      const a = getVertex(i);
      const b = getVertex(i + 1);
      const c = getVertex(i + 2);
      const centroid = new THREE.Vector3().addVectors(a, b).add(c).divideScalar(3);
      const normal = new THREE.Vector3()
        .crossVectors(
          new THREE.Vector3().subVectors(b, a),
          new THREE.Vector3().subVectors(c, a),
        )
        .normalize();
      triangles.push({ index: i / 3, centroid, normal, a, b, c });
    }
  }

  return triangles;
}

// ─── Spatial Clustering ───────────────────────────────────────────────────────

/**
 * Cluster crown triangles into groups using a grid-based spatial approach.
 * We divide the XZ plane into bins and group adjacent bins.
 */
function spatialCluster(
  triangles: TriangleData[],
  arch: "upper" | "lower",
): TriangleData[][] {
  if (triangles.length === 0) return [];

  // Compute XZ bounds of crown region
  let xMin = Infinity, xMax = -Infinity;
  let zMin = Infinity, zMax = -Infinity;
  for (const tri of triangles) {
    xMin = Math.min(xMin, tri.centroid.x);
    xMax = Math.max(xMax, tri.centroid.x);
    zMin = Math.min(zMin, tri.centroid.z);
    zMax = Math.max(zMax, tri.centroid.z);
  }

  const xRange = xMax - xMin || 1;
  const zRange = zMax - zMin || 1;

  // Grid resolution — ~16 bins across the arch width gives ~14–16 tooth clusters
  // after merging small clusters
  const gridSize = 8;
  const cellW = xRange / gridSize;
  const cellH = zRange / gridSize;

  // Assign each triangle to a grid cell
  const grid = new Map<string, TriangleData[]>();
  for (const tri of triangles) {
    const gx = Math.min(gridSize - 1, Math.floor((tri.centroid.x - xMin) / cellW));
    const gz = Math.min(gridSize - 1, Math.floor((tri.centroid.z - zMin) / cellH));
    const key = `${gx},${gz}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key)!.push(tri);
  }

  // Connected-component analysis on the grid
  // Merge adjacent cells that both have triangles
  const visited = new Set<string>();
  const clusters: TriangleData[][] = [];

  function floodFill(key: string, cluster: TriangleData[]) {
    if (visited.has(key)) return;
    if (!grid.has(key)) return;
    visited.add(key);
    cluster.push(...grid.get(key)!);

    const [gx, gz] = key.split(",").map(Number);
    // Only merge horizontally to avoid merging upper and lower teeth
    // (in the Z direction, teeth are separate)
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = gx + dx;
      const nz = gz + dz;
      if (nx >= 0 && nx < gridSize && nz >= 0 && nz < gridSize) {
        floodFill(`${nx},${nz}`, cluster);
      }
    }
  }

  for (const key of grid.keys()) {
    if (!visited.has(key)) {
      const cluster: TriangleData[] = [];
      floodFill(key, cluster);
      if (cluster.length > 0) clusters.push(cluster);
    }
  }

  // If too few clusters (everything merged), do a finer split using K-means-like approach
  if (clusters.length < 4 && triangles.length > 100) {
    return kMeansSplit(triangles, 14);
  }

  // If way too many clusters, merge nearby small ones
  return mergeSmallClusters(clusters, triangles.length);
}

/**
 * K-means-style split when grid clustering produces too few groups.
 * Initializes seeds along the arch curve, then iterates assignment.
 */
function kMeansSplit(triangles: TriangleData[], k: number): TriangleData[][] {
  // Initialize k seeds spread along the X axis
  let xMin = Infinity, xMax = -Infinity;
  for (const tri of triangles) {
    xMin = Math.min(xMin, tri.centroid.x);
    xMax = Math.max(xMax, tri.centroid.x);
  }

  const seeds: THREE.Vector3[] = [];
  for (let i = 0; i < k; i++) {
    const t = (i + 0.5) / k;
    const x = xMin + t * (xMax - xMin);
    // Find nearest triangle centroid to this X position for initial Z
    let bestDist = Infinity;
    let bestZ = 0, bestY = 0;
    for (const tri of triangles) {
      const dx = Math.abs(tri.centroid.x - x);
      if (dx < bestDist) {
        bestDist = dx;
        bestZ = tri.centroid.z;
        bestY = tri.centroid.y;
      }
    }
    seeds.push(new THREE.Vector3(x, bestY, bestZ));
  }

  // Iterate 8 times
  let assignments = new Array(triangles.length).fill(0);
  for (let iter = 0; iter < 8; iter++) {
    // Assign each triangle to nearest seed
    for (let i = 0; i < triangles.length; i++) {
      let bestDist = Infinity;
      let bestSeed = 0;
      for (let s = 0; s < seeds.length; s++) {
        const d = triangles[i].centroid.distanceToSquared(seeds[s]);
        if (d < bestDist) {
          bestDist = d;
          bestSeed = s;
        }
      }
      assignments[i] = bestSeed;
    }

    // Recompute seeds
    for (let s = 0; s < seeds.length; s++) {
      const members = triangles.filter((_, i) => assignments[i] === s);
      if (members.length === 0) continue;
      const avg = new THREE.Vector3();
      for (const m of members) avg.add(m.centroid);
      avg.divideScalar(members.length);
      seeds[s].copy(avg);
    }
  }

  // Build clusters
  const clusters: TriangleData[][] = Array.from({ length: k }, () => []);
  for (let i = 0; i < triangles.length; i++) {
    clusters[assignments[i]].push(triangles[i]);
  }
  return clusters.filter((c) => c.length > 0);
}

/**
 * Merge clusters that are very small (< 2% of total triangles) into their nearest neighbor.
 */
function mergeSmallClusters(clusters: TriangleData[][], totalTriangles: number): TriangleData[][] {
  const minSize = Math.max(5, Math.floor(totalTriangles * 0.02));
  const result = [...clusters];

  let changed = true;
  while (changed) {
    changed = false;
    for (let i = result.length - 1; i >= 0; i--) {
      if (result[i].length < minSize && result.length > 1) {
        // Find nearest cluster
        const centroid = clusterCentroid(result[i]);
        let bestDist = Infinity;
        let bestIdx = -1;
        for (let j = 0; j < result.length; j++) {
          if (j === i) continue;
          const d = centroid.distanceToSquared(clusterCentroid(result[j]));
          if (d < bestDist) {
            bestDist = d;
            bestIdx = j;
          }
        }
        if (bestIdx >= 0) {
          result[bestIdx].push(...result[i]);
          result.splice(i, 1);
          changed = true;
        }
      }
    }
  }

  return result;
}

function clusterCentroid(triangles: TriangleData[]): THREE.Vector3 {
  const c = new THREE.Vector3();
  for (const tri of triangles) c.add(tri.centroid);
  if (triangles.length > 0) c.divideScalar(triangles.length);
  return c;
}

// ─── FDI Assignment ───────────────────────────────────────────────────────────

function assignFdiLabels(
  clusters: TriangleData[][],
  idealPositions: { fdi: number; position: [number, number, number] }[],
  arch: "upper" | "lower",
  sourceGeometry: THREE.BufferGeometry,
): ToothObject[] {
  if (clusters.length === 0) return [];

  // Compute centroid for each cluster
  const clusterCentroids = clusters.map((c) => clusterCentroid(c));

  // Greedy nearest-match assignment: for each cluster, find the closest unassigned ideal position
  const usedFdis = new Set<number>();
  const teeth: ToothObject[] = [];

  // Sort clusters by X position (left to right from viewer's perspective)
  const sortedIndices = clusterCentroids
    .map((_, i) => i)
    .sort((a, b) => clusterCentroids[a].x - clusterCentroids[b].x);

  // Sort ideal positions by X as well
  const sortedIdeal = [...idealPositions].sort((a, b) => a.position[0] - b.position[0]);

  for (let ci = 0; ci < sortedIndices.length; ci++) {
    const clusterIdx = sortedIndices[ci];
    const centroid = clusterCentroids[clusterIdx];
    const cluster = clusters[clusterIdx];

    // Find closest unused ideal position
    let bestFdi = -1;
    let bestDist = Infinity;
    for (const ideal of sortedIdeal) {
      if (usedFdis.has(ideal.fdi)) continue;
      const idealPos = new THREE.Vector3(...ideal.position);
      const d = centroid.distanceTo(idealPos);
      if (d < bestDist) {
        bestDist = d;
        bestFdi = ideal.fdi;
      }
    }

    // If no ideal position left, assign a synthetic FDI based on index
    if (bestFdi === -1) {
      bestFdi = arch === "upper" ? 11 + ci : 31 + ci;
    }
    usedFdis.add(bestFdi);

    // Build tooth geometry
    const toothGeometry = buildGeometryFromTriangles(cluster, sourceGeometry);

    // Compute bounding box
    toothGeometry.computeBoundingBox();
    const bbox = toothGeometry.boundingBox!.clone();

    teeth.push({
      id: `tooth-${bestFdi}`,
      fdi: bestFdi,
      arch,
      kind: toothKind(bestFdi),
      geometry: toothGeometry,
      centroid: centroid.clone(),
      boundingBox: bbox,
      visible: true,
      transform: emptyTransform(),
      segmentation: {
        confidence: 0.5,
        source: "heuristic",
        color: getSegmentationColor(ci),
        triangleCount: cluster.length,
        verificationState: "auto" as const,
      },
    });
  }

  // Sort by FDI number for consistent ordering
  teeth.sort((a, b) => a.fdi - b.fdi);
  return teeth;
}

// ─── Geometry Construction ────────────────────────────────────────────────────

/**
 * Build a new BufferGeometry from a subset of triangles.
 */
function buildGeometryFromTriangles(
  triangles: TriangleData[],
  _sourceGeometry: THREE.BufferGeometry,
): THREE.BufferGeometry {
  const positions = new Float32Array(triangles.length * 9); // 3 verts × 3 floats
  const normals = new Float32Array(triangles.length * 9);

  for (let i = 0; i < triangles.length; i++) {
    const tri = triangles[i];
    const base = i * 9;

    positions[base] = tri.a.x;
    positions[base + 1] = tri.a.y;
    positions[base + 2] = tri.a.z;
    positions[base + 3] = tri.b.x;
    positions[base + 4] = tri.b.y;
    positions[base + 5] = tri.b.z;
    positions[base + 6] = tri.c.x;
    positions[base + 7] = tri.c.y;
    positions[base + 8] = tri.c.z;

    // Use face normal for all 3 vertices
    normals[base] = tri.normal.x;
    normals[base + 1] = tri.normal.y;
    normals[base + 2] = tri.normal.z;
    normals[base + 3] = tri.normal.x;
    normals[base + 4] = tri.normal.y;
    normals[base + 5] = tri.normal.z;
    normals[base + 6] = tri.normal.x;
    normals[base + 7] = tri.normal.y;
    normals[base + 8] = tri.normal.z;
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geom.computeVertexNormals();
  geom.computeBoundingBox();
  return geom;
}
