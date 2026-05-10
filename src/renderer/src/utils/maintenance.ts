import type { MaintenanceIssue } from '../../../types/media'
import { nanoid } from 'nanoid'

/**
 * 整合性確認タスク（MaintenanceIssue）をイミュータブルなプレーンオブジェクトとして生成する。
 * Vue の Reactive プロキシを含まないため、そのまま IPC 通信に使用可能。
 */
export function createMaintenanceTask(params: {
  seriesId: string
  folderPath: string
  type: 'FOLDER_GONE' | 'ITEMS_GONE'
  missingCount: number
  seriesTitle?: string
  missingItems?: string[]
  likelyOffline?: boolean
}): Readonly<MaintenanceIssue> {
  const issue: MaintenanceIssue = {
    id: `task-${nanoid(8)}-${Date.now()}`,
    seriesId: params.seriesId,
    folderPath: params.folderPath,
    seriesTitle: params.seriesTitle,
    type: params.type,
    missingCount: params.missingCount,
    likelyOffline: params.likelyOffline ?? false,
    missingItems: params.missingItems ? [...params.missingItems] : undefined
  }

  // 意図しない変更を防ぐために凍結する（開発時用）
  return Object.freeze(issue)
}

/**
 * 既存のオブジェクトをプレーンなイミュータブルオブジェクトに変換する。
 * 主に Vue の Proxy を剥がすために使用。
 */
export function toPlainTask<T>(obj: T): Readonly<T> {
  return Object.freeze(JSON.parse(JSON.stringify(obj)))
}
