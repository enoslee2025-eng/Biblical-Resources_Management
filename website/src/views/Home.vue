<script setup>
/**
 * 首页 - 资源列表
 * 显示当前用户的所有资源
 * 功能：搜索、按类型筛选、排序、创建、编辑、删除、复制、导出入口、公开/私有切换
 * 顶部设置：深色模式切换、语言切换、退出登录
 */
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { showToast, showConfirmDialog } from 'vant'
import { getResourceList, deleteResource, copyResource, getResourceSummary, togglePublic } from '@/api/resource'
import { logout } from '@/api/auth'
import { useUserStore } from '@/stores/user'
import { useSettingsStore } from '@/stores/settings'
import { i18n } from '@/i18n'
import ResourceIcon from '@/components/ResourceIcon.vue'

const { t, locale } = useI18n()
const router = useRouter()
const userStore = useUserStore()
const settingsStore = useSettingsStore()

/** 资源列表（原始数据） */
const resources = ref([])

/** 每个资源的进度信息 { [resourceId]: { filledBooks, totalBooks } } */
const progressMap = ref({})

/** 是否正在加载 */
const loading = ref(false)

/** 是否显示新建类型选择 */
const showTypeSheet = ref(false)

/** 搜索关键词 */
const searchQuery = ref('')

/** 当前筛选的 Tab 索引：0=全部, 1=圣经, 2=注释, 3=词典 */
const filterTabIndex = ref(0)

/** Tab 索引到类型的映射 */
const filterTypeMap = ['', 'bible', 'commentary', 'dictionary']

/** 排序方式 */
const sortBy = ref('time')

/** 是否显示排序选项 */
const showSortSheet = ref(false)

/** 是否显示设置菜单 */
const showSettingsSheet = ref(false)

/** 分页：每页显示数量 */
const pageSize = 10

/** 当前显示数量 */
const displayCount = ref(pageSize)

/** 是否显示新手引导 */
const showGuide = ref(false)

/** 排序选项 */
const sortActions = computed(() => [
  { name: t('sort_update_time'), value: 'time' },
  { name: t('sort_name'), value: 'name' },
  { name: t('sort_type'), value: 'type' }
])

/** 设置菜单选项 */
const settingsActions = computed(() => [
  { name: settingsStore.isDark ? t('light_mode') : t('dark_mode'), value: 'dark' },
  { name: t('switch_lang') + (locale.value === 'zh' ? ' (English)' : ' (中文)'), value: 'lang' },
  { name: t('home_logout'), value: 'logout', color: 'var(--app-danger)' }
])

/** 资源类型选项 */
const typeActions = computed(() => [
  { name: t('type_bible'), value: 'bible' },
  { name: t('type_commentary'), value: 'commentary' },
  { name: t('type_dictionary'), value: 'dictionary' }
])

/** 经过搜索、筛选、排序后的资源列表 */
const filteredResources = computed(() => {
  let list = [...resources.value]

  // 按类型筛选
  const filterType = filterTypeMap[filterTabIndex.value]
  if (filterType) {
    list = list.filter(r => r.type === filterType)
  }

  // 按关键词搜索
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.trim().toLowerCase()
    list = list.filter(r => r.title.toLowerCase().includes(q))
  }

  // 排序
  if (sortBy.value === 'name') {
    list.sort((a, b) => a.title.localeCompare(b.title))
  } else if (sortBy.value === 'type') {
    list.sort((a, b) => a.type.localeCompare(b.type))
  }
  // 默认 time 排序使用后端返回的 updatedAt DESC

  return list
})

/** 分页后的资源列表 */
const paginatedResources = computed(() => {
  return filteredResources.value.slice(0, displayCount.value)
})

/** 是否还有更多 */
const hasMore = computed(() => {
  return displayCount.value < filteredResources.value.length
})

/** 最近编辑的资源（最多3个，按更新时间排序） */
const recentResources = computed(() => {
  return [...resources.value]
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
    .slice(0, 3)
})

/** 搜索或筛选变化时重置分页 */
watch([searchQuery, filterTabIndex, sortBy], () => {
  displayCount.value = pageSize
})

/**
 * 加载更多
 */
function loadMore() {
  displayCount.value += pageSize
}

/**
 * 获取资源列表
 */
async function fetchResources() {
  loading.value = true
  try {
    const res = await getResourceList()
    resources.value = res.data || []
    loadProgress()
  } catch (e) {
    showToast(t('error'))
  } finally {
    loading.value = false
  }
}

