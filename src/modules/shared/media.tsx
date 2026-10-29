import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { commands } from "../../bindings";
import { unwrap } from "../../core/db/client";
import { t } from "../../core/i18n";

/** Images already read, as `data:` URLs; the least recently shown go first beyond this many. */
const CACHE_SIZE = 48;
const cache = new Map<string, Promise<string>>();

function cached(path: string): Promise<string> {
  let image = cache.get(path);
  if (image) cache.delete(path);
  else image = commands.mediaRead(path).then(unwrap);
  cache.set(path, image);
  while (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
  return image;
}

/** Asks for an image and copies it into `medias/images/` of the project; returns its path in the project. */
export async function pickImage(multiple = false): Promise<string[]> {
  const chosen = await open({
    title: t("media.choose"),
    multiple,
    filters: [{ name: t("media.images"), extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"] }],
  });
  const files = chosen === null ? [] : Array.isArray(chosen) ? chosen : [chosen];
  const out: string[] = [];
  for (const f of files) out.push(unwrap(await commands.mediaImport(f, "images")));
  return out;
}

export function MediaImage({ path, alt, className }: { path: string; alt: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    cached(path)
      .then((s) => alive && setSrc(s))
      .catch(() => {
        cache.delete(path);
        if (alive) setSrc("");
      });
    return () => {
      alive = false;
    };
  }, [path]);
  if (src === "") return <span className={`media-missing ${className ?? ""}`}>{t("media.missing")}</span>;
  return src ? <img src={src} alt={alt} className={className} /> : <span className={`media-loading ${className ?? ""}`} />;
}

export function clearMediaCache(): void {
  cache.clear();
}
