<template>
  <div class="series-view">
    <!-- 全体をスクロール可能に -->
    <div ref="scrollContainerEl" class="content-scroll">
      <!-- スティッキーナビ（パンくず & 編集） -->
      <div class="sticky-nav">
        <div class="hero-breadcrumb">
          <button id="btn-series-back" class="btn-crumb root-crumb" @click="goToRoot">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
            >
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12,19 5,12 12,5" />
            </svg>
            {{ rootTitle }}
          </button>
          <template v-for="(crumb, i) in folderStack" :key="crumb.path">
            <span class="crumb-sep">›</span>
            <button
              class="btn-crumb"
              :class="{ 'is-current': i === folderStack.length - 1 }"
              @click="goToCrumb(i)"
            >
              {{ crumb.label }}
            </button>
          </template>
        </div>

        <div class="header-actions">
          <SearchInput placeholder="ライブラリを検索..." @select="onSearchSelect" />
          <button class="btn-home" title="設定" @click="showSettings = true">
            <span class="material-icons">settings</span>
          </button>
          <button class="btn-home" title="ホームに戻る" @click="$emit('back')">
            <span class="material-icons">home</span>
          </button>
        </div>
      </div>

      <!-- ★ シリーズヒーロー -->
      <div ref="heroSectionEl" class="series-hero">
        <!-- ① ビデオ表示 -->
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
          <!-- 初回表示演出: 読み込み完了まで不透明、完了後にフェードアウト -->
          <div
            v-if="showHeroCover"
            class="hero-cover"
            :class="{ loading: isHeroChanging }"
            @animationend="showHeroCover = false"
          />
        </template>

        <!-- ② ビデオがない場合の静止画フォールバック -->
        <template v-else>
          <img
            v-if="heroImageUrl"
            :src="heroImageUrl"
            class="hero-img"
            alt="シリーズヒーロー画像"
          />
          <img v-else-if="heroThumb" :src="heroThumb" class="hero-img" alt="シリーズサムネイル" />
          <div v-else class="hero-placeholder">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1"
            >
              <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
            </svg>
          </div>
          <div class="hero-overlay" />
          <!-- 初回表示演出: 画像の場合も同様に読み込み完了まで保持 -->
          <div
            v-if="showHeroCover"
            class="hero-cover"
            :class="{ loading: isHeroChanging }"
            @animationend="showHeroCover = false"
          />
        </template>

        <!-- 情報表示（ユーザーにより非表示化） -->
        <div class="hero-info" style="display: none">
          <h1 class="hero-series-title">{{ currentTitle }}</h1>
          <p class="hero-meta">{{ countLabel }}</p>
        </div>
      </div>

      <!-- ★ シリーズタイトル表示 -->
      <div class="series-title-container">
        <h1 class="elegant-series-title">{{ displaySeriesTitle }}</h1>
      </div>

      <!-- コンテンツ領域 -->
      <div class="grid-body">
        <!-- ローディング -->
        <div v-if="isLoading" class="content-grid">
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

        <!-- 空状態 -->
        <div v-else-if="allItems.length === 0" class="empty-state">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1"
          >
            <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
          </svg>
          <p>コンテンツが見つかりません</p>
        </div>

        <!-- グリッド本体 -->
        <div v-else class="content-grid">
          <ContentCard v-for="item in allItems" :key="item.id" :item="item" @click="onItemClick" />
        </div>
      </div>
    </div>

    <!-- ★ メンテナンス通知バッジ (absolute: レイアウトに影響しない) -->
    <Transition name="badge">
      <div v-if="missingCount > 0" class="maintenance-alert" @click="showMissingModal = true">
        <span class="material-icons">info</span>
        <span class="alert-text">{{ missingCount }}件の不整合エントリがあります</span>
        <button class="btn-prune" :disabled="isLoading" @click.stop="pruneCurrentFolder">
          {{ isLoading ? '処理中...' : 'クリーンアップ' }}
        </button>
      </div>
    </Transition>

    <!-- シリーズ編集モーダル -->
    <SeriesEditModal
      :visible="showEdit"
      :series-id="series.id"
      :initial-title="series.seriesTitle"
      :initial-thumbnail="series.seriesThumbnailBase64"
      @close="showEdit = false"
      @save="onSaveEdit"
    />

    <!-- トースト -->
    <ToastNotification ref="toastRef" />

    <!-- 不整合リストモーダル -->
    <Teleport to="body">
      <div v-if="showMissingModal" class="modal-overlay" @click.self="showMissingModal = false">
        <div class="missing-modal">
          <header class="modal-header">
            <div class="header-title">
              <span class="material-icons warn-icon">warning</span>
              <h2>不整合ファイルリスト</h2>
            </div>
            <button class="close-btn" @click="showMissingModal = false">
              <span class="material-icons">close</span>
            </button>
          </header>

          <div class="modal-body">
            <p class="modal-desc">
              以下のファイルはインデックスに登録されていますが、物理ファイルが見つかりません。
              クリーンアップを実行すると、これらのメタデータが削除されます。
            </p>
            <ul class="missing-list">
              <li v-for="item in missingItems" :key="item">
                <span class="material-icons">insert_drive_file</span>
                <span class="file-name">{{ item }}</span>
              </li>
            </ul>
          </div>

          <footer class="modal-footer">
            <button class="secondary-btn" @click="showMissingModal = false">閉じる</button>
            <button class="danger-btn" :disabled="isLoading" @click="pruneCurrentFolder">
              {{ isLoading ? '処理中...' : 'クリーンアップを実行' }}
            </button>
          </footer>
        </div>
      </div>
    </Teleport>

    <!-- 設定モーダル -->
    <SettingsModal :visible="showSettings" @close="showSettings = false" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import type {
  SeriesEntry,
  MediaItem,
  ScanResult,
  SearchResult,
  FirstVideoResult
} from '../../../types/media'
import { usePlayerStore } from '../stores/playerStore'
import { useLibraryStore } from '../stores/libraryStore'
import { naturalSort } from '../utils/naturalSort'
import { fileToMediaUrl } from '../utils/thumbnail'
import ContentCard from '../components/ContentCard.vue'
import SearchInput from '../components/SearchInput.vue'
import SeriesEditModal from '../components/SeriesEditModal.vue'
import ToastNotification from '../components/ToastNotification.vue'
import SettingsModal from '../components/SettingsModal.vue'
import { createMaintenanceTask } from '../utils/maintenance'

