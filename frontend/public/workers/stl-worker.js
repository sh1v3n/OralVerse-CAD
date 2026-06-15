/**
 * Web Worker for parsing STL files and optimizing geometry.
 * Run in a background thread to prevent UI freezing.
 */

self.onmessage = function (e) {
  const { buffer, options } = e.data;
  try {
    // 1. Parse STL from ArrayBuffer
    const { positions, rawNormals } = parseSTL(buffer);

    // 2. Perform vertex deduplication (create indexed geometry)
    const indexedHigh = deduplicateVertices(positions, rawNormals);

    // 3. Perform vertex clustering decimation (create low-res indexed geometry)
    // We target around 15,000 triangles or a grid resolution of 50-60
    const indexedLow = decimateGeometry(indexedHigh, options?.gridResolution || 64);

    // 4. Return results as transferable arrays
    self.postMessage(
      {
        status: "success",
        high: {
          positions: indexedHigh.positions,
          normals: indexedHigh.normals,
          indices: indexedHigh.indices,
        },
        low: {
          positions: indexedLow.positions,
          normals: indexedLow.normals,
          indices: indexedLow.indices,
        },
      },
      [
        indexedHigh.positions.buffer,
        indexedHigh.normals.buffer,
        indexedHigh.indices.buffer,
        indexedLow.positions.buffer,
        indexedLow.normals.buffer,
        indexedLow.indices.buffer,
      ]
    );
  } catch (error) {
    self.postMessage({ status: "error", error: error.message });
  }
};

// ─── STL Parser ───────────────────────────────────────────────────────────────

function parseSTL(buffer) {
  const reader = new DataView(buffer);
  
  // Detect binary or ASCII
  let isBinary = false;
  if (buffer.byteLength > 84) {
    const faceCount = reader.getUint32(80, true);
    // 80 bytes header + 4 bytes faceCount + faceCount * 50 bytes per face
    if (84 + faceCount * 50 === buffer.byteLength) {
      isBinary = true;
    }
  }

  if (isBinary) {
    return parseBinarySTL(reader, buffer);
  } else {
    return parseAsciiSTL(new TextDecoder().decode(buffer));
  }
}

function parseBinarySTL(reader, buffer) {
  const faceCount = reader.getUint32(80, true);
  const positions = new Float32Array(faceCount * 9);
  const rawNormals = new Float32Array(faceCount * 9);

  let offset = 84;
  for (let i = 0; i < faceCount; i++) {
    // Normal (x, y, z)
    const nx = reader.getFloat32(offset, true);
    const ny = reader.getFloat32(offset + 4, true);
    const nz = reader.getFloat32(offset + 8, true);
    offset += 12;

    // 3 Vertices (x, y, z each)
    for (let v = 0; v < 3; v++) {
      const idx = i * 9 + v * 3;
      positions[idx] = reader.getFloat32(offset, true);
      positions[idx + 1] = reader.getFloat32(offset + 4, true);
      positions[idx + 2] = reader.getFloat32(offset + 8, true);
      
      // Store raw normal for each vertex
      rawNormals[idx] = nx;
      rawNormals[idx + 1] = ny;
      rawNormals[idx + 2] = nz;
      
      offset += 12;
    }

    // Attribute byte count (2 bytes)
    offset += 2;
  }

  return { positions, rawNormals };
}

function parseAsciiSTL(text) {
  const lines = text.split("\n");
  const positionsArr = [];
  const normalsArr = [];

  let normal = [0, 0, 0];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("facet normal")) {
      const parts = line.split(/\s+/);
      normal = [parseFloat(parts[2]), parseFloat(parts[3]), parseFloat(parts[4])];
    } else if (line.startsWith("vertex")) {
      const parts = line.split(/\s+/);
      positionsArr.push(parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3]));
      normalsArr.push(normal[0], normal[1], normal[2]);
    }
  }

  return {
    positions: new Float32Array(positionsArr),
    rawNormals: new Float32Array(normalsArr),
  };
}

// ─── Deduplication (Indexed Buffer Geometry) ──────────────────────────────────