/**
 * 加载所有资源的编辑进度（并行请求，避免逐个串行卡顿）
 */
async function loadProgress() {
  const items = resources.value
  if (items.length === 0) return
  const results = await Promise.allSettled(
    items.map(item => getResourceSummary(item.id))
  )
  results.forEach((result, idx) => {
    if (result.status === 'fulfilled') {
      progressMap.value[items[idx].id] = result.value.data
    }
  })
}

/**
 * 获取资源类型的中文名
 */
function getTypeName(type) {
  const map = { bible: t('type_bible'), commentary: t('type_commentary'), dictionary: t('type_dictionary') }
  return map[type] || type
}

/**
 * 获取资源类型对应的品牌色
 */
function getTypeColor(type) {
  const colors = {
    bible: 'var(--app-type-bible)',
    commentary: 'var(--app-type-commentary)',
    dictionary: 'var(--app-type-dictionary)'
  }
  return colors[type] || 'var(--app-primary)'
}

/**
 * 获取资源类型对应的浅色背景
 */
function getTypeColorLight(type) {
  const colors = {
    bible: 'var(--app-primary-light)',
    commentary: 'var(--app-accent-light)',
    dictionary: 'var(--app-warning-light)'
  }
  return colors[type] || 'var(--app-primary-light)'
}

/**
 * 格式化为相对时间（刚刚、X分钟前、昨天等）
 */
function formatTime(datetime) {
  if (!datetime) return ''
  const now = new Date()
  const date = new Date(datetime)
  const diffMs = now - date
  if (isNaN(diffMs)) return datetime.replace('T', ' ').substring(0, 16)
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return t('time_just_now')
  if (diffMins < 60) return t('time_minutes_ago', { count: diffMins })
  if (diffHours < 24) return t('time_hours_ago', { count: diffHours })
  if (diffDays < 2) return t('time_yesterday')
  if (diffDays < 30) return t('time_days_ago', { count: diffDays })
  return datetime.replace('T', ' ').substring(0, 10)
}

/**
 * 获取进度文本（圣经显示书卷进度，注释/词典显示条目数）
 */
function getProgressText(item) {
  const progress = progressMap.value[item.id]
  if (!progress) return ''
  if (item.type === 'bible' && progress.totalBooks) {
    return t('home_progress', { filled: progress.filledBooks || 0, total: progress.totalBooks || 66 })
  }
  if ((item.type === 'commentary' || item.type === 'dictionary') && progress.totalEntries) {
    return t('home_entry_count', { count: progress.totalEntries })
  }
  return ''
}

/**
 * 获取进度百分比（0-100）
 */
function getProgressPercent(item) {
  const progress = progressMap.value[item.id]
  if (!progress || !progress.totalBooks) return 0
  return Math.round(((progress.filledBooks || 0) / progress.totalBooks) * 100)
}

/**
 * 选择排序方式
 */
function onSelectSort(action) {
  sortBy.value = action.value
}

/**
 * 处理设置菜单选项
 */
function onSettingsSelect(action) {
  if (action.value === 'dark') {
    settingsStore.toggleDark()
  } else if (action.value === 'lang') {
    const newLang = locale.value === 'zh' ? 'en' : 'zh'
    locale.value = newLang
    i18n.global.locale.value = newLang
    settingsStore.setLocale(newLang)
  } else if (action.value === 'logout') {
    onLogout()
  }
}

/**
 * 选择资源类型后创建
 */
function onSelectType(action) {
  if (action.value === 'bible') {
    router.push('/bible/edit')
  } else if (action.value === 'commentary') {
    router.push('/commentary/edit')
  } else if (action.value === 'dictionary') {
    router.push('/dictionary/edit')
  }
}

/**
 * 点击资源进入编辑
 */
function onClickResource(resource) {
  if (resource.type === 'bible') {
    router.push(`/bible/edit/${resource.id}`)
  } else if (resource.type === 'commentary') {
    router.push(`/commentary/edit/${resource.id}`)
  } else if (resource.type === 'dictionary') {
    router.push(`/dictionary/edit/${resource.id}`)
  }
}

/**
 * 导出资源
 */
function onExportResource(resource) {
  router.push(`/export/${resource.id}`)
}

/**
 * 切换资源公开/私有
 */