const props = defineProps<{ series: SeriesEntry; initialTarget?: SearchResult | null }>()
const emit = defineEmits<{ back: []; searchSelect: [result: SearchResult] }>()

const player = usePlayerStore()
const library = useLibraryStore()
const toastRef = ref<InstanceType<typeof ToastNotification> | null>(null)
const scrollContainerEl = ref<HTMLDivElement>()

// ---- フォルダナビゲーションスタック ----
interface CrumbEntry {
  path: string
  label: string
}
const folderStack = ref<CrumbEntry[]>([])

const currentFolderPath = computed(() =>
  folderStack.value.length > 0
    ? folderStack.value[folderStack.value.length - 1].path
    : props.series.folderPath
)

// ---- スキャン結果 ----
const folders = ref<MediaItem[]>([])
const videos = ref<MediaItem[]>([])
const images = ref<MediaItem[]>([])
const audios = ref<MediaItem[]>([])
const missingCount = ref(0)
const missingItems = ref<string[]>([])
const isLoading = ref(false)
const showEdit = ref(false)
const showMissingModal = ref(false)
const showSettings = ref(false)
const descOrder = ref(false)

// ---- メンテナンスタイマー管理 ----
let maintenanceTimeoutId: any = null
const clearMaintenanceTimer = () => {
  if (maintenanceTimeoutId) {
    clearTimeout(maintenanceTimeoutId)
    maintenanceTimeoutId = null
  }
}