function deduplicateVertices(positions, normals) {
  const hashToIdx = new Map();
  const uniqPositions = [];
  const uniqNormals = [];
  const indices = [];

  const count = positions.length / 3;
  let nextIdx = 0;

  for (let i = 0; i < count; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];

    // Build a unique key with limited decimal precision (quantization for welding)
    // Dental scanners have high precision, so 4 decimal places is perfect
    const hash = `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;

    let idx = hashToIdx.get(hash);
    if (idx === undefined) {
      idx = nextIdx++;
      hashToIdx.set(hash, idx);
      
      uniqPositions.push(x, y, z);
      
      // Keep normals
      uniqNormals.push(normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]);
    }

    indices.push(idx);
  }

  return {
    positions: new Float32Array(uniqPositions),
    normals: new Float32Array(uniqNormals),
    indices: new Uint32Array(indices),
  };
}

// ─── Grid Vertex Clustering Decimation ────────────────────────────────────────

function decimateGeometry(indexedGeom, gridResolution) {
  const { positions, normals, indices } = indexedGeom;

  // 1. Find bounding box
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }

  const spanX = maxX - minX || 0.0001;
  const spanY = maxY - minY || 0.0001;
  const spanZ = maxZ - minZ || 0.0001;
  const maxSpan = Math.max(spanX, spanY, spanZ);

  // Cell size for uniform grid
  const cellSize = maxSpan / gridResolution;

  // Maps cell representation hash to new index
  const cellToRep = new Map();
  // Store vertices accumulated in each cell to calculate average position and normal
  const cellPositionsSum = [];
  const cellNormalsSum = [];
  const cellCounts = [];
  let nextRepIdx = 0;

  // Function to compute cell coordinate/hash
  const getCellHash = (x, y, z) => {
    const cx = Math.floor((x - minX) / cellSize);
    const cy = Math.floor((y - minY) / cellSize);
    const cz = Math.floor((z - minZ) / cellSize);
    return `${cx},${cy},${cz}`;
  };

  // Map each original unique vertex to a grid cell representative
  const vertexToNewIdx = new Int32Array(positions.length / 3);

  for (let i = 0; i < positions.length / 3; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    const nx = normals[i * 3];
    const ny = normals[i * 3 + 1];
    const nz = normals[i * 3 + 2];

    const hash = getCellHash(x, y, z);
    let newIdx = cellToRep.get(hash);

    if (newIdx === undefined) {
      newIdx = nextRepIdx++;
      cellToRep.set(hash, newIdx);
      
      cellPositionsSum.push(x, y, z);
      cellNormalsSum.push(nx, ny, nz);
      cellCounts.push(1);
    } else {
      cellPositionsSum[newIdx * 3] += x;
      cellPositionsSum[newIdx * 3 + 1] += y;
      cellPositionsSum[newIdx * 3 + 2] += z;
      cellNormalsSum[newIdx * 3] += nx;
      cellNormalsSum[newIdx * 3 + 1] += ny;
      cellNormalsSum[newIdx * 3 + 2] += nz;
      cellCounts[newIdx]++;
    }

    vertexToNewIdx[i] = newIdx;
  }

  // Calculate averaged position and normal for each cell representative
  const newPositions = new Float32Array(nextRepIdx * 3);
  const newNormals = new Float32Array(nextRepIdx * 3);

  for (let i = 0; i < nextRepIdx; i++) {
    const count = cellCounts[i];
    newPositions[i * 3] = cellPositionsSum[i * 3] / count;
    newPositions[i * 3 + 1] = cellPositionsSum[i * 3 + 1] / count;
    newPositions[i * 3 + 2] = cellPositionsSum[i * 3 + 2] / count;

    // Normalizing normals
    const nx = cellNormalsSum[i * 3] / count;
    const ny = cellNormalsSum[i * 3 + 1] / count;
    const nz = cellNormalsSum[i * 3 + 2] / count;
    const len = Math.sqrt(nx*nx + ny*ny + nz*nz) || 1;
    newNormals[i * 3] = nx / len;
    newNormals[i * 3 + 1] = ny / len;
    newNormals[i * 3 + 2] = nz / len;
  }

  // Remap triangles and filter out degenerated ones (triangles where vertices map to same cell)
  const newIndicesList = [];
  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i];
    const i1 = indices[i + 1];
    const i2 = indices[i + 2];

    const n0 = vertexToNewIdx[i0];
    const n1 = vertexToNewIdx[i1];
    const n2 = vertexToNewIdx[i2];

    // If any two vertices belong to the same cell, it is degenerated
    if (n0 !== n1 && n1 !== n2 && n2 !== n0) {
      newIndicesList.push(n0, n1, n2);
    }
  }

  return {
    positions: newPositions,
    normals: newNormals,
    indices: new Uint32Array(newIndicesList),
  };
}