async function onTogglePublic(resource) {
  try {
    const newPublic = resource.isPublic === 1 ? 0 : 1
    await togglePublic(resource.id, newPublic === 1)
    resource.isPublic = newPublic
    showToast(newPublic === 1 ? t('public_success') : t('private_success'))
  } catch (e) {
    showToast(t('error'))
  }
}

/**
 * 删除资源
 */
async function onDeleteResource(resource) {
  try {
    await showConfirmDialog({
      title: t('delete'),
      message: `${t('delete')} "${resource.title}"?`
    })
    await deleteResource(resource.id)
    showToast(t('success'))
    fetchResources()
  } catch (e) {
    // 用户取消
  }
}

/**
 * 复制资源
 */
async function onCopyResource(resource) {
  try {
    await copyResource(resource.id)
    showToast(t('home_copy_success'))
    fetchResources()
  } catch (e) {
    showToast(t('error'))
  }
}

/**
 * 退出登录
 */
async function onLogout() {
  try {
    await showConfirmDialog({
      title: t('home_logout'),
      message: t('home_logout_confirm')
    })
  } catch (e) {
    return
  }

  try {
    await logout()
  } catch (e) {
    // 退出接口失败也继续清理本地状态
  }
  userStore.clearToken()
  router.push('/login')
}

/**
 * 关闭引导并标记为已读
 */
function dismissGuide() {
  showGuide.value = false
  localStorage.setItem('guide_seen', '1')
}

onMounted(() => {
  fetchResources()
  /* 首次访问时显示引导 */
  if (!localStorage.getItem('guide_seen')) {
    showGuide.value = true
  }
})
</script>