// ---- ビデオヒーロー ----
const heroSectionEl = ref<HTMLDivElement>()
const heroVideoEl = ref<HTMLVideoElement>()
const heroVideoUrl = ref('')
const heroImageUrl = ref('')
const heroSeekTime = ref(0)
const showHeroCover = ref(false) // 初回・遷移時のフェードカバー
const isHeroChanging = ref(false) // 読み込み中フラグ
let observer: IntersectionObserver | null = null

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

// フォルダ→動画→画像→音声の順（自然順ソート済み）
const allItems = computed(() => {
  const sortFn = (items: MediaItem[]) => {
    const sorted = naturalSort(items, (e) => e.fileName)
    return descOrder.value ? [...sorted].reverse() : sorted
  }
  const result = [
    ...sortFn(folders.value),
    ...sortFn(videos.value),
    ...sortFn(images.value),
    ...sortFn(audios.value)
  ]
  return result
})

// ---- 表示テキスト ----
const rootTitle = computed(
  () =>
    props.series.seriesTitle ||
    props.series.folderPath.split(/[\\/]/).pop() ||
    props.series.folderPath
)

const currentTitle = computed(() => {
  if (folderStack.value.length === 0) return rootTitle.value
  return folderStack.value[folderStack.value.length - 1].label
})

const displaySeriesTitle = computed(() => {
  const base = currentTitle.value
  return base
    .replace(/\.[^/.]+$/, '') // 拡張子の削除
    .replace(/^\d+_+/, '') // 先頭の「数値+アンダーバー」の削除
})

const heroThumb = computed(() =>
  folderStack.value.length === 0 ? props.series.seriesThumbnailBase64 || '' : ''
)

const countLabel = computed(() => {
  const parts: string[] = []
  if (folders.value.length > 0) parts.push(`シリーズ ${folders.value.length}`)
  const mediaCount = videos.value.length + images.value.length + audios.value.length
  if (mediaCount > 0) parts.push(`コンテンツ ${mediaCount}`)
  return parts.join('  ·  ') || 'コンテンツなし'
})

// ---- スキャン ----
/**
 * @param path         スキャン対象パス
 * @param options      scanFolder オプション
 * @param maintenanceOnly  true のときは missingCount/missingItems のみ更新
 */
async function scan(
  path: string,
  options: { skipMaintenance?: boolean } = {},
  maintenanceOnly = false
): Promise<void> {
  // 初回（軽量スキャン）の時だけローディングを出す
  if (options.skipMaintenance && !maintenanceOnly) {
    isLoading.value = true
    // HERO情報を一旦リセットし、読み込み完了まで黒いカバーで隠す
    isHeroChanging.value = true
    showHeroCover.value = true
    heroVideoUrl.value = ''
    heroImageUrl.value = ''
  }

  try {
    const result: ScanResult = await window.api.scanFolder(path, options)

    // 非同期処理中にフォルダが変わっていたら結果を捨てて競合を防ぐ
    if (path !== currentFolderPath.value) {
      return
    }

    if (!maintenanceOnly) {
      // コンテンツ用スキャン時のみグリッドデータを更新
      folders.value = result.folders
      videos.value = result.videos
      images.value = result.images
      audios.value = result.audios

      // 【仮説2への対策】スキャン結果に含まれるヒーロー情報を即座に反映
      if (result.hero !== undefined) {
        applyHeroContent(result.hero)
      }
    }

    // メンテナンス情報がある場合のみ更新
    if (result.missingCount !== undefined) {
      missingCount.value = result.missingCount
      missingItems.value = result.missingItems || []
    }
  } finally {
    if (options.skipMaintenance && !maintenanceOnly) isLoading.value = false
  }
}

/**
 * 現在のフォルダ内の実体のないエントリを削除
 */
