<template>
  <div class="app-root">
    <!-- ページスタック（フェードアニメーション） -->
    <Transition name="page-fade" mode="out-in">
      <SeriesView
        v-if="currentView === 'series' && currentSeries"
        :key="currentSeries.id"
        :series="currentSeries"
        :initial-target="initialTarget"
        @back="goBack"
        @search-select="handleSearchSelect"
      />
      <MaintenanceView v-else-if="currentView === 'maintenance'" key="maintenance" @back="goBack" />
      <HomeView
        v-else
        key="home"
        @select-series="goToSeries"
        @go-maintenance="goToMaintenance"
        @search-select="handleSearchSelect"
      />
    </Transition>

    <!-- プレイヤーモーダル（全画面に重なる） -->
    <PlayerModal />

    <!-- サイバークリックエフェクトレイヤー -->
    <CyberClickEffectLayer />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useLibraryStore } from './stores/libraryStore'
import HomeView from './views/HomeView.vue'
import SeriesView from './views/SeriesView.vue'
import MaintenanceView from './views/MaintenanceView.vue'
import PlayerModal from './components/PlayerModal.vue'
import CyberClickEffectLayer from './components/effects/CyberClickEffectLayer.vue'
import type { SeriesEntry, SearchResult } from '../../types/media'

const library = useLibraryStore()

type ViewName = 'home' | 'series' | 'maintenance'
const currentView = ref<ViewName>('home')
const currentSeries = ref<SeriesEntry | null>(null)
const initialTarget = ref<SearchResult | null>(null)

function handleGlobalFullscreenShortcuts(e: KeyboardEvent) {
  if (e.key === 'F11' || (e.key === 'f' && !e.ctrlKey && !e.metaKey)) {
    e.preventDefault()
    window.api.toggleFullscreen()
  } else if (e.key === 'Escape') {
    // Escapeは「解除のみ」に限定
    window.api.setFullscreen(false)
  }
}

onMounted(async () => {
  window.addEventListener('keydown', handleGlobalFullscreenShortcuts)
  await library.loadSeries()
  await library.loadSettings()
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalFullscreenShortcuts)
})

function goToSeries(series: SeriesEntry): void {
  initialTarget.value = null
  currentSeries.value = series
  currentView.value = 'series'
}

function handleSearchSelect(result: SearchResult): void {
  console.log('[DEBUG-SEARCH] App.handleSearchSelect:', result)
  if (result.isHomeShortcut) {
    console.log('[DEBUG-SEARCH] Home shortcut detected')
    goBack()
    return
  }

  // 1. まずはIDで検索
  let series = library.series.find((s) => s.id === result.seriesId)

  // 2. 見つからない場合はパスで検索 (IDが古くなっている場合への対策)
  if (!series && result.filePath) {
    console.log('[DEBUG-SEARCH] Series ID not found, trying normalized path-based lookup...')
    
    // 比較用にパスを正規化（小文字化 + スラッシュ統一）するヘルパー
    const normalize = (p: string) => p.replace(/[\\/]/g, '/').toLowerCase().replace(/\/$/, '')
    const targetPath = normalize(result.filePath)

    series = library.series.find((s) => {
      const seriesPath = normalize(s.folderPath)
      // ファイルパスがシリーズフォルダパスで始まっているか確認
      return targetPath.startsWith(seriesPath)
    })
  }

  if (series) {
    console.log('[DEBUG-SEARCH] Found series, switching view:', series.seriesTitle)
    initialTarget.value = { ...result } // クローンして変更を確実に通知
    currentSeries.value = series
    currentView.value = 'series'
  } else {
    console.error('[DEBUG-SEARCH] Series not found for path:', result.filePath)
    // 最終手段: 全シリーズのパスをログに出力してデバッグ
    console.log('[DEBUG-SEARCH] Available series paths:', library.series.map(s => s.folderPath))
  }
}

function goToMaintenance(): void {
  currentView.value = 'maintenance'
}

function goBack(): void {
  currentView.value = 'home'
  currentSeries.value = null
}
</script>

<style>
/* ======================================================
   グローバルデザイントークン（仕様書: ダークテーマ主体）
   ====================================================== */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

/* キーボード操作時などのデフォルトのフォーカス枠（黄色いフチなど）を消去 */
*:focus,
*:focus-visible {
  outline: none !important;
}

:root {
  /* カラーパレット */
  --bg-base: #0a0a0f;
  --bg-surface: #111118;
  --bg-elevated: #1a1a24;
  --bg-card: #14141e;
  --bg-card-hover: #1e1e2a;

  --accent: #6c63ff;
  --accent-light: #8b84ff;
  --accent-glow: rgba(108, 99, 255, 0.35);

  --text-primary: #f0f0f8;
  --text-secondary: #b0b0c8;
  --text-muted: #6060a0;

  --border: rgba(255, 255, 255, 0.08);
  --border-active: rgba(108, 99, 255, 0.5);

  --danger: #ff5c5c;

  /* 影 */
  --shadow-card: 0 4px 24px rgba(0, 0, 0, 0.4);
  --shadow-modal: 0 16px 64px rgba(0, 0, 0, 0.7);

  /* 角丸 */
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --radius-xl: 18px;

  /* トランジション */
  --transition-fast: 0.15s ease;
  --transition-med: 0.25s ease;

  font-family:
    'Inter',
    system-ui,
    -apple-system,
    sans-serif;
  color: var(--text-primary);
  background: var(--bg-base);
}

body {
  background: var(--bg-base);
  color: var(--text-primary);
  overflow: hidden;
}

button {
  font-family: inherit;
  color: inherit;
  cursor: pointer;
}

/* 共通スクロールバー */
::-webkit-scrollbar {
  width: 8px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
}
::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.2);
}

.truncate {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ユーティリティ */
.btn-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  transition: all var(--transition-fast);
}
.btn-icon:hover {
  background: var(--bg-elevated);
  color: var(--text-primary);
}

/* スケルトン */
.skeleton {
  background: linear-gradient(
    90deg,
    var(--bg-elevated) 25%,
    var(--bg-card-hover) 50%,
    var(--bg-elevated) 75%
  );
  background-size: 400% 100%;
  animation: shimmer 1.4s infinite;
  border-radius: var(--radius-md);
}
@keyframes shimmer {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: -100% 0;
  }
}

/* アニメーション */
@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
@keyframes scaleIn {
  from {
    opacity: 0;
    transform: scale(0.96);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

/* ---- ページ遷移アニメーション（暗転フェード） ---- */
.page-fade-enter-active,
.page-fade-leave-active {
  transition:
    opacity 0.22s ease,
    transform 0.22s ease;
}

.page-fade-enter-from {
  opacity: 0;
  transform: scale(0.98);
}

.page-fade-leave-to {
  opacity: 0;
  transform: scale(1.02);
}
</style>

<style scoped>
.app-root {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: var(--bg-base);
}
</style>
