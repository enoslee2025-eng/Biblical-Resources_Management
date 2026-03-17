<script setup>
/**
 * 数据中心首页 — 教会风格设计
 * Hero 区域 + 资源统计 + AI导入入口 + 最近编辑
 */
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { getResourceStats } from '@/api/resource'
import { supportedLocales } from '@/i18n'
import { Reading, Notebook, Document, Grid, Clock, Plus, ArrowRight, Upload } from '@element-plus/icons-vue'

const router = useRouter()
const { t, locale } = useI18n()

/** 是否显示语言选择下拉菜单 */
const showLangMenu = ref(false)

/**
 * 切换界面语言
 * 保存到 localStorage 后刷新页面以更新 Element Plus 语言包
 */
function switchLocale(code) {
  showLangMenu.value = false
  if (code === locale.value) return
  locale.value = code
  localStorage.setItem('locale', code)
  window.location.reload()
}

/** 获取当前语言的国旗图标 */
function currentFlag() {
  const found = supportedLocales.find(l => l.code === locale.value)
  return found ? found.flag : '🇨🇳'
}

/** 是否正在加载 */
const loading = ref(true)

/** 统计数据 */
const stats = ref({
  counts: { bible: 0, dictionary: 0, commentary: 0, material: 0 },
  recentEdits: [],
  total: 0
})

/** 资源分类配置 */
const categories = [
  { type: 'bible', titleKey: 'type_bible', descKey: 'type_bible_desc', icon: Reading, path: '/bible', color: '#2b6cb0', image: '/images/card-bible.jpg', editPath: '/bible/edit' },
  { type: 'commentary', titleKey: 'type_commentary', descKey: 'type_commentary_desc', icon: Document, path: '/commentary', color: '#38a169', image: '/images/card-commentary.jpg', editPath: '/commentary/edit' },
  { type: 'dictionary', titleKey: 'type_dictionary', descKey: 'type_dictionary_desc', icon: Notebook, path: '/dictionary', color: '#c88c32', image: '/images/card-dictionary.jpg', editPath: '/dictionary/edit' },
  { type: 'material', titleKey: 'type_material', descKey: 'type_material_desc', icon: Grid, path: '/material', color: '#805ad5', image: '/images/card-material.jpg', editPath: '/material/edit' }
]

/** AI导入入口配置 */
const importEntries = [
  { type: 'bible', titleKey: 'import_title', descKey: 'import_entry_desc', color: '#2b6cb0', path: '/bible/import' },
  { type: 'dictionary', titleKey: 'import_dict_title', descKey: 'import_dict_desc', color: '#c88c32', path: '/dictionary/import' },
  { type: 'commentary', titleKey: 'import_commentary_title', descKey: 'import_commentary_desc', color: '#38a169', path: '/commentary/import' },
  { type: 'material', titleKey: 'import_material_title', descKey: 'import_material_desc', color: '#805ad5', path: '/material/import' }
]

/** 类型对应的图标组件映射 */
const typeIconMap = { bible: Reading, dictionary: Notebook, commentary: Document, material: Grid }

/** 类型对应的颜色映射 */
const typeColorMap = { bible: '#2b6cb0', dictionary: '#c88c32', commentary: '#38a169', material: '#805ad5' }

/** 类型对应的编辑路径 */
const typeEditPath = { bible: '/bible/edit', dictionary: '/dictionary/edit', commentary: '/commentary/edit', material: '/material/edit' }

/** 加载统计数据 */
async function loadStats() {
  loading.value = true
  try {
    const res = await getResourceStats()
    if (res.code === 200) {
      stats.value = res.data
    }
  } catch (e) {
    // 加载失败静默处理
  } finally {
    loading.value = false
  }
}