async function pruneCurrentFolder(): Promise<void> {
  if (isLoading.value) return
  if (!confirm('このフォルダ内の実体のないファイル情報を削除してもよろしいですか？')) return

  isLoading.value = true
  try {
    console.log(
      '[SeriesView] Pruning folder:',
      currentFolderPath.value,
      'Missing items:',
      missingItems.value
    )

    // ユーティリティを使用してイミュータブルなタスクを生成
    const issue = createMaintenanceTask({
      seriesId: props.series.id,
      folderPath: currentFolderPath.value,
      seriesTitle: props.series.seriesTitle,
      type: 'ITEMS_GONE',
      missingCount: missingCount.value,
      missingItems: missingItems.value
    })

    showMissingModal.value = false
    const count = missingCount.value
    // すでにプレーンなオブジェクトなのでクローンなしで渡せる
    const res = await window.api.applyMaintenanceFix(issue)
    if (res.success) {
      toastRef.value?.show(`✓ ${count}件の項目をクリーンアップしました`)
      await scan(currentFolderPath.value)
    } else {
      toastRef.value?.show('✕ クリーンアップに失敗しました')
    }
  } catch (e) {
    console.error('Prune failed:', e)
  } finally {
    isLoading.value = false
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

  // 前回プログラムが設定した位置から600px以上ずれている場合（手動操作など）はアニメーションをキャンセル
  if (lastSetScrollTop !== -1 && Math.abs(current - lastSetScrollTop) >= 600) {
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
  if (showEdit.value || showMissingModal.value) return
  if (!scrollContainerEl.value) return

  if (e.key === 'ArrowLeft') {
    e.preventDefault()
    if (folderStack.value.length > 0) {
      folderStack.value.pop() // 1つ上の階層へ
    } else {
      emit('back') // ルートの場合はホームに戻る
    }
    return
  }

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

function onSearchSelect(result: SearchResult) {
  if (result.isHomeShortcut) {
    emit('back')
    return
  }

  // すべての検索選択を親 (App.vue) に任せる
  emit('searchSelect', result)
}

async function navigateToTarget(target: SearchResult) {
  console.log(
    '[DEBUG-SEARCH] SeriesView.navigateToTarget start:',
    target.fileName,
    target.targetFolderPath
  )

  // 1. フォルダ階層の展開 (フォルダスタックの構築)
  const root = props.series.folderPath.replace(/[\\/]/g, '/')
  const targetDir = target.targetFolderPath.replace(/[\\/]/g, '/')

  console.log('[DEBUG-SEARCH] Paths:', { root, targetDir })

  if (targetDir.startsWith(root)) {
    const relative = targetDir.slice(root.length).replace(/^[\\/]/, '')
    const segments = relative ? relative.split(/[\\/]/).filter(Boolean) : []
    console.log('[DEBUG-SEARCH] Segments:', segments)

    let current = root
    folderStack.value = segments.map((seg) => {
      current = current.endsWith('/') ? current + seg : current + '/' + seg
      return { path: current, label: seg }
    })
  } else {
    console.warn('[DEBUG-SEARCH] Target directory is outside of series root!')
  }

  // 2. コンテンツのロード
  console.log('[DEBUG-SEARCH] Scanning folder...')
  await scan(target.targetFolderPath, { skipMaintenance: true })
  console.log('[DEBUG-SEARCH] Scan complete. Items count:', allItems.value.length)

  // 3. コンテンツを開く (フォルダ以外の場合のみ)
  if (target.type !== 'folder') {
    // スキャンした後のアイテムリストから該当のファイルを探す
    const targetItem = allItems.value.find((i) => i.fileName === target.fileName)
    console.log('[DEBUG-SEARCH] Target item lookup:', targetItem ? 'Found' : 'Not Found')

    if (targetItem) {
      player.open(targetItem, allItems.value, props.series.folderPath)
    } else {
      console.warn('[DEBUG-SEARCH] Falling back to direct target open')
      const fallback: MediaItem = {
        id: target.id,
        fileName: target.fileName,
        filePath: target.filePath,
        type: target.type,
        title: target.title
      }
      player.open(fallback, [fallback], props.series.folderPath)
    }
  } else {
    console.log('[DEBUG-SEARCH] Target is a folder, navigation complete')
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown)
  window.addEventListener('wheel', cancelSmoothScroll, { passive: true })
  window.addEventListener('touchmove', cancelSmoothScroll, { passive: true })

  // 検索からの遷移対応
  if (props.initialTarget) {
    console.log('[DEBUG-SEARCH] SeriesView onMounted: initialTarget found, navigating...')
    navigateToTarget(props.initialTarget)
  } else {
    // 通常の初期表示
    scan(props.series.folderPath, { skipMaintenance: true })
  }

  // 2. バックグラウンドで不整合スキャンを実行（グリッド再描画なし）
  clearMaintenanceTimer()
  maintenanceTimeoutId = setTimeout(() => {
    scan(currentFolderPath.value, { skipMaintenance: false }, /* maintenanceOnly= */ true)
    maintenanceTimeoutId = null
  }, 1000)

  // スクロール監視
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

  if (heroSectionEl.value) observer.observe(heroSectionEl.value)
})

// 外部（App.vue）から新しい遷移ターゲットが指定されたら追従する
watch(
  () => props.initialTarget,
  (newTarget) => {
    console.log('[DEBUG-SEARCH] initialTarget watch triggered:', newTarget?.fileName)
    if (newTarget) navigateToTarget(newTarget)
  },
  { deep: true }
)

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
  window.removeEventListener('wheel', cancelSmoothScroll)
  window.removeEventListener('touchmove', cancelSmoothScroll)
  clearMaintenanceTimer()
  if (observer) observer.disconnect()
  if (heroVideoEl.value) {
    heroVideoEl.value.pause()
    heroVideoEl.value.src = ''
    heroVideoEl.value.load() // リソースの確実な解放
  }
})

