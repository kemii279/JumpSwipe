<template>
  <div class="home-view">
    <!-- アプリヘッダー -->
    <div class="home-header">
      <div class="header-left">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--accent)"
          stroke-width="2"
        >
          <polygon points="5,3 19,12 5,21" />
          <rect x="19" y="3" width="2" height="18" rx="1" />
        </svg>
        <span class="app-title">JumpSwipe</span>
      </div>
      <div class="header-right">
        <button
          v-if="hasIssues"
          class="btn-maintenance-alert"
          title="不整合が見つかりました"
          @click="$emit('goMaintenance')"
        >
          <span class="material-icons">build_circle</span>
          <span class="badge-dot"></span>
        </button>
        <button id="btn-home-sort" class="btn-sort" @click="descOrder = !descOrder">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="21" y2="18" />
          </svg>
          {{ descOrder ? '降順' : '昇順' }}
        </button>
        <SearchInput placeholder="ライブラリを検索..." @select="$emit('searchSelect', $event)" />
        <button id="btn-home-settings" class="btn-settings" title="設定" @click="showSettings = true">
          <span class="material-icons">settings</span>
        </button>
        <button id="btn-home-add-folder" class="btn-add-folder" @click="showAddDialog">
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 2h9a2 2 0 012 2z" />
            <line x1="12" y1="11" x2="12" y2="17" />
            <line x1="9" y1="14" x2="15" y2="14" />
          </svg>
          フォルダを追加
        </button>
      </div>
    </div>

    <!-- コンテンツスクロールエリア -->
    <div ref="scrollContainerEl" class="home-scroll">
      <!-- ★ ヒーロー動画バナー（ここへ移動） -->
      <div v-if="library.series.length > 0" ref="heroSectionEl" class="hero-section">
        <!-- ① 動画が見つかった場合 -->
        <template v-if="heroVideoUrl">
          <video
            ref="heroVideoEl"
            class="hero-video"
            :src="heroVideoUrl"
            muted
            autoplay
            loop
            playsinline
            preload="auto"
            @loadedmetadata="onHeroMetadata"
          />
          <div class="hero-overlay" />

          <div class="hero-content">
            <div class="hero-info">
              <span class="hero-series-badge">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5,3 19,12 5,21" />
                </svg>
                {{ heroSeriesTitle }}
              </span>
              <h2 class="hero-filename">{{ heroFileName }}</h2>
            </div>
          </div>
        </template>

        <!-- ② 静止画フォールバック -->
        <template v-else-if="heroImageUrl">
          <img :src="heroImageUrl" class="hero-img" alt="シリーズヒーロー画像" />
          <div class="hero-overlay" />

          <div class="hero-content">
            <div class="hero-info">
              <span class="hero-series-badge">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 2h9a2 2 0 012 2z" />
                </svg>
                {{ heroSeriesTitle }}
              </span>
              <h2 class="hero-filename">{{ heroFileName }}</h2>
            </div>
          </div>
        </template>

        <!-- ② 読み込み中スケルトン -->
        <div v-else class="hero-skeleton">
          <div class="skeleton hero-skeleton-inner" />
          <div class="hero-overlay" />
          <div class="hero-content">
            <div class="hero-info">
              <div class="skeleton" style="height: 14px; width: 100px; border-radius: 100px" />
              <div
                class="skeleton"
                style="height: 24px; width: 260px; border-radius: 6px; margin-top: 10px"
              />
            </div>
          </div>
        </div>
      </div>
      <div v-if="library.isLoading" class="content-grid">
        <div v-for="i in 9" :key="i" class="skeleton-card">
          <div class="skeleton" style="aspect-ratio: 16/9; border-radius: 8px" />
          <div
            class="skeleton"
            style="height: 14px; border-radius: 4px; margin-top: 8px; width: 80%"
          />
          <div
            class="skeleton"
            style="height: 14px; border-radius: 4px; margin-top: 4px; width: 55%"
          />
        </div>
      </div>

      <div v-else-if="seriesItems.length === 0" class="empty-state">
        <svg
          width="56"
          height="56"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="0.8"
        >
          <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 2h9a2 2 0 012 2z" />
        </svg>
        <p class="empty-title">シリーズがありません</p>
        <p class="empty-sub">「フォルダを追加」から動画フォルダを登録してください</p>
        <button id="btn-empty-add" class="btn-empty-add" @click="showAddDialog">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          フォルダを追加
        </button>
      </div>

      <div v-else class="content-grid">
        <ContentCard
          v-for="item in sortedItems"
          :key="item.id"
          :item="item"
          :removable="true"
          @click="onSeriesClick"
          @remove="onRemoveSeries"
        />
      </div>
    </div>

    <!-- 設定モーダル -->
    <SettingsModal :visible="showSettings" @close="showSettings = false" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import type { SeriesEntry, MediaItem, SearchResult } from '../../../types/media'
