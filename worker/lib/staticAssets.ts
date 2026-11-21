const STATIC_ASSET_EXTENSION = /\.(?:avif|bmp|css|gif|html?|ico|jpe?g|js|json|map|md|mjs|mp3|mp4|otf|png|svg|ttf|txt|wasm|webmanifest|webm|webp|woff2?|xml)$/i;

/** True for file-like requests which should never receive an SPA HTML fallback. */
export function isStaticAssetPath(pathname: string): boolean {
  return pathname.startsWith('/assets/') || STATIC_ASSET_EXTENSION.test(pathname);
}