// フォルダスタックが変わったら（階層移動したら）コンテンツとヒーローを更新
watch(
  () => currentFolderPath.value,
  (newPath) => {
    // 1. コンテンツを即座に表示（ヒーロー情報も含まれる）
    scan(newPath, { skipMaintenance: true })

    // 2. バックグラウンドで不整合スキャンを実行（グリッド再描画なし）
    clearMaintenanceTimer()
    maintenanceTimeoutId = setTimeout(() => {
      scan(newPath, { skipMaintenance: false }, /* maintenanceOnly= */ true)
      maintenanceTimeoutId = null
    }, 1000)

    // スクロールを一番上に戻す
    scrollContainerEl.value?.scrollTo({ top: 0, behavior: 'instant' })
  }
)

/**
 * ヒーローコンテンツ（最上部の動画/画像）の情報をUIに反映する
 */
function applyHeroContent(result: FirstVideoResult | null): void {
  isHeroChanging.value = false // 読み込み完了（カバーのフェードを開始させる）
  if (!result) {
    heroVideoUrl.value = ''
    heroImageUrl.value = ''
    return
  }

  /**
   * HEROセクションの表示優先順位:
   * 1. 動画ファイル (filePath + type: 'video')
   *    -> 実体動画ファイルがある場合、それをビデオプレイヤーで再生。
   * 2. オリジナル画像ファイル (filePath + type: 'image')
   *    -> ユーザー指定またはフォルダ内にある高画質な実体画像を優先表示。
   * 3. キャッシュ画像 (thumbnailBase64)
   *    -> 実体ファイルが見当たらない場合の最終フォールバック。
   */
  if (result.type === 'video' && result.filePath) {
    heroVideoUrl.value = fileToMediaUrl(result.filePath)
    heroImageUrl.value = ''
    heroSeekTime.value = result.seekTime ?? 0
  } else if (result.filePath) {
    // 高画質な実体ファイル（画像など）を優先表示
    // 念のため拡張子チェックをして動画なら動画として扱う（フォールバック用）
    const ext = result.filePath.split('.').pop()?.toLowerCase() || ''
    const isVideo = ['mp4', 'webm', 'ogg', 'mov', 'mkv'].includes(ext)

    if (isVideo) {
      heroVideoUrl.value = fileToMediaUrl(result.filePath)
      heroImageUrl.value = ''
      heroSeekTime.value = result.seekTime ?? 0
    } else {
      heroVideoUrl.value = ''
      heroImageUrl.value = fileToMediaUrl(result.filePath) + '?resize=fhd'
      heroSeekTime.value = 0
    }
  } else if (result.thumbnailBase64) {
    // 実体ファイルがない場合の最終手段（Base64キャッシュ）
    heroVideoUrl.value = ''
    heroImageUrl.value = result.thumbnailBase64
    heroSeekTime.value = 0
  }
  showHeroCover.value = true // 毎回必ずカバーを生成
}