import { DEFAULT_SEEK_TIME } from '../../../types/media'
import { useLibraryStore } from '../stores/libraryStore'
import { usePlayerStore } from '../stores/playerStore'
import { fileToMediaUrl } from '../utils/thumbnail'
import ContentCard from '../components/ContentCard.vue'
import SearchInput from '../components/SearchInput.vue'
import SettingsModal from '../components/SettingsModal.vue'

const library = useLibraryStore()
const player = usePlayerStore()

const emit = defineEmits<{
  selectSeries: [series: SeriesEntry]
  goMaintenance: []
  searchSelect: [result: SearchResult]
}>()

const scrollContainerEl = ref<HTMLDivElement>()
const showSettings = ref(false)
const descOrder = ref(localStorage.getItem('mvr_home_desc_order') === 'true')

watch(descOrder, (val) => {
  localStorage.setItem('mvr_home_desc_order', val.toString())
})

// ---- ヒーロー動画 ----
const heroSectionEl = ref<HTMLDivElement>()
const heroVideoEl = ref<HTMLVideoElement>()
const heroVideoUrl = ref('')
const heroImageUrl = ref('')
const heroFilePath = ref('') // 再生ボタン用フルパス
const heroFileName = ref('')
const heroSeriesTitle = ref('')
const heroSeries = ref<SeriesEntry | null>(null)
const heroSeekTime = ref(0)

// プレイヤーが開いている間はヒーローを一時停止（負荷軽減）
watch(
  () => player.isModalOpen,
  (open) => {
    if (!heroVideoEl.value) return
    if (open) {
      heroVideoEl.value.pause()
    } else {
      // プレイヤーを閉じたら再生（IntersectionObserverにより見えている時のみ実際に動く）
      heroVideoEl.value.play().catch(() => {})
    }
  }
)

/**
 * シリーズを順に探索し、サムネイルキャッシュに seekTime が記録されている
 * 最初の動画を返す。見つからなければ最初の動画（seekTime=0）を返す。
 */
async function findHeroVideo(): Promise<void> {
  heroVideoUrl.value = ''
  heroImageUrl.value = ''

  let fallbackResult: any = null
  let fallbackSeries: SeriesEntry | null = null

  for (const s of library.series) {
    const result = await window.api.findFirstVideo(s.folderPath, { preferVideo: true })
    if (!result || (!result.filePath && !result.thumbnailBase64)) continue

    const resSeekTime = result.seekTime ?? DEFAULT_SEEK_TIME

    // フォールバックを保存
    if (!fallbackResult) {
      fallbackResult = result
      fallbackSeries = s
    }

    // 手動設定あり（seekTime > 3）の動画を最優先
    if (result.type === 'video' && resSeekTime > DEFAULT_SEEK_TIME) {
      applyHeroContent(result, s)
      return
    }
  }

  // なければ最初に見つかったものを採用
  if (fallbackResult && fallbackSeries) {
    applyHeroContent(fallbackResult, fallbackSeries)
  }
}