<template>
  <main class="page" role="main" :aria-label="t('home_title')">
    <!-- 问候语顶部区域 -->
    <header class="home-header">
      <div class="header-content">
        <div class="header-text">
          <h1 class="greeting">{{ t('home_greeting') }}</h1>
          <p class="resource-summary">{{ t('home_resource_count', { count: resources.length }) }}</p>
        </div>
        <van-icon name="setting-o" size="22" class="header-settings-btn" @click="showSettingsSheet = true" role="button" :aria-label="t('home_logout')" />
      </div>
      <div class="header-decoration" aria-hidden="true">
        <svg width="120" height="120" viewBox="0 0 120 120"><circle cx="100" cy="20" r="60" fill="var(--app-primary)" opacity="0.06"/></svg>
      </div>
    </header>

    <!-- 搜索栏 + 排序 -->
    <div class="search-row">
      <van-search
        v-model="searchQuery"
        :placeholder="t('search')"
        shape="round"
        class="search-input"
        :aria-label="t('search')"
      />
      <div
        class="sort-btn"
        @click="showSortSheet = true"
        role="button"
        :aria-label="t('sort')"
      >
        <van-icon name="exchange" size="18" />
      </div>
    </div>

    <!-- 类型筛选 Tab -->
    <van-tabs v-model:active="filterTabIndex" shrink class="filter-tabs">
      <van-tab :title="t('all')" />
      <van-tab :title="t('type_bible')" />
      <van-tab :title="t('type_commentary')" />
      <van-tab :title="t('type_dictionary')" />
    </van-tabs>

    <!-- 最近编辑快捷入口 -->
    <div v-if="recentResources.length > 0 && !searchQuery && filterTabIndex === 0" class="recent-section">
      <h3 class="section-title">{{ t('home_recent') }}</h3>
      <div class="recent-cards">
        <div
          v-for="item in recentResources"
          :key="'recent-' + item.id"
          class="recent-card"
          @click="onClickResource(item)"
          role="button"
          :aria-label="item.title"
        >
          <div class="recent-icon" :style="{ background: getTypeColorLight(item.type), color: getTypeColor(item.type) }">
            <ResourceIcon :type="item.type" :size="18" />
          </div>
          <span class="recent-title">{{ item.title }}</span>
        </div>
      </div>
    </div>

    <!-- 资源列表 -->
    <van-pull-refresh v-model="loading" @refresh="fetchResources">
      <!-- 骨架屏加载状态 -->
      <template v-if="loading && resources.length === 0">
        <div class="resource-list">
          <div class="skeleton-card" v-for="i in 3" :key="'sk'+i">
            <van-skeleton avatar avatar-shape="square" avatar-size="48px" :row="2" />
          </div>
        </div>
      </template>

      <!-- 空状态 -->
      <div v-else-if="!loading && filteredResources.length === 0" class="empty-state">
        <svg class="empty-illustration" viewBox="0 0 200 160" width="160" height="128" aria-hidden="true">
          <rect x="40" y="30" width="120" height="100" rx="8" fill="var(--app-primary-light)" stroke="var(--app-primary)" stroke-width="2"/>
          <line x1="100" y1="30" x2="100" y2="130" stroke="var(--app-primary)" stroke-width="2"/>
          <circle cx="100" cy="80" r="20" fill="var(--app-card-bg)" stroke="var(--app-primary)" stroke-width="2"/>
          <line x1="92" y1="80" x2="108" y2="80" stroke="var(--app-primary)" stroke-width="3" stroke-linecap="round"/>
          <line x1="100" y1="72" x2="100" y2="88" stroke="var(--app-primary)" stroke-width="3" stroke-linecap="round"/>
        </svg>
        <p class="empty-text">{{ t('home_empty') }}</p>
        <p class="empty-hint">{{ t('home_empty_hint') }}</p>
      </div>

      <!-- 资源卡片列表 -->
      <div class="resource-list" v-else>
        <van-swipe-cell
          v-for="item in paginatedResources"
          :key="item.id"
        >
          <div class="resource-card">
            <!-- 卡片主区域（点击进入编辑） -->
            <div class="card-main" @click="onClickResource(item)" :aria-label="item.title + ', ' + getTypeName(item.type)">
              <!-- 类型图标 -->
              <div class="card-icon-wrapper" :style="{ background: getTypeColorLight(item.type), color: getTypeColor(item.type) }">
                <ResourceIcon :type="item.type" :size="24" />
              </div>
              <!-- 卡片主体 -->
              <div class="card-body">
                <div class="card-header">
                  <span class="card-title">{{ item.title }}</span>
                  <van-tag v-if="item.isPublic === 1" plain size="small" color="var(--app-accent)">{{ t('public_label') }}</van-tag>
                </div>
                <div class="card-meta">
                  <span class="card-type-label" :style="{ color: getTypeColor(item.type) }">{{ getTypeName(item.type) }}</span>
                  <span class="card-meta-dot">&middot;</span>
                  <span>{{ formatTime(item.updatedAt) }}</span>
                </div>
                <div v-if="getProgressText(item)" class="progress-section">
                  <van-progress :percentage="getProgressPercent(item)" :show-pivot="false" :color="getTypeColor(item.type)" track-color="var(--app-border)" stroke-width="4" />
                  <span class="progress-text">{{ getProgressText(item) }}</span>
                </div>
              </div>
              <!-- 右箭头 -->
              <van-icon name="arrow" class="card-arrow" color="var(--app-text-tertiary)" />
            </div>
            <!-- 操作按钮行 -->
            <div class="card-actions">
              <button class="card-action-item" @click.stop="onExportResource(item)" :aria-label="t('export_btn')">
                <van-icon name="share-o" size="16" />
                <span>{{ t('export_btn') }}</span>
              </button>
              <button class="card-action-item" @click.stop="onTogglePublic(item)" :aria-label="item.isPublic === 1 ? t('make_private') : t('make_public')">
                <van-icon :name="item.isPublic === 1 ? 'eye-o' : 'closed-eye'" size="16" />
                <span>{{ item.isPublic === 1 ? t('make_private') : t('make_public') }}</span>
              </button>
              <button class="card-action-item" @click.stop="onCopyResource(item)" :aria-label="t('copy')">
                <van-icon name="description" size="16" />
                <span>{{ t('copy') }}</span>
              </button>
              <button class="card-action-item card-action-danger" @click.stop="onDeleteResource(item)" :aria-label="t('delete')">
                <van-icon name="delete-o" size="16" />
                <span>{{ t('delete') }}</span>
              </button>
            </div>
          </div>

          <!-- 左滑操作：导出 + 公开/私有 + 复制 + 删除 -->
          <template #right>
            <van-button square type="primary" :text="t('export_btn')" class="swipe-btn" @click="onExportResource(item)" />
            <van-button square :text="item.isPublic === 1 ? t('make_private') : t('make_public')" class="swipe-btn" :style="{ background: 'var(--app-warning)' }" @click="onTogglePublic(item)" />
            <van-button square type="primary" :text="t('copy')" class="swipe-btn" @click="onCopyResource(item)" />
            <van-button square type="danger" :text="t('delete')" class="swipe-btn" @click="onDeleteResource(item)" />
          </template>
        </van-swipe-cell>

        <!-- 加载更多按钮 -->
        <div v-if="hasMore" class="load-more">
          <van-button plain size="small" @click="loadMore">{{ t('home_load_more') }}</van-button>
        </div>
        <div v-else-if="filteredResources.length > pageSize" class="no-more">
          {{ t('home_no_more') }}
        </div>
      </div>
    </van-pull-refresh>

    <!-- 新建按钮 -->
    <div class="fab-container">
      <van-button
        round
        type="primary"
        icon="plus"
        size="large"
        class="fab-button"
        @click="showTypeSheet = true"
        :aria-label="t('home_create')"
      >
        {{ t('home_create') }}
      </van-button>
    </div>

    <!-- 资源类型选择 -->
    <van-action-sheet
      v-model:show="showTypeSheet"
      :actions="typeActions"
      :cancel-text="t('cancel')"
      @select="onSelectType"
      :aria-label="t('home_create')"
    />

    <!-- 排序选择 -->
    <van-action-sheet
      v-model:show="showSortSheet"
      :actions="sortActions"
      :cancel-text="t('cancel')"
      @select="onSelectSort"
      :aria-label="t('sort')"
    />

    <!-- 设置菜单 -->
    <van-action-sheet
      v-model:show="showSettingsSheet"
      :actions="settingsActions"
      :cancel-text="t('cancel')"
      @select="onSettingsSelect"
    />

    <!-- 新手操作引导 -->
    <van-overlay :show="showGuide" z-index="100" @click="dismissGuide">
      <div class="guide-overlay" @click.stop>
        <div class="guide-card">
          <h3 class="guide-title">{{ t('guide_welcome') }}</h3>
          <div class="guide-steps">
            <div class="guide-step">
              <van-icon name="add-o" size="24" color="var(--app-primary)" />
              <span>{{ t('guide_step1') }}</span>
            </div>
            <div class="guide-step">
              <van-icon name="edit" size="24" color="var(--app-accent)" />
              <span>{{ t('guide_step2') }}</span>
            </div>
            <div class="guide-step">
              <van-icon name="arrow-left" size="24" color="var(--app-warning)" />
              <span>{{ t('guide_step3') }}</span>
            </div>
            <div class="guide-step">
              <van-icon name="success" size="24" color="var(--app-type-commentary)" />
              <span>{{ t('guide_step4') }}</span>
            </div>
          </div>
          <van-button type="primary" block round @click="dismissGuide">
            {{ t('guide_ok') }}
          </van-button>
        </div>
      </div>
    </van-overlay>
  </main>