function onHeroMetadata(): void {
  const v = heroVideoEl.value
  if (!v) return
  if (heroSeekTime.value > 0 && heroSeekTime.value < v.duration) {
    v.currentTime = heroSeekTime.value
  }
  // プレイヤーが開いていない時だけ再生を開始
  if (!player.isModalOpen) {
    v.play().catch(() => {})
  }
}

// ---- ナビゲーション ----
function onItemClick(item: MediaItem): void {
  if (item.type === 'folder') {
    folderStack.value.push({ path: item.filePath, label: item.fileName })
    // scan(item.filePath) // watch で処理されるため不要
  } else if (item.type === 'video') {
    const playlist = allItems.value.filter((i) => i.type === 'video')
    player.open(item, playlist, currentFolderPath.value)
  } else if (item.type === 'image') {
    player.open(
      item,
      allItems.value.filter((i) => i.type === 'image'),
      currentFolderPath.value
    )
  } else if (item.type === 'audio') {
    player.open(
      item,
      allItems.value.filter((i) => i.type === 'audio'),
      currentFolderPath.value
    )
  }
}

function goToCrumb(index: number): void {
  if (index === folderStack.value.length - 1) return
  folderStack.value = folderStack.value.slice(0, index + 1)
  // scan(...) は watch で処理される
}

function goToRoot(): void {
  if (folderStack.value.length === 0) {
    emit('back')
  } else {
    folderStack.value = []
    // scan(...) は watch で処理される
  }
}

// ---- 編集 ----
async function onSaveEdit(title: string, thumbnailBase64?: string): Promise<void> {
  showEdit.value = false
  await library.setSeriesMeta({
    seriesId: props.series.id,
    seriesTitle: title || undefined,
    seriesThumbnailBase64: thumbnailBase64
  })
  toastRef.value?.show('✓ シリーズ情報を保存しました')
}
</script>

<style scoped>
.series-view {
  position: relative; /* maintenance-alert の absolute 基準 */
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ---- スティッキーナビ（HERO下） ---- */
.sticky-nav {
  position: sticky;
  top: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  /* backdrop-filter はスクロール性能を落とすため廃止し、不透明度を上げた背景色に変更 */
  background: rgba(18, 18, 24, 0.95);
  border-bottom: 1px solid var(--border);
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.7);
}

.nav-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* パンくず */
.hero-breadcrumb {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}
.btn-crumb {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms ease;
  white-space: nowrap;
}
.btn-crumb:hover {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}
.btn-crumb.root-crumb {
  color: white;
  background: rgba(255, 255, 255, 0.08);
}
.btn-crumb.is-current {
  background: rgba(108, 99, 255, 0.2);
  border-color: rgba(108, 99, 255, 0.3);
  color: var(--accent-light);
  cursor: default;
}
.crumb-sep {
  color: rgba(255, 255, 255, 0.2);
  font-size: 14px;
  line-height: 1;
}