function applyHeroContent(result: any, series: SeriesEntry): void {
  heroSeries.value = series
  heroSeriesTitle.value = series.seriesTitle || series.folderPath.split(/[\\/]/).pop() || ''

  /**
   * HEROセクションの表示優先順位:
   * 1. 動画ファイル (filePath + type: 'video')
   *    -> 再生可能な動画がある場合、最優先でビデオプレイヤーを起動。
   * 2. オリジナル画像ファイル (filePath + type: 'image')
   *    -> ユーザー指定またはフォルダ内にある実体画像ファイルを、高画質な HERO として表示。
   * 3. キャッシュ画像 (thumbnailBase64)
   *    -> 実体ファイルが見つからない、またはインデックスにのみ画像がある場合の最終フォールバック。
   */
  if (result.type === 'video' && result.filePath) {
    heroFilePath.value = result.filePath
    heroVideoUrl.value = fileToMediaUrl(result.filePath)
    heroImageUrl.value = ''
    heroFileName.value = result.filePath.split(/[\\/]/).pop() || ''
    heroSeekTime.value = result.seekTime ?? DEFAULT_SEEK_TIME
  } else if (result.filePath) {
    // 高画質な実体ファイル（画像など）を優先表示
    heroVideoUrl.value = ''
    heroImageUrl.value = fileToMediaUrl(result.filePath)
    heroFileName.value = result.filePath.split(/[\\/]/).pop() || ''
    heroSeekTime.value = 0
  } else if (result.thumbnailBase64) {
    // 実体ファイルがない場合のフォールバック（Base64キャッシュ）
    heroVideoUrl.value = ''
    heroImageUrl.value = result.thumbnailBase64
    heroFileName.value = result.fileName || series.folderPath.split(/[\\/]/).pop() || ''
    heroSeekTime.value = 0
  }
}

function onHeroMetadata(): void {
  const v = heroVideoEl.value
  if (!v) return
  // seekTime の地点から再生開始
  if (heroSeekTime.value > 0 && heroSeekTime.value < v.duration) {
    v.currentTime = heroSeekTime.value
  }
  v.muted = true
  // プレイヤーが開いていない時だけ再生を開始
  if (!player.isModalOpen) {
    v.play().catch(() => {
      /* autoplay blocked */
    })
  }
}

// series が読み込まれたら（または変わったら）ヒーロー動画を探す
watch(
  () => library.series,
  (list) => {
    if (list.length > 0) findHeroVideo()
  },
  { immediate: true, deep: false }
)

// ---- スクロール監視 (IntersectionObserver) ----
let observer: IntersectionObserver | null = null

// ---- メンテナンスチェック ----
const hasIssues = ref(false)
async function checkMaintenance(): Promise<void> {
  try {
    const summary = await window.api.scanMaintenance()
    hasIssues.value = summary.issues.length > 0
  } catch (e) {
    console.error('Maintenance scan failed:', e)
  }
}

// ---- カスタムスムーズスクロール ----
let targetScrollTop = 0
let isScrolling = false
let lastSetScrollTop = -1

function cancelSmoothScroll() {
  isScrolling = false
}

function smoothScrollLoop() {
  if (!scrollContainerEl.value || !isScrolling) {
    isScrolling = false
    return
  }

  const current = scrollContainerEl.value.scrollTop

  // 前回プログラムが設定した位置から100px以上ずれている場合（PageDown等での急激なスクロール）はアニメーションをキャンセル
  if (lastSetScrollTop !== -1 && Math.abs(current - lastSetScrollTop) >= 100) {
    isScrolling = false
    return
  }

  const diff = targetScrollTop - current

  if (Math.abs(diff) < 1) {
    scrollContainerEl.value.scrollTop = targetScrollTop
    isScrolling = false
  } else {
    // 0.1 の係数で現在の位置から目標位置へ近づける（Lerp）
    const nextTop = current + diff * 0.1
    scrollContainerEl.value.scrollTop = nextTop
    lastSetScrollTop = scrollContainerEl.value.scrollTop
    requestAnimationFrame(smoothScrollLoop)
  }
}

