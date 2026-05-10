/**
 * サムネイルURLを解決する共通関数
 * - thumbnailBase64 (data:image/webp;base64,...) が存在する場合はそれを返す
 * - なければ filePath を media:// プロトコルURLに変換して返す
 * - どちらも存在しない場合は空文字を返す
 *
 * 仕様書: BASE64メディアと画像パスの場合があるので、
 * サムネイル取得関数はそれを考慮する。また、この関数は
 * カード表示、シリーズ表示でも同様に使用する。
 */
export function resolveThumbnailUrl(thumbnailBase64?: string, filePath?: string): string {
  if (thumbnailBase64) return thumbnailBase64
  if (filePath) return fileToMediaUrl(filePath)
  return ''
}

/**
 * ローカルファイルパスを media:// プロトコルURLに変換する
 */
export function fileToMediaUrl(filePath: string): string {
  // バックスラッシュをスラッシュに変換してエンコード
  return `media://local/${encodeURIComponent(filePath.replace(/\\/g, '/'))}`
}