/* 編集ボタン */
.btn-edit {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: all 150ms ease;
}
.btn-edit:hover {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

/* ---- スクロールエリア ---- */
.content-scroll {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0; /* HEROを端まで出すために0に */
  /* contain: paint layout は sticky 要素と相性が悪いため削除 */
}

/* ---- シリーズタイトル（HERO直下） ---- */
.series-title-container {
  padding: 60px 40px 30px 40px; /* 上下方向の余白多め */
  text-align: left;
  position: relative;
}

/* サイバー装飾: 上部の細かいシステムテキスト */
.series-title-container::before {
  content: 'SYS.REQ // JUMPSWIPE_ARCHIVE_INITIALIZED';
  position: absolute;
  top: 36px;
  left: 40px;
  font-family: 'Courier New', monospace;
  font-size: 10px;
  color: var(--accent-light);
  letter-spacing: 0.2em;
  opacity: 0.6;
}

.elegant-series-title {
  position: relative;
  display: block;
  width: fit-content;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  /* 固めのゴシック体、太め、文字幅広め */
  font-family: 'Inter', 'Noto Sans JP', 'Hiragino Kaku Gothic ProN', 'BIZ UDPGothic', sans-serif;
  font-size: 2.5rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: #dcecff;
  line-height: 1.7;
  /* サイバー装飾: 文字自体の淡いネオン発光 */
  text-shadow:
    0 0 10px rgba(108, 99, 255, 0.7),
    0 0 24px rgba(108, 99, 255, 0.2);
}

/* サイバー装飾: 下部のグラデーションアクセントライン */
.elegant-series-title::after {
  content: '';
  position: absolute;
  left: -20px;
  bottom: -10px;
  width: calc(100% + 40px);
  height: 1.5px;
  background: linear-gradient(
    90deg,
    var(--accent) 0%,
    rgba(108, 99, 255, 0.2) 80%,
    transparent 100%
  );
  box-shadow: 0 0 8px var(--accent-glow);
}

/* ---- ヒーロー ---- */
.series-hero {
  position: relative;
  width: 100%;
  margin: 0;
  height: 340px;
  flex-shrink: 0;
  overflow: hidden;
  background: var(--bg-surface);
  box-shadow:
    inset 0 20px 40px rgba(0, 0, 0, 0.8),
    0 4px 30px rgba(0, 0, 0, 0.5);
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
  background:
    linear-gradient(to top, rgba(0, 0, 0, 0.8) 0%, rgba(0, 0, 0, 0) 50%),
    linear-gradient(to bottom, rgba(0, 0, 0, 0.6) 0%, rgba(0, 0, 0, 0) 20%);
  pointer-events: none;
}

/* 初回表示のフェードアウトカバー */
.hero-cover {
  position: absolute;
  inset: 0;
  background: var(--bg-base, #0d0d14);
  pointer-events: none;
  z-index: 10;
  animation: hero-cover-fade 0.8s ease-out forwards;
}
/* 読み込み中はアニメーションを停止して不透明を維持 */
.hero-cover.loading {
  animation: none !important;
  opacity: 1 !important;
}
@keyframes hero-cover-fade {
  0% {
    opacity: 1;
  }
  40% {
    opacity: 1;
  } /* 冒頭はしっかり不透明を保持 */
  100% {
    opacity: 0;
  }
}

/* 左下情報 */
.hero-info {
  position: absolute;
  bottom: 16px;
  left: 20px;
  right: 80px;
}
.hero-series-title {
  font-size: 22px;
  font-weight: 800;
  color: white;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
  margin-bottom: 3px;
  line-height: 1.2;
}
.hero-meta {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}

/* ---- グリッドヘッダー ---- */
.grid-header {
  display: flex;
  align-items: center;
  padding: 10px 0 8px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border);
}

/* ---- メンテナンス通知バッジ (absolute: レイアウト非依存) ---- */
.maintenance-alert {
  position: absolute;
  bottom: 24px;
  right: 24px;
  z-index: 50;
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(20, 18, 10, 0.88);
  border: 1px solid rgba(255, 215, 64, 0.35);
  padding: 8px 14px;
  border-radius: 24px;
  cursor: pointer;
  /* backdrop-filter: blur(10px); */
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
  transition:
    background 0.2s,
    border-color 0.2s;
}
.maintenance-alert:hover {
  background: rgba(30, 26, 10, 0.95);
  border-color: rgba(255, 215, 64, 0.6);
}
.maintenance-alert .material-icons {
  font-size: 16px;
  color: #ffd740;
  flex-shrink: 0;
}
.alert-text {
  font-size: 11px;
  font-weight: 600;
  color: #ffd740;
  white-space: nowrap;
}
.btn-prune {
  background: #ffd740;
  color: #000;
  border: none;
  border-radius: 12px;
  padding: 3px 10px;
  font-size: 10px;
  font-weight: 800;
  cursor: pointer;
  flex-shrink: 0;
  transition: opacity 0.15s;
}
.btn-prune:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* バッジ出現アニメーション */
.badge-enter-active {
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;
}
.badge-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.badge-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.badge-leave-to {
  opacity: 0;
  transform: translateY(8px);
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

/* ---- コンテンツグリッド ---- */
.grid-body {
  padding: 16px 20px 40px;
}
.content-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 40px 16px;
  /* グリッド要素が多い場合のレンダリング最適化 */
  contain: layout;
}

/* スケルトン */
.skeleton-card {
  display: flex;
  flex-direction: column;
}

/* 空状態 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 80px 0;
  color: var(--text-muted);
  font-size: 14px;
}
/* .maintenance-alert は上部にまとめて定義済み */
/* ... existing styles ... */
/* モーダルスタイル */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 2000;
  /* backdrop-filter: blur(8px); */
}