function handleGlobalKeydown(e: KeyboardEvent) {
  if (player.isModalOpen) return
  if (!scrollContainerEl.value) return

  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault()

    // スクロール中でない場合は現在の位置を基準にする
    if (!isScrolling) {
      targetScrollTop = scrollContainerEl.value.scrollTop
    }

    const delta = e.key === 'ArrowUp' ? -library.settings.scrollSpeed : library.settings.scrollSpeed
    const maxScroll = scrollContainerEl.value.scrollHeight - scrollContainerEl.value.clientHeight

    targetScrollTop = Math.max(0, Math.min(maxScroll, targetScrollTop + delta))

    if (!isScrolling) {
      isScrolling = true
      lastSetScrollTop = scrollContainerEl.value.scrollTop
      requestAnimationFrame(smoothScrollLoop)
    }
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown)
  window.addEventListener('wheel', cancelSmoothScroll, { passive: true })
  window.addEventListener('touchmove', cancelSmoothScroll, { passive: true })
  // 画面表示時に最上部へスクロール
  scrollContainerEl.value?.scrollTo({ top: 0, behavior: 'instant' })
  checkMaintenance()

  observer = new IntersectionObserver(
    (entries) => {
      const isVisible = entries[0].isIntersecting
      if (!isVisible && heroVideoEl.value) {
        heroVideoEl.value.pause()
      } else if (isVisible && heroVideoEl.value) {
        // プレイヤーが開いていない時だけ再生を開始
        if (!player.isModalOpen) {
          heroVideoEl.value.play().catch(() => {})
        }
      }
    },
    { threshold: 0.1 }
  )

  if (heroSectionEl.value) {
    observer.observe(heroSectionEl.value)
  }
})

// ページ離脱時にビデオ停止
onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
  window.removeEventListener('wheel', cancelSmoothScroll)
  window.removeEventListener('touchmove', cancelSmoothScroll)
  if (observer) observer.disconnect()
  if (heroVideoEl.value) {
    heroVideoEl.value.pause()
    heroVideoEl.value.src = ''
    heroVideoEl.value.load() // リソースの確実な解放
  }
})

// ---- グリッド ----
const seriesItems = computed<MediaItem[]>(() =>
  library.series.map((s) => ({
    id: s.id,
    fileName: s.seriesTitle || s.folderPath.split(/[\\/]/).pop() || s.folderPath,
    filePath: s.folderPath,
    type: 'folder' as const,
    title: s.seriesTitle,
    thumbnailBase64: s.seriesThumbnailBase64
  }))
)

const sortedItems = computed(() => {
  const items = [...seriesItems.value]
  return descOrder.value ? items.reverse() : items
})

async function showAddDialog(): Promise<void> {
  const result = await window.api.openFolderDialog()
  if (result.canceled || result.filePaths.length === 0) return
  await library.addSeriesFromFolder(result.filePaths[0])
}

function onSeriesClick(item: MediaItem): void {
  const series = library.series.find((s) => s.id === item.id)
  if (series) emit('selectSeries', series)
}

async function onRemoveSeries(item: MediaItem): Promise<void> {
  if (
    confirm(
      `「${item.title || item.fileName}」の参照をライブラリから削除しますか？\n※実際のファイルは削除されません。`
    )
  ) {
    await library.deleteSeries(item.id)
  }
}
</script>

<style scoped>
.home-view {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-base);
}