</template>

<style scoped>
/* 页面背景纹理 */
.page {
  background-image: radial-gradient(var(--app-border) 1px, transparent 1px);
  background-size: 20px 20px;
}

/* 问候语顶部区域 */
.home-header {
  position: relative;
  padding: 20px 20px 16px;
  background: linear-gradient(135deg, var(--app-primary-light) 0%, var(--app-bg) 100%);
  overflow: hidden;
}

.header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: relative;
  z-index: 1;
}

.greeting {
  font-size: 24px;
  font-weight: 700;
  color: var(--app-text-primary);
  margin-bottom: 2px;
}

.resource-summary {
  font-size: 14px;
  color: var(--app-text-secondary);
}

.header-settings-btn {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  cursor: pointer;
  color: var(--app-text-secondary);
}

.header-settings-btn:active {
  background: var(--app-primary-light);
}

.header-decoration {
  position: absolute;
  top: -30px;
  right: -20px;
  pointer-events: none;
}

/* 搜索栏 */
.search-row {
  display: flex;
  align-items: center;
  padding-right: 12px;
  background: var(--app-card-bg);
}

.search-input {
  flex: 1;
}

.sort-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  cursor: pointer;
  flex-shrink: 0;
  color: var(--app-text-secondary);
  transition: background 0.2s;
}

.sort-btn:active {
  background: var(--app-primary-light);
}

/* 筛选 Tab */
.filter-tabs {
  border-bottom: 1px solid var(--app-border);
}