/** 格式化相对时间 */
function formatTime(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const now = new Date()
  const diff = Math.floor((now - date) / 1000)

  if (diff < 60) return t('time_just_now')
  if (diff < 3600) return t('time_minutes_ago', { count: Math.floor(diff / 60) })
  if (diff < 86400) return t('time_hours_ago', { count: Math.floor(diff / 3600) })

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const dayDiff = Math.floor((today - target) / 86400000)

  if (dayDiff === 0) return t('time_today')
  if (dayDiff === 1) return t('time_yesterday')
  return t('time_days_ago', { count: dayDiff })
}

/** 跳转到资源编辑页 */
function goEdit(resource) {
  const path = typeEditPath[resource.type]
  if (path) {
    router.push(`${path}/${resource.id}`)
  }
}

onMounted(() => {
  loadStats()
})
</script>

<template>
  <div class="data-center" role="main" :aria-label="t('app_title')">

    <!-- ============ Hero 区域 ============ -->
    <section class="hero">
      <div class="hero-overlay"></div>
      <div class="hero-content">
        <p class="hero-eyebrow">{{ t('hero_welcome') }}</p>
        <h1 class="hero-title">{{ t('hero_title') }}</h1>
        <p class="hero-subtitle">{{ t('hero_subtitle') }}</p>
        <button class="btn-church hero-cta" @click="router.push('/bible')">
          {{ t('hero_cta') }} <span class="cta-arrow">&raquo;</span>
        </button>
      </div>

      <!-- 语言切换 -->
      <div class="hero-lang">
        <div class="lang-switcher" @click="showLangMenu = !showLangMenu" role="button" :aria-label="t('switch_lang')">
          <span class="lang-flag">{{ currentFlag() }}</span>
        </div>
        <Teleport to="body">
          <div v-if="showLangMenu" class="lang-overlay" @click="showLangMenu = false"></div>
        </Teleport>
        <div v-if="showLangMenu" class="lang-dropdown" role="listbox" :aria-label="t('switch_lang')">
          <div
            v-for="lang in supportedLocales"
            :key="lang.code"
            class="lang-option"
            :class="{ active: lang.code === locale }"
            @click="switchLocale(lang.code)"
            role="option"
            :aria-selected="lang.code === locale"
          >
            <span class="lang-option-flag">{{ lang.flag }}</span>
            <span class="lang-option-name">{{ lang.name }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- ============ 统计数字卡片 ============ -->
    <section class="section-stats">
      <div class="section-inner section-inner-wide">
        <div class="stat-cards">
          <div
            v-for="cat in categories"
            :key="'stat-' + cat.type"
            class="stat-card"
            @click="router.push(cat.path)"
            role="button"
            :aria-label="t(cat.titleKey)"
          >
            <div class="stat-number" :style="{ color: cat.color }">
              {{ stats.counts[cat.type] || 0 }}
            </div>
            <div class="stat-label">{{ t(cat.titleKey) }}</div>
          </div>
        </div>
      </div>
    </section>

    <!-- ============ 四大板块卡片 ============ -->
    <section class="section-cream">
      <div class="section-inner section-inner-wide">
        <h2 class="section-heading">{{ t('section_resources') }}</h2>
        <div class="module-cards">
          <div
            v-for="cat in categories"
            :key="cat.type"
            class="module-card"
            @click="router.push(cat.path)"
            role="button"
            :aria-label="t(cat.titleKey)"
          >
            <!-- 卡片图片区域 -->
            <div class="module-card-image" :style="{ backgroundImage: `url(${cat.image})` }">
              <div class="module-card-image-overlay"></div>
            </div>
            <!-- 卡片文字区域 -->
            <div class="module-card-body">
              <h3 class="module-card-title">{{ t(cat.titleKey) }}</h3>
              <div class="module-card-divider" :style="{ background: cat.color }"></div>
              <p class="module-card-desc">{{ t(cat.descKey) }}</p>
              <span class="module-card-link" :style="{ color: cat.color }">{{ t('read_more') }} &raquo;</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ============ AI导入入口 ============ -->
    <section class="section-white">
      <div class="section-inner">
        <h2 class="section-heading">{{ t('section_import') }}</h2>
        <div class="import-grid">
          <div
            v-for="entry in importEntries"
            :key="entry.type"
            class="import-card"
            @click="router.push(entry.path)"
            role="button"
            :aria-label="t(entry.titleKey)"
          >
            <div class="import-icon" :style="{ background: entry.color }">
              <el-icon :size="20" color="#fff"><Upload /></el-icon>
            </div>
            <div class="import-info">
              <span class="import-card-title">{{ t(entry.titleKey) }}</span>
              <span class="import-card-desc">{{ t(entry.descKey) }}</span>
            </div>
            <span class="import-arrow">&raquo;</span>
          </div>
        </div>
      </div>
    </section>

    <!-- ============ 最近编辑 ============ -->
    <section class="section-cream">
      <div class="section-inner">
        <div class="recent-header">
          <h2 class="section-heading" style="margin-bottom: 0;">{{ t('dashboard_recent') }}</h2>
          <span class="recent-total" v-if="stats.total > 0">{{ t('dashboard_total', { count: stats.total }) }}</span>
        </div>

        <!-- 加载中 -->
        <div v-if="loading" class="recent-loading">
          <el-skeleton :rows="3" animated />
        </div>

        <!-- 空状态 -->
        <el-empty v-else-if="!stats.recentEdits || stats.recentEdits.length === 0" :description="t('dashboard_recent_empty')" :image-size="80" />

        <!-- 资源列表 -->
        <div v-else class="recent-list">
          <div
            v-for="item in stats.recentEdits"
            :key="item.id"
            class="recent-item"
            @click="goEdit(item)"
            role="button"
            :aria-label="item.title"
          >
            <div class="recent-icon" :style="{ backgroundColor: (typeColorMap[item.type] || '#999') + '12', color: typeColorMap[item.type] || '#999' }">
              <el-icon :size="18"><component :is="typeIconMap[item.type] || Document" /></el-icon>
            </div>
            <div class="recent-info">
              <span class="recent-title">{{ item.title }}</span>
              <span class="recent-meta">
                <span class="recent-type" :style="{ color: typeColorMap[item.type] }">{{ t('type_' + item.type) }}</span>
                <span class="recent-dot">·</span>
                <span class="recent-time">{{ formatTime(item.updatedAt) }}</span>
              </span>
            </div>
            <span class="recent-arrow">&rsaquo;</span>
          </div>
        </div>
      </div>
    </section>

    <!-- ============ CTA 横幅 ============ -->
    <section class="cta-banner">
      <div class="cta-overlay"></div>
      <div class="cta-content">
        <h2 class="cta-title">{{ t('cta_spread') }}</h2>
        <div class="cta-buttons">
          <button class="btn-church" @click="router.push('/bible')">{{ t('hero_cta') }} <span class="cta-arrow">&raquo;</span></button>
          <button class="btn-church-outline" style="color: #fff; border-color: #fff;" @click="router.push('/bible/import')">{{ t('import_title') }} <span class="cta-arrow">&raquo;</span></button>
        </div>
      </div>
    </section>

  </div>
</template>

<style scoped>
.data-center {
  width: 100%;
}

/* ==================== Hero 区域 ==================== */
.hero {
  position: relative;
  height: 420px;
  background: url('/images/hero-bible.svg') center / cover no-repeat;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.hero-overlay {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgba(44, 30, 16, 0.25) 0%, rgba(44, 30, 16, 0.5) 100%);
  pointer-events: none;
}

.hero-content {
  position: relative;
  text-align: center;
  color: #fff;
  padding: 0 32px;
  animation: fadeInUp 0.8s ease-out;
}

.hero-eyebrow {
  font-family: var(--font-heading);
  font-size: 13px;
  font-weight: 400;
  letter-spacing: 6px;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.6);
  margin: 0 0 16px;
}