.missing-modal {
  background: #1e1e1e;
  width: 90%;
  max-width: 600px;
  max-height: 80vh;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
  animation: modalEnter 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes modalEnter {
  from {
    opacity: 0;
    transform: scale(0.9) translateY(20px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.modal-header {
  padding: 1.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 0.8rem;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.btn-home {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--text-secondary);
  width: 34px;
  height: 34px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-home:hover {
  background: rgba(108, 99, 255, 0.15);
  border-color: var(--accent);
  color: var(--accent);
  transform: translateY(-1px);
}

.btn-home .material-icons {
  font-size: 20px;
}

.warn-icon {
  color: #ffc107;
}

.modal-header h2 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
}

.close-btn {
  background: none;
  border: none;
  color: #888;
  cursor: pointer;
  padding: 4px;
  border-radius: 50%;
  transition: all 0.2s;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

.modal-body {
  padding: 1.5rem;
  overflow-y: auto;
}

.modal-desc {
  color: #aaa;
  margin-bottom: 1.5rem;
  font-size: 0.95rem;
  line-height: 1.5;
}

.missing-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.missing-list li {
  background: rgba(255, 255, 255, 0.03);
  padding: 0.8rem 1rem;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 1rem;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.missing-list .material-icons {
  font-size: 1.2rem;
  color: #666;
}

.file-name {
  font-family: 'Consolas', monospace;
  font-size: 0.9rem;
  word-break: break-all;
  color: #ddd;
}

.modal-footer {
  padding: 1.5rem;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
}

.secondary-btn,
.danger-btn {
  padding: 0.8rem 1.5rem;
  border-radius: 8px;
  border: none;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.secondary-btn {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

.danger-btn {
  background: #ff5252;
  color: white;
}

.secondary-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}
.danger-btn:hover:not(:disabled) {
  background: #ff1744;
}
.danger-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ---- Performance Monitor ---- */
.perf-monitor {
  position: fixed;
  top: 12px;
  right: 12px;
  z-index: 9999;
  background: rgba(10, 12, 18, 0.85);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(0, 255, 255, 0.2);
  border-radius: 8px;
  padding: 10px 14px;
  min-width: 160px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6);
  pointer-events: none; /* UI操作を邪魔しない */
  font-family: 'Consolas', 'Courier New', monospace;
}
.perf-title {
  font-size: 9px;
  font-weight: 800;
  color: #00ffff;
  margin-bottom: 6px;
  letter-spacing: 0.1em;
  opacity: 0.8;
}
.perf-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 3px;
}
.perf-label {
  font-size: 10px;
  color: #888;
}
.perf-value {
  font-size: 11px;
  font-weight: 600;
  color: #fff;
}
.perf-value.is-low {
  color: #ff5252;
  text-shadow: 0 0 5px rgba(255, 82, 82, 0.5);
}
</style>
