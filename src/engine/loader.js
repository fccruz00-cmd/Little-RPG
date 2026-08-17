// Image loading with a simple progress counter.

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${src}`));
    // In the single-file build (tools/build_single_file.py) images become
    // data: URIs kept in this map; serving the folder normally it is absent.
    img.src = globalThis.__ASSET_MAP?.[src] ?? src;
  });
}

/**
 * Loads every actor's sprites.
 * @param {string[]} ids slugs under assets/characters/<id>/<anim>.png
 * @param {Record<string, {anims: Record<string, number>}>} manifest
 * @param {(done: number, total: number) => void} [onProgress]
 * @returns {Promise<Record<string, Record<string, {image: HTMLImageElement, frames: number}>>>}
 */
export async function loadActors(ids, manifest, onProgress) {
  const jobs = [];
  for (const id of ids) {
    const entry = manifest[id];
    if (!entry) throw new Error(`unknown sprite: ${id}`);
    for (const [anim, frames] of Object.entries(entry.anims)) {
      jobs.push({ id, anim, frames, src: `assets/characters/${id}/${anim}.png` });
    }
  }

  const out = {};
  let done = 0;
  await Promise.all(jobs.map(async (job) => {
    const image = await loadImage(job.src);
    (out[job.id] ??= {})[job.anim] = { image, frames: job.frames };
    onProgress?.(++done, jobs.length);
  }));
  return out;
}
