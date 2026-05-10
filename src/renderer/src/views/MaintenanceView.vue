<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import type { MaintenanceIssue, MaintenanceSummary } from '../../../types/media'
import ToastNotification from '../components/ToastNotification.vue'
import { toPlainTask } from '../utils/maintenance'

const summary = ref<MaintenanceSummary | null>(null)
const loading = ref(false)
// Set は Vue 3 のテンプレートでリアクティブに反応しにくいため Object を使用
const fixingMap = ref<Record<string, boolean>>({})
const toastRef = ref<InstanceType<typeof ToastNotification> | null>(null)

const emit = defineEmits<{
  back: []
}>()

const fetchIssues = async () => {
  loading.value = true
  try {
    summary.value = await window.api.scanMaintenance()
  } catch (e) {
    console.error('Scan failed:', e)
  } finally {
    loading.value = false
  }
}

const applyFix = async (issue: MaintenanceIssue) => {
  if (fixingMap.value[issue.id]) return

  fixingMap.value[issue.id] = true
  try {
    // Proxy オブジェクトを純粋なオブジェクトに変換して IPC に渡す
    const plainIssue = toPlainTask(issue)
    const res = await window.api.applyMaintenanceFix(plainIssue)

    if (res.success) {
      if (summary.value) {
        summary.value.issues = summary.value.issues.filter((i) => i.id !== issue.id)
      }
      toastRef.value?.show(`✓ ${issue.missingCount}件の項目を削除しました`)
    } else {
      alert('修正の適用に失敗しました。ファイルが使用中か、権限がない可能性があります。')
    }
  } catch (e) {
    console.error('Fix failed:', e)
  } finally {
    delete fixingMap.value[issue.id]
  }
}

const applyAll = async () => {
  if (!summary.value || loading.value) return

  const targets = summary.value.issues.filter((i) => !i.likelyOffline)
  if (targets.length === 0) return

  if (!confirm(`${targets.length}件の項目を一括で削除してもよろしいですか？`)) return

  loading.value = true // 一括処理中は入力を防ぐためにローディング状態にする
  const totalPruned = targets.reduce((sum, i) => sum + i.missingCount, 0)

  for (const issue of targets) {
    await applyFix(issue)
  }

  toastRef.value?.show(`✨ 合計 ${totalPruned}件のクリーンアップを完了しました`)
  loading.value = false
}

onMounted(() => {
  fetchIssues()
})

const sortedIssues = computed(() => {
  if (!summary.value) return []
  return [...summary.value.issues].sort((a, b) => {
    // オフラインを後に、確実な消失を前に
    if (a.likelyOffline !== b.likelyOffline) return a.likelyOffline ? 1 : -1
    return b.missingCount - a.missingCount
  })
})

const stats = computed(() => {
  if (!summary.value) return { total: 0, offline: 0, critical: 0 }
  const issues = summary.value.issues
  return {
    total: issues.length,
    offline: issues.filter((i) => i.likelyOffline).length,
    critical: issues.filter((i) => !i.likelyOffline).length
  }
})
</script>