/* ==== ヒーローバナー ==== */
.hero-section {
  position: relative;
  width: calc(100% + 40px); /* 左右のパディング分広げる */
  margin: -20px -20px 24px -20px; /* 上左右をネガティブマージンで埋める */
  height: 300px; /* 細目にする */
  flex-shrink: 0;
  overflow: hidden;
  background: #000;
  box-shadow: 0 4px 30px rgba(0, 0, 0, 0.5);
}

.hero-video,
.hero-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.hero-overlay {
  position: absolute;
  inset: 0;
  /* 左右からのグラデーション + 下部の濃いグラデ */
  background:
    linear-gradient(
      to right,
      rgba(0, 0, 0, 0.72) 0%,
      rgba(0, 0, 0, 0.1) 55%,
      rgba(0, 0, 0, 0) 100%
    ),
    linear-gradient(to top, rgba(0, 0, 0, 0.65) 0%, rgba(0, 0, 0, 0) 45%);
  pointer-events: none;
}

/* オーバーレイのコンテンツ */
.hero-content {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 20px 24px;
  gap: 12px;
}

.hero-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.hero-series-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--accent);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.hero-filename {
  font-size: 20px;
  font-weight: 800;
  color: white;
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.6);
  line-height: 1.25;
  max-width: 420px;
  /* 2行まで */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.hero-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.btn-hero-play {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 20px;
  background: white;
  border: none;
  border-radius: var(--radius-md);
  color: #111;
  font-family: inherit;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all 150ms ease;
}
.btn-hero-play:hover {
  background: rgba(255, 255, 255, 0.88);
  transform: scale(1.04);
}

.btn-hero-series {
  display: flex;
  align-items: center;
  padding: 8px 18px;
  background: rgba(255, 255, 255, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: var(--radius-md);
  color: white;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  backdrop-filter: blur(8px);
  transition: all 150ms ease;
}
.btn-hero-series:hover {
  background: rgba(255, 255, 255, 0.25);
}

/* スケルトン状態 */
.hero-skeleton {
  position: relative;
  width: 100%;
  height: 100%;
}
.hero-skeleton-inner {
  position: absolute;
  inset: 0;
  border-radius: 0;
}

/* ==== ヘッダー ==== */
.home-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 20px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-surface);
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.app-title {
  font-size: 15px;
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: -0.3px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-sort {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: all 150ms ease;
}
.btn-sort:hover {
  border-color: var(--accent);
  color: var(--text-primary);
}

.btn-add-folder {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 6px 13px;
  background: var(--accent);
  border: none;
  border-radius: var(--radius-md);
  color: white;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms ease;
}
.btn-add-folder:hover {
  background: var(--accent-light);
  transform: scale(1.03);
}

.btn-maintenance-alert {
  position: relative;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-maintenance-alert:hover {
  color: var(--accent);
}
.btn-maintenance-alert .material-icons {
  font-size: 20px;
}

.btn-settings {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.btn-settings:hover {
  background: var(--bg-card-hover);
  color: var(--text-primary);
  border-color: var(--accent);
}

.btn-settings .material-icons {
  font-size: 18px;
}

.badge-dot {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 8px;
  height: 8px;
  background: var(--danger);
  border-radius: 50%;
  border: 2px solid var(--bg-surface);
}

/* ==== グリッド ==== */
.home-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.content-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 40px 16px;
}

.skeleton-card {
  display: flex;
  flex-direction: column;
}

/* ==== 空状態 ==== */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 80px 40px;
  color: var(--text-muted);
  text-align: center;
}
.empty-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-secondary);
  margin-top: 4px;
}
.empty-sub {
  font-size: 13px;
  color: var(--text-muted);
  max-width: 320px;
  line-height: 1.6;
}
.btn-empty-add {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding: 10px 22px;
  background: var(--accent);
  border: none;
  border-radius: var(--radius-md);
  color: white;
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms ease;
}
.btn-empty-add:hover {
  background: var(--accent-light);
  transform: scale(1.04);
}
</style>
