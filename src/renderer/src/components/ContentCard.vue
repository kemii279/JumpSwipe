<template>
  <div
    :id="`content-card-${item.id}`"
    ref="cardRef"
    class="content-card"
    :class="{ 'is-watched': isWatched }"
    @click="$emit('click', item)"
  >
    <!-- サムネイルエリア -->
    <div class="card-thumb">
      <!-- ① サムネイル画像が読み込み済み -->
      <img
        v-if="thumbUrl"
        :src="thumbUrl"
        :alt="displayTitle"
        class="thumb-img"
        loading="lazy"
        @error="thumbUrl = ''"
      />

      <!-- ② ローディング中スピナー -->
      <div v-else-if="isLoadingThumb" class="thumb-placeholder">
        <div class="thumb-spinner" />
      </div>

      <!-- ③ サムネなし・ロード完了 → タイプ別アイコン -->
      <div v-else class="thumb-placeholder">
        <svg
          v-if="item.type === 'folder'"
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.2"
        >
          <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 2h9a2 2 0 012 2z" />
        </svg>
        <svg
          v-else-if="item.type === 'video'"
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.2"
        >
          <polygon points="5,3 19,12 5,21" />
        </svg>
        <svg
          v-else-if="item.type === 'image'"
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.2"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21,15 16,10 5,21" />
        </svg>
        <svg
          v-else
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.2"
        >
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      </div>

      <!-- シリーズマーク（フォルダのみ） -->
      <div v-if="item.type === 'folder'" class="series-mark" title="シリーズ">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
        >
          <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 2h9a2 2 0 012 2z" />
        </svg>
      </div>

      <!-- 動画時間バッジ -->
      <div v-if="item.type === 'video' && item.duration" class="duration-badge">
        {{ formatTime(item.duration) }}
      </div>

      <!-- 視聴進捗バー -->
      <div v-if="progressPct > 0" class="progress-bar">
        <div class="progress-fill" :style="{ width: progressPct + '%' }" />
      </div>

      <!-- ★ 参照削除ボタン (HomeView等で有効な場合のみ) -->
      <button
        v-if="removable"
        id="btn-remove-series"
        class="btn-remove-ref"
        title="ライブラリから参照を削除"
        @click.stop="emit('remove', item)"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      <!-- ホバーオーバーレイ -->
      <div class="hover-overlay">
        <div class="play-circle">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linejoin="round"
          >
            <polygon points="6,4 19,12 6,20" />
          </svg>
        </div>
      </div>
    </div>

    <!-- タイトル（2行まで） -->
    <div class="card-meta">
      <p class="card-title">{{ displayTitle }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import type { MediaItem } from '../../../types/media'
import { fileToMediaUrl } from '../utils/thumbnail'
import { formatTime, calcProgress } from '../utils/formatTime'
import { getCachedThumbnail, getFolderThumbnail } from '../utils/thumbnailCache'
import { useLibraryStore } from '../stores/libraryStore'

const props = withDefaults(
  defineProps<{
    item: MediaItem
    removable?: boolean
  }>(),
  {
    removable: false
  }
)

const emit = defineEmits<{
  click: [item: MediaItem]
  remove: [item: MediaItem]
}>()

const library = useLibraryStore()
const thumbUrl = ref('')
const isLoadingThumb = ref(false)
const cardRef = ref<HTMLDivElement | null>(null)
let observer: IntersectionObserver | null = null
const hasResolved = ref(false)

const displayTitle = computed(() => {
  const base = props.item.title || props.item.fileName
  if (props.item.type === 'folder') return base.replace(/^\d+_+/, '') // 先頭の「数値+アンダーバー」の削除
  // 1. 末尾の拡張子を削除
  // 2. 先頭の「数値（1個以上）+ アンダーバー（1個以上）」を削除
  return base
    .replace(/\.[^/.]+$/, '') // 拡張子の削除
    .replace(/^\d+_+/, '') // 先頭の「数値+アンダーバー」の削除
})

const progressPct = computed(() => calcProgress(props.item.watchedSeconds, props.item.duration))
const isWatched = computed(() => progressPct.value >= 90)

/**
 * サムネイルを解決して表示する
 */
async function resolveThumbnail(): Promise<void> {
  if (hasResolved.value) return
  hasResolved.value = true

  isLoadingThumb.value = true
  try {
    if (props.item.type === 'folder') {
      if (props.item.thumbnailBase64) {
        thumbUrl.value = props.item.thumbnailBase64
      } else {
        // フォルダ：配下の最初の動画を探索してサムネ生成
        const resolved = await getFolderThumbnail(props.item.filePath)
        thumbUrl.value = resolved

        // 自動キャッシュ：解決したサムネイルを次回以降のためにインデックスへ保存
        if (resolved && resolved.startsWith('data:')) {
          window.api.setFolderThumbnail({
            folderPath: props.item.filePath,
            thumbnailBase64: resolved
          })
        }
      }
    } else if (props.item.type === 'video') {
      const videoUrl = fileToMediaUrl(props.item.filePath)
      const targetSeekTime = props.item.seekTime ?? 3

      // キャッシュ確認（0.01秒の誤差判定は getCachedThumbnail 内で実施）
      const cached = await getCachedThumbnail(props.item.filePath, videoUrl, targetSeekTime)

      if (cached) {
        thumbUrl.value = cached

        // インデックスの Base64 が古い（または未設定）場合は同期して更新
        if (props.item.thumbnailBase64 !== cached && props.item.seekTime !== undefined) {
          const folder = props.item.filePath.replace(/[\\/][^\\/]+$/, '')
          library.setThumbnail({
            filePath: props.item.filePath,
            fileName: props.item.fileName,
            thumbnailBase64: cached,
            seekTime: targetSeekTime,
            seriesFolderPath: folder
          })
        }
      }
    } else if (props.item.type === 'image') {
      const imageUrl = fileToMediaUrl(props.item.filePath)
      const cached = await getCachedThumbnail(props.item.filePath, imageUrl, 0, 'image')
      if (cached) {
        thumbUrl.value = cached
      } else {
        // フォールバック
        thumbUrl.value = imageUrl
      }
    }
  } finally {
    isLoadingThumb.value = false
  }
}

onMounted(() => {
  // IntersectionObserver で画面内に入ったらサムネ解決
  observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting) {
        resolveThumbnail()
        // 一度読み込んだら監視終了
        if (observer) {
          observer.disconnect()
          observer = null
        }
      }
    },
    {
      rootMargin: '500px', // より手前から読み込み開始 (ユーザー要望により200pxから拡大)
      threshold: 0.01
    }
  )

  if (cardRef.value) {
    observer.observe(cardRef.value)
  }
})