<template>
  <div class="maintenance-view">
    <header class="header">
      <div class="header-left">
        <button class="back-btn" @click="emit('back')">
          <span class="material-icons">arrow_back</span>
        </button>
        <h1>メンテナンスセンター</h1>
      </div>
      <div class="header-actions">
        <button class="refresh-btn" :disabled="loading" @click="fetchIssues">
          <span class="material-icons" :class="{ 'animate-spin': loading }">refresh</span>
          再スキャン
        </button>
        <button v-if="stats.critical > 0" class="apply-all-btn" @click="applyAll">
          一括解決 ({{ stats.critical }}件)
        </button>
      </div>
    </header>

    <div class="content">
      <div v-if="loading && !summary" class="loading-state">
        <div class="spinner"></div>
        <p>不整合をチェック中...</p>
      </div>

      <div v-else-if="stats.total === 0" class="empty-state">
        <span class="material-icons">check_circle</span>
        <p>不整合は見つかりませんでした。ライブラリは正常です。</p>
      </div>

      <div v-else class="dashboard">
        <section class="stats-cards">
          <div class="stat-card critical">
            <span class="value">{{ stats.critical }}</span>
            <span class="label">消失の可能性</span>
          </div>
          <div class="stat-card offline">
            <span class="value">{{ stats.offline }}</span>
            <span class="label">接続切れの可能性</span>
          </div>
        </section>

        <div class="issue-list">
          <div
            v-for="issue in sortedIssues"
            :key="issue.id"
            class="issue-card"
            :class="{ 'is-offline': issue.likelyOffline }"
          >
            <div class="issue-info">
              <div class="issue-title">
                <span class="material-icons">
                  {{ issue.type === 'FOLDER_GONE' ? 'folder_off' : 'movie_filter' }}
                </span>
                <h3>{{ issue.seriesTitle || '名称未設定' }}</h3>
                <span v-if="issue.likelyOffline" class="badge offline">Offline?</span>
                <span v-else class="badge missing">Missing</span>
              </div>
              <p class="issue-path">{{ issue.folderPath }}</p>
              <p class="issue-desc">
                {{
                  issue.type === 'FOLDER_GONE'
                    ? 'フォルダ自体が見つかりません。'
                    : `${issue.missingCount}個のファイルが見つかりません。`
                }}
              </p>
            </div>
            <div class="issue-actions">
              <button
                v-if="issue.likelyOffline"
                class="secondary-btn"
                :disabled="fixingMap[issue.id]"
                @click="applyFix(issue)"
              >
                ライブラリから除外
              </button>
              <button
                v-else
                class="danger-btn"
                :disabled="fixingMap[issue.id]"
                @click="applyFix(issue)"
              >
                {{ fixingMap[issue.id] ? '処理中...' : 'DBエントリを削除' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
    <!-- トースト -->
    <ToastNotification ref="toastRef" />
  </div>
</template>

<style scoped>
.maintenance-view {
  padding: 2rem;
  max-width: 1000px;
  margin: 0 auto;
  color: #e0e0e0;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.back-btn {
  background: rgba(255, 255, 255, 0.1);
  border: none;
  color: white;
  padding: 0.5rem;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
}

.header h1 {
  font-size: 1.5rem;
  font-weight: 600;
  margin: 0;
}

.header-actions {
  display: flex;
  gap: 1rem;
}

.refresh-btn,
.apply-all-btn,
.secondary-btn,
.danger-btn {
  padding: 0.6rem 1.2rem;
  border-radius: 8px;
  border: none;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  transition: all 0.2s;
}

.refresh-btn {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

.apply-all-btn {
  background: #3d5afe;
  color: white;
}

.danger-btn {
  background: #ff5252;
  color: white;
}

.secondary-btn {
  background: rgba(255, 255, 255, 0.1);
  color: #aaa;
}

.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.stats-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
  margin-bottom: 2rem;
}

.stat-card {
  padding: 1.5rem;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.stat-card.critical {
  border-color: #ff525233;
}
.stat-card.offline {
  border-color: #ffd74033;
}

.stat-card .value {
  font-size: 2.5rem;
  font-weight: 700;
}

.stat-card.critical .value {
  color: #ff5252;
}
.stat-card.offline .value {
  color: #ffd740;
}

.issue-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.issue-card {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 1.2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border: 1px solid transparent;
  transition: border 0.2s;
}

.issue-card:hover {
  border-color: rgba(255, 255, 255, 0.2);
}

.issue-card.is-offline {
  opacity: 0.8;
}

.issue-title {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  margin-bottom: 0.4rem;
}

.issue-title h3 {
  margin: 0;
  font-size: 1.1rem;
}

.badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
}

.badge.missing {
  background: #ff525222;
  color: #ff5252;
}
.badge.offline {
  background: #ffd74022;
  color: #ffd740;
}

.issue-path {
  font-size: 0.85rem;
  color: #888;
  margin-bottom: 0.4rem;
  word-break: break-all;
}

.issue-desc {
  font-size: 0.95rem;
  color: #bbb;
}

.loading-state,
.empty-state {
  text-align: center;
  padding: 5rem 0;
  color: #888;
}

.loading-state .spinner {
  width: 40px;
  height: 40px;
  border: 3px solid rgba(255, 255, 255, 0.1);
  border-top-color: #3d5afe;
  border-radius: 50%;
  margin: 0 auto 1rem;
  animation: spin 1s linear infinite;
}

.empty-state .material-icons {
  font-size: 4rem;
  color: #4caf50;
  margin-bottom: 1rem;
}
</style>