/* 资源列表 */
.resource-list {
  padding: 12px 16px 80px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* 骨架屏卡片 */
.skeleton-card {
  background: var(--app-card-bg);
  border-radius: 12px;
  padding: 16px;
  box-shadow: var(--app-card-shadow);
}

/* 资源卡片 */
.resource-card {
  background: var(--app-card-bg);
  border-radius: 12px;
  box-shadow: var(--app-card-shadow);
  overflow: hidden;
  transition: box-shadow 0.25s ease;
}

/* 卡片主区域（点击进入编辑） */
.card-main {
  cursor: pointer;
  display: flex;
  align-items: center;
  padding: 14px 12px 10px 16px;
}

.card-main:active {
  background: var(--app-primary-light);
}

/* 类型图标容器 */
.card-icon-wrapper {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-right: 14px;
}

/* 卡片主体内容 */
.card-body {
  flex: 1;
  min-width: 0;
}

/* 卡片标题行 */
.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--app-text-primary);
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 卡片副信息 */
.card-meta {
  font-size: 12px;
  color: var(--app-text-tertiary);
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 6px;
}

.card-type-label {
  font-weight: 500;
  font-size: 12px;
}

.card-meta-dot {
  color: var(--app-text-tertiary);
}

/* 右箭头 */
.card-arrow {
  flex-shrink: 0;
  margin-left: 8px;
}

/* 操作按钮行 */
.card-actions {
  display: flex;
  border-top: 1px solid var(--app-border);
}

.card-action-item {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 0;
  font-size: 13px;
  color: var(--app-text-secondary);
  background: none;
  border: none;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}

.card-action-item + .card-action-item {
  border-left: 1px solid var(--app-border);
}

.card-action-item:active {
  background: var(--app-primary-light);
  color: var(--app-primary);
}

.card-action-danger {
  color: var(--app-danger, #ee0a24);
}

.card-action-danger:active {
  background: rgba(238, 10, 36, 0.06);
  color: var(--app-danger, #ee0a24);
}

/* 进度条 */
.progress-section {
  display: flex;
  align-items: center;
  gap: 8px;
}

.progress-section :deep(.van-progress) {
  flex: 1;
}

.progress-text {
  font-size: 11px;
  color: var(--app-text-tertiary);
  white-space: nowrap;
}

/* 滑动操作按钮 */
.swipe-btn {
  height: 100%;
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60px 20px;
}

.empty-illustration {
  margin-bottom: 20px;
  animation: float 3s ease-in-out infinite;
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}

.empty-text {
  font-size: 16px;
  color: var(--app-text-secondary);
  margin-bottom: 6px;
}

.empty-hint {
  font-size: 13px;
  color: var(--app-text-tertiary);
}

/* 新建按钮 */
.fab-container {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10;
  animation: fab-enter 0.4s ease forwards;
}

@keyframes fab-enter {
  from { opacity: 0; transform: translateX(-50%) translateY(20px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}

.fab-button {
  padding: 0 32px;
  box-shadow: 0 6px 24px rgba(91, 106, 191, 0.4);
  font-weight: 600;
}

.fab-button:active {
  box-shadow: 0 2px 12px rgba(91, 106, 191, 0.3);
}

/* 最近编辑区 */
.recent-section {
  padding: 12px 16px 4px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--app-text-secondary);
  margin-bottom: 10px;
}

.recent-cards {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding-bottom: 8px;
  -webkit-overflow-scrolling: touch;
}

.recent-cards::-webkit-scrollbar {
  display: none;
}

.recent-card {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: var(--app-card-bg);
  border-radius: 10px;
  box-shadow: var(--app-card-shadow);
  cursor: pointer;
  transition: transform 0.15s;
  max-width: 160px;
}

.recent-card:active {
  transform: scale(0.97);
}

.recent-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.recent-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--app-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 加载更多 */
.load-more {
  text-align: center;
  padding: 12px 0 20px;
}

.no-more {
  text-align: center;
  padding: 12px 0 20px;
  font-size: 13px;
  color: var(--app-text-tertiary);
}

/* 新手引导 */
.guide-overlay {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 24px;
}

.guide-card {
  background: var(--app-card-bg);
  border-radius: 16px;
  padding: 28px 24px;
  max-width: 340px;
  width: 100%;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
}

.guide-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--app-text-primary);
  text-align: center;
  margin-bottom: 20px;
}

.guide-steps {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 24px;
}

.guide-step {
  display: flex;
  align-items: center;
  gap: 14px;
  font-size: 14px;
  color: var(--app-text-primary);
  line-height: 1.5;
}
</style>