onUnmounted(() => {
  if (observer) {
    observer.disconnect()
  }
})

// アイテムのデータ（特にサムネイルBase64）が外部から更新されたら再取得
watch(
  () => props.item.thumbnailBase64,
  (newBase64) => {
    if (newBase64) {
      thumbUrl.value = newBase64
    } else {
      resolveThumbnail()
    }
  }
)

// ファイルパスが変わった場合も再取得（SeriesView内での移動など）
watch(() => props.item.filePath, resolveThumbnail)
</script>

<style scoped>
.content-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  cursor: pointer;
  /* スクロール高速化のためのコンテキスト制限 */
  contain: layout style;
  will-change: transform;
}

/* ---- サムネイル ---- */
.card-thumb {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 8px;
  overflow: hidden;
  background: var(--bg-elevated);
  transition: transform 200ms ease;
}
.content-card:hover .card-thumb {
  transform: scale(1.03);
}

.thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.thumb-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
}

/* ローディングスピナー */
.thumb-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid rgba(255, 255, 255, 0.1);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* シリーズマーク（左上） */
.series-mark {
  position: absolute;
  top: 0;
  left: 0;
  width: 50px;
  height: 50px;
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  padding: 6px 0 0 6px;
  background: rgba(108, 99, 255, 0.95);
  color: white;
  /* 左上カドに張り付く直角三角形 (0,0)-(100%,0)-(0,100%) */
  clip-path: polygon(0 0, 100% 0, 0 100%);
}

/* 動画時間バッジ（右下） */
.duration-badge {
  position: absolute;
  bottom: 6px;
  right: 6px;
  background: rgba(0, 0, 0, 0.78);
  color: white;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  font-variant-numeric: tabular-nums;
}

/* 視聴進捗バー（最下端） */
.progress-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: rgba(255, 255, 255, 0.18);
}
.progress-fill {
  height: 100%;
  background: var(--accent);
}

/* 削除ボタン（右上） */
.btn-remove-ref {
  position: absolute;
  top: 7px;
  right: 7px;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  transform: scale(0.85);
  transition: all 0.2s ease;
  z-index: 20; /* オーバーレイより上 */
}

.content-card:hover .btn-remove-ref {
  opacity: 1;
  transform: scale(1);
}

.btn-remove-ref:hover {
  background: #ff4d4d;
  border-color: #ff4d4d;
  transform: scale(1.1) !important;
}

/* ホバーオーバーレイ */
.hover-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 250ms ease;
  z-index: 10;
}
.content-card:hover .hover-overlay {
  opacity: 1;
}

.play-circle {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  /* 塗りではなく白の線で表現 */
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.3);
  backdrop-filter: blur(24px);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  padding-left: 2px;
  box-shadow: 0 0 15px rgba(255, 255, 255, 0.2);
  transform: scale(0.6);
  transition: all 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
.content-card:hover .play-circle {
  transform: scale(1);
  border-color: rgba(255, 255, 255, 0.9);
  background: rgba(0, 0, 0, 0.2);
}
.play-circle svg {
  filter: drop-shadow(0 0 4px rgba(255, 255, 255, 0.6));
}

/* ---- タイトル ---- */
.card-meta {
  padding: 0 2px;
}

.card-title {
  font-size: 1.3rem;
  line-height: 2.2rem;
  font-weight: 500;
  color: var(--text-primary);
  /* 最大2行で省略 */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-all;
}

.content-card.is-watched .card-title {
  color: var(--text-muted);
}
</style>