.hero-title {
  font-family: var(--font-heading);
  font-size: 42px;
  font-weight: 700;
  letter-spacing: 6px;
  line-height: 1.3;
  margin: 0 0 16px;
  text-shadow: 0 2px 16px rgba(0, 0, 0, 0.2);
}

.hero-subtitle {
  font-size: 15px;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.65);
  letter-spacing: 2px;
  margin: 0 0 32px;
}

.hero-cta {
  font-size: 12px;
}

.cta-arrow {
  font-size: 16px;
  line-height: 1;
}

/* 语言切换器（Hero 内） */
.hero-lang {
  position: absolute;
  top: 20px;
  right: 32px;
}

.lang-switcher {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s;
}

.lang-switcher:hover {
  background: rgba(255, 255, 255, 0.25);
}

.lang-flag {
  font-size: 20px;
  line-height: 1;
}

.lang-overlay {
  position: fixed;
  inset: 0;
  z-index: 999;
}

.lang-dropdown {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 8px;
  background: #fff;
  border: 1px solid var(--church-border, #e0d8cf);
  border-radius: 6px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
  padding: 6px;
  z-index: 1000;
  min-width: 180px;
}

.lang-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s;
  color: var(--app-text-primary, #2c2c2c);
}

.lang-option:hover {
  background: var(--church-cream, #f5f0eb);
}

.lang-option.active {
  background: var(--app-primary-light, #edf1f5);
  color: var(--church-navy, #3d5a80);
}

.lang-option-flag {
  font-size: 20px;
  line-height: 1;
}

.lang-option-name {
  font-size: 14px;
  font-weight: 500;
  flex: 1;
}

/* ==================== 统计数字卡片 ==================== */
.section-stats {
  background: #fff;
  padding: 40px 0;
  border-bottom: 1px solid var(--church-border, #d5dce6);
}

.stat-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 24px;
}

.stat-card {
  background: var(--church-cream, #f0f4f8);
  border-radius: 8px;
  padding: 28px 20px;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s ease;
  border: 1px solid transparent;
}

.stat-card:hover {
  border-color: var(--church-border, #d5dce6);
  box-shadow: 0 4px 16px rgba(45, 55, 72, 0.08);
  transform: translateY(-2px);
}

.stat-number {
  font-family: 'Georgia', 'Noto Serif SC', serif;
  font-size: 42px;
  font-weight: 700;
  line-height: 1;
  margin-bottom: 10px;
  letter-spacing: -1px;
}

.stat-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--church-warm-gray, #718096);
  letter-spacing: 2px;
}

/* ==================== 通用 Section ==================== */
.section-cream {
  background: var(--church-cream, #f0f4f8);
  padding: 48px 0;
}

.section-white {
  background: #fff;
  padding: 48px 0;
}

.section-inner {
  max-width: 1000px;
  margin: 0 auto;
  padding: 0 32px;
}

.section-heading {
  font-family: var(--font-heading);
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 4px;
  text-transform: uppercase;
  color: var(--church-charcoal, #3a3a3a);
  margin: 0 0 28px;
  text-align: center;
}

/* ==================== 四大板块卡片（教会风格） ==================== */
.section-inner-wide {
  max-width: 1200px;
}

.module-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 24px;
}

.module-card {
  background: #fff;
  border-radius: 2px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.4s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
}

.module-card:hover {
  transform: translateY(-6px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.12);
}

/* 卡片图片区域 */
.module-card-image {
  position: relative;
  height: 200px;
  background-size: cover;
  background-position: center;
  overflow: hidden;
  transition: transform 0.6s ease;
}

.module-card:hover .module-card-image {
  transform: scale(1.03);
}

.module-card-image-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.08) 100%);
  pointer-events: none;
}

/* 卡片文字区域 */
.module-card-body {
  padding: 28px 24px 32px;
  text-align: center;
  display: flex;
  flex-direction: column;
  flex: 1;
}

.module-card-title {
  font-family: var(--font-heading);
  font-size: 18px;
  font-weight: 800;
  letter-spacing: 5px;
  color: var(--church-charcoal, #3a3a3a);
  margin: 0 0 16px;
}

.module-card-divider {
  width: 36px;
  height: 2px;
  margin: 0 auto 16px;
  border-radius: 1px;
}

.module-card-desc {
  font-size: 13px;
  line-height: 1.8;
  color: var(--church-warm-gray, #8a8178);
  margin: 0 0 20px;
  flex: 1;
}

.module-card-link {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 2px;
  text-transform: uppercase;
  transition: opacity 0.3s;
}

.module-card:hover .module-card-link {
  opacity: 0.7;
}

/* ==================== AI导入网格 ==================== */
.import-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.import-card {
  background: var(--church-cream, #f5f0eb);
  border: 1px solid var(--church-border, #e0d8cf);
  border-radius: 4px;
  padding: 20px 24px;
  display: flex;
  align-items: center;
  gap: 16px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.import-card:hover {
  border-color: var(--church-navy, #3d5a80);
  box-shadow: 0 4px 16px rgba(61, 90, 128, 0.08);
}

.import-icon {
  width: 44px;
  height: 44px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.import-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.import-card-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--church-charcoal, #3a3a3a);
  letter-spacing: 0.5px;
}

.import-card-desc {
  font-size: 12px;
  color: var(--church-warm-gray, #8a8178);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.import-arrow {
  color: var(--church-warm-gray, #8a8178);
  font-size: 18px;
  flex-shrink: 0;
  transition: color 0.2s;
}

.import-card:hover .import-arrow {
  color: var(--church-navy, #3d5a80);
}

/* ==================== 最近编辑 ==================== */
.recent-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}

.recent-total {
  font-size: 13px;
  color: var(--church-warm-gray, #8a8178);
}

.recent-loading {
  padding: 8px 0;
}

.recent-list {
  background: #fff;
  border: 1px solid var(--church-border, #e0d8cf);
  border-radius: 4px;
  overflow: hidden;
}

.recent-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 20px;
  cursor: pointer;
  transition: background 0.2s;
}

.recent-item:hover {
  background: var(--church-cream, #f5f0eb);
}

.recent-item + .recent-item {
  border-top: 1px solid var(--church-border, #e0d8cf);
}

.recent-icon {
  width: 38px;
  height: 38px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.recent-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.recent-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--church-charcoal, #3a3a3a);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.recent-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.recent-type {
  font-weight: 500;
}

.recent-dot {
  color: var(--church-warm-gray, #8a8178);
}

.recent-time {
  color: var(--church-warm-gray, #8a8178);
}

.recent-arrow {
  color: var(--church-warm-gray, #8a8178);
  font-size: 20px;
  flex-shrink: 0;
}

/* ==================== CTA 横幅 ==================== */
.cta-banner {
  position: relative;
  height: 280px;
  background: linear-gradient(135deg, #1a2a3e 0%, #2c4a6e 50%, #1e3a5c 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.cta-overlay {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse at 30% 50%, rgba(201, 169, 110, 0.06) 0%, transparent 50%),
    radial-gradient(ellipse at 70% 50%, rgba(201, 169, 110, 0.04) 0%, transparent 50%);
  pointer-events: none;
}

.cta-content {
  position: relative;
  text-align: center;
  color: #fff;
  padding: 0 32px;
}

.cta-title {
  font-family: var(--font-heading);
  font-size: 28px;
  font-weight: 600;
  letter-spacing: 5px;
  text-transform: uppercase;
  margin: 0 0 28px;
}

.cta-buttons {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  flex-wrap: wrap;
}

/* ==================== 响应式 ==================== */
@media (max-width: 800px) {
  .hero {
    height: 320px;
  }

  .hero-title {
    font-size: 28px;
    letter-spacing: 4px;
  }

  .stat-cards {
    grid-template-columns: repeat(2, 1fr);
  }

  .stat-number {
    font-size: 32px;
  }

  .module-cards {
    grid-template-columns: repeat(2, 1fr);
  }

  .import-grid {
    grid-template-columns: 1fr;
  }

  .section-cream,
  .section-white,
  .section-stats {
    padding: 32px 0;
  }
}
</style>
