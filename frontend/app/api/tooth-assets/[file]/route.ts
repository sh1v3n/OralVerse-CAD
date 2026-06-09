import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

const ASSET_DIRECTORY = path.resolve(process.cwd(), "../assets/teeth/Teeth Model");

export async function GET(
  _request: Request,
  { params }: { params: { file: string } },
) {
  const file = path.basename(params.file);
  if (!file.endsWith(".glb")) {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const body = await readFile(path.join(ASSET_DIRECTORY, file));
    return new NextResponse(body, {
      headers: {
        "Content-Type": "model/gltf-binary",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
