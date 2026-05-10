/**
 * 秒数を mm:ss 形式にフォーマットする共通関数
 */
export function formatTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '0:00'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * 残り秒数を「残り XX 分」形式にフォーマットする
 */
export function formatRemaining(sec: number): string {
  if (!isFinite(sec) || sec <= 0) return ''
  const m = Math.ceil(sec / 60)
  return `残り${m}分`
}

/**
 * 視聴進捗率を 0〜100 で返す
 */
export function calcProgress(watchedSeconds?: number, duration?: number): number {
  if (!watchedSeconds || !duration || duration === 0) return 0
  return Math.min(100, (watchedSeconds / duration) * 100)
}
