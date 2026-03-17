<script setup>
/**
 * 注释阅读页面
 * 连续滚动浏览所有注释内容
 * 左侧目录导航定位，右侧连续内容
 * 支持块类型识别、经文引用高亮、三种查看模式
 * 支持从阅读页直接编辑
 */
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { getResourceDetail } from '@/api/resource'
import { ArrowLeft } from '@element-plus/icons-vue'
import { parseCommentaryText, findAllScriptureRefs } from '@/utils/fileImport'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

/** 资源 ID */
const resourceId = route.params.id

/** 资源数据 */
const resource = ref(null)

/** 元数据 */
const meta = ref({})

/** 注释段落列表 [{type?, title, content}] */
const sections = ref([])

/** 加载状态 */
const loading = ref(false)

/** 当前可见的段落索引（通过滚动检测） */
const currentIndex = ref(0)

/** 侧边栏展开状态 */
const sidebarOpen = ref(true)

/** 查看模式：original=原文 smart=智能 compare=对比 */
const viewMode = ref('smart')

/** 是否正在程序滚动（避免滚动检测干扰） */
const isScrolling = ref(false)

/** 滚动容器 ref */
const scrollContainer = ref(null)

/** 从段落中提取文档作者（如有） */
const docAuthor = computed(() => {
  const authorBlock = sections.value.find(s => s.type === 'author')
  if (authorBlock) return authorBlock.title
  return meta.value.author || ''
})

/**
 * 兼容旧数据格式
 */
function normalizeEntries(data) {
  if (!Array.isArray(data)) return []
  return data.map(item => {
    if (item.title !== undefined) return item
    return {
      type: item.type || 'body',
      title: item.verse || item.title || '',
      content: item.content || ''
    }
  })
}

/**
 * 将纯文本格式化为带换行和经文引用高亮的 HTML
 */
function formatContent(text) {
  if (!text) return ''
  /* 转义 HTML 特殊字符 */
  let escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  /* 高亮经文引用 */
  const refs = findAllScriptureRefs(text)
  if (refs.length > 0) {
    /* 从后往前替换，避免位置偏移 */
    const sortedRefs = [...refs].sort((a, b) => b.start - a.start)
    for (const ref of sortedRefs) {
      const originalPart = text.substring(ref.start, ref.end)
      const escapedPart = originalPart
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
      escaped = escaped.replace(
        escapedPart,
        `<span class="verse-highlight">${escapedPart}</span>`
      )
    }
  }

  /* 换行转 <br> */
  return escaped.replace(/\n/g, '<br>')
}

/**
 * 将纯文本格式化为 HTML（原文模式，不高亮经文引用）
 */
function formatPlainContent(text) {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
}

/** 解析 JSON */
function tryParseJson(str) {
  try { return JSON.parse(str) } catch { return null }
}

/** 获取块类型的中文标签 */
function getTypeLabel(type) {
  const labels = {
    document_title: t('block_type_doc_title'),
    author: t('block_type_author'),
    preface: t('block_type_preface'),
    chapter_title: t('block_type_chapter'),
    section_title: t('block_type_section'),
    verse_ref: t('block_type_verse_ref'),
    body: t('block_type_body')
  }
  return labels[type] || ''
}

/** 获取块类型对应的目录图标 */
function getTypeIcon(type) {
  const icons = {
    document_title: '📖',
    author: '✍',
    preface: '📝',
    chapter_title: '📑',
    section_title: '§',
    verse_ref: '📜',
    body: ''
  }
  return icons[type] || ''
}

/** 加载资源详情 */
async function loadDetail() {
  loading.value = true
  try {
    const res = await getResourceDetail(resourceId)
    const detail = res.data
    resource.value = detail
    meta.value = tryParseJson(detail.metaJson) || {}

    if (detail.contentJson) {
      let parsed = JSON.parse(detail.contentJson)
      if (Array.isArray(parsed)) {
        sections.value = normalizeEntries(parsed)
      } else if (parsed && typeof parsed === 'object' && parsed.text) {
        sections.value = parseCommentaryText(parsed.text)
      } else {
        sections.value = []
      }
    }

    /* 从 URL 参数中读取初始段落位置 */
    const sectionParam = parseInt(route.query.section)
    if (!isNaN(sectionParam) && sectionParam >= 0 && sectionParam < sections.value.length) {
      nextTick(() => scrollToSection(sectionParam))
    }
  } catch (e) {
    console.error('加载详情失败:', e)
  } finally {
    loading.value = false
  }
}

/** 滚动到指定段落 */
function scrollToSection(index) {
  const el = document.getElementById(`section-${index}`)
  if (!el) return
  isScrolling.value = true
  currentIndex.value = index
  el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  /* 滚动动画结束后恢复检测 */
  setTimeout(() => { isScrolling.value = false }, 600)
}

/** 滚动时检测当前可见段落 */
function onContentScroll() {
  if (isScrolling.value) return
  const container = scrollContainer.value
  if (!container) return

  const containerTop = container.getBoundingClientRect().top
  let closestIdx = 0
  let closestDist = Infinity

  for (let i = 0; i < sections.value.length; i++) {
    const el = document.getElementById(`section-${i}`)
    if (!el) continue
    const dist = Math.abs(el.getBoundingClientRect().top - containerTop - 20)
    if (dist < closestDist) {
      closestDist = dist
      closestIdx = i
    }
  }

  currentIndex.value = closestIdx
}

/** 返回详情页 */
function goBack() {
  router.push(`/commentary/detail/${resourceId}`)
}

/** 跳转到编辑页 */
function goEdit() {
  router.push(`/commentary/edit/${resourceId}`)
}

onMounted(() => { loadDetail() })
</script>

<template>
  <div class="read-page" v-loading="loading">
    <!-- 顶部导航栏 -->
    <div class="read-header">
      <div class="header-left" @click="goBack">
        <el-icon :size="18"><ArrowLeft /></el-icon>
        <span class="header-title">{{ resource?.title || '' }}</span>
      </div>
      <div class="header-center">
        <div class="mode-switcher" role="tablist" :aria-label="t('view_mode')">
          <button
            class="mode-btn"
            :class="{ 'mode-btn-active': viewMode === 'original' }"
            @click="viewMode = 'original'"
            role="tab"
            :aria-selected="viewMode === 'original'"
          >{{ t('view_mode_original') }}</button>
          <button
            class="mode-btn"
            :class="{ 'mode-btn-active': viewMode === 'smart' }"
            @click="viewMode = 'smart'"
            role="tab"
            :aria-selected="viewMode === 'smart'"
          >{{ t('view_mode_smart') }}</button>
          <button
            class="mode-btn"
            :class="{ 'mode-btn-active': viewMode === 'compare' }"
            @click="viewMode = 'compare'"
            role="tab"
            :aria-selected="viewMode === 'compare'"
          >{{ t('view_mode_compare') }}</button>
        </div>
      </div>
      <div class="header-right">
        <span class="header-meta" v-if="docAuthor">{{ docAuthor }}</span>
        <span class="header-divider" v-if="docAuthor">·</span>
        <span class="header-progress" v-if="sections.length > 0">
          {{ currentIndex + 1 }} / {{ sections.length }}
        </span>
        <button class="edit-btn" @click="goEdit" :aria-label="t('edit')">
          {{ t('edit') }}
        </button>
      </div>
    </div>

    <div class="read-body" v-if="sections.length > 0">
      <!-- 侧边栏目录 -->
      <div class="read-sidebar" :class="{ 'sidebar-collapsed': !sidebarOpen }">
        <div class="sidebar-toggle" @click="sidebarOpen = !sidebarOpen">
          {{ sidebarOpen ? '◀' : '▶' }}
        </div>
        <div v-if="sidebarOpen" class="sidebar-content">
          <h4 class="sidebar-title">{{ t('commentary_section_directory') }}</h4>
          <div class="sidebar-list">
            <div
              v-for="(sec, idx) in sections"
              :key="idx"
              class="sidebar-item"
              :class="{
                'sidebar-item-active': idx === currentIndex,
                ['sidebar-type-' + (sec.type || 'body')]: true
              }"
              @click="scrollToSection(idx)"
            >
              <span class="sidebar-idx">{{ idx + 1 }}</span>
              <span class="sidebar-name">
                <span v-if="sec.type && sec.type !== 'body'" class="sidebar-type-icon">{{ getTypeIcon(sec.type) }}</span>
                {{ sec.title || t('commentary_untitled_section') }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 主内容区：连续滚动 -->
      <div class="read-main" :class="{ 'read-main-compare': viewMode === 'compare' }">

        <!-- 原文模式 / 智能模式：连续滚动 -->
        <div
          v-if="viewMode !== 'compare'"
          ref="scrollContainer"
          class="read-content"
          @scroll="onContentScroll"
        >
          <div
            v-for="(sec, idx) in sections"
            :key="idx"
            :id="'section-' + idx"
            class="section-block"
          >
            <!-- 智能模式 -->
            <template v-if="viewMode === 'smart'">
              <div v-if="sec.type && sec.type !== 'body'" class="content-type-tag" :class="'tag-' + sec.type">
                {{ getTypeLabel(sec.type) }}
              </div>
              <h2 class="content-title" :class="'title-' + (sec.type || 'body')">
                {{ sec.title }}
              </h2>
              <div class="content-body" v-html="formatContent(sec.content)"></div>
            </template>

            <!-- 原文模式 -->
            <template v-else>
              <h2 class="content-title content-title-plain">{{ sec.title }}</h2>
              <div class="content-body content-body-plain" v-html="formatPlainContent(sec.content)"></div>
            </template>
          </div>
        </div>

        <!-- 对比模式：左右分栏，各自连续滚动 -->
        <div v-if="viewMode === 'compare'" class="compare-container">
          <!-- 左侧：原文 -->
          <div class="compare-pane">
            <div class="compare-pane-label">{{ t('view_mode_original') }}</div>
            <div class="compare-pane-content" @scroll="onContentScroll" ref="scrollContainer">
              <div
                v-for="(sec, idx) in sections"
                :key="'orig-' + idx"
                :id="'section-' + idx"
                class="section-block"
              >
                <h2 class="content-title content-title-plain">{{ sec.title }}</h2>
                <div class="content-body content-body-plain" v-html="formatPlainContent(sec.content)"></div>
              </div>
            </div>
          </div>
          <!-- 右侧：智能排版 -->
          <div class="compare-pane">
            <div class="compare-pane-label">{{ t('view_mode_smart') }}</div>
            <div class="compare-pane-content">
              <div
                v-for="(sec, idx) in sections"
                :key="'smart-' + idx"
                class="section-block"
              >
                <div v-if="sec.type && sec.type !== 'body'" class="content-type-tag" :class="'tag-' + sec.type">
                  {{ getTypeLabel(sec.type) }}
                </div>
                <h2 class="content-title" :class="'title-' + (sec.type || 'body')">
                  {{ sec.title }}
                </h2>
                <div class="content-body" v-html="formatContent(sec.content)"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-if="!loading && sections.length === 0" class="empty-state">
      {{ t('commentary_empty') }}
    </div>
  </div>
</template>

<style scoped>
.read-page {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--church-cream, #f5f0eb);
}

.read-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 24px;
  background: #fff;
  border-bottom: 1px solid var(--church-border, #e0d8cf);
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  color: #5a8a6e;
  transition: opacity 0.2s;
}

.header-left:hover { opacity: 0.7; }

.header-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--church-charcoal, #3a3a3a);
}

.header-center {
  display: flex;
  align-items: center;
}

.mode-switcher {
  display: flex;
  background: var(--church-cream, #f5f0eb);
  border-radius: 6px;
  padding: 2px;
  gap: 2px;
}

.mode-btn {
  font-size: 12px;
  padding: 4px 12px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--church-warm-gray, #8a8178);
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.mode-btn:hover {
  color: var(--church-charcoal, #3a3a3a);
}

.mode-btn-active {
  background: #fff;
  color: #5a8a6e;
  font-weight: 500;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.header-meta {
  font-size: 13px;
  color: var(--church-warm-gray, #8a8178);
}

.header-divider {
  color: var(--church-warm-gray, #8a8178);
  font-size: 12px;
}

.header-progress {
  font-size: 13px;
  color: var(--church-warm-gray, #8a8178);
}

/* 编辑按钮 */
.edit-btn {
  font-size: 12px;
  padding: 4px 12px;
  border: 1px solid #5a8a6e;
  border-radius: 4px;
  background: transparent;
  color: #5a8a6e;
  cursor: pointer;
  margin-left: 8px;
  transition: all 0.2s;
}

.edit-btn:hover {
  background: #5a8a6e;
  color: #fff;
}

.read-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* 侧边栏 */
.read-sidebar {
  width: 260px;
  background: #fff;
  border-right: 1px solid var(--church-border, #e0d8cf);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  position: relative;
  transition: width 0.3s;
}

.sidebar-collapsed { width: 32px; }

.sidebar-toggle {
  position: absolute;
  right: -1px;
  top: 12px;
  width: 20px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  border: 1px solid var(--church-border, #e0d8cf);
  border-left: none;
  border-radius: 0 4px 4px 0;
  cursor: pointer;
  font-size: 10px;
  color: var(--church-warm-gray, #8a8178);
  z-index: 1;
}

.sidebar-content {
  padding: 16px;
  overflow-y: auto;
  flex: 1;
}

.sidebar-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--church-charcoal, #3a3a3a);
  margin: 0 0 12px 0;
}

.sidebar-list { display: flex; flex-direction: column; gap: 2px; }

.sidebar-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 13px;
  color: var(--church-charcoal, #3a3a3a);
}

.sidebar-item:hover { background: var(--church-cream, #f5f0eb); }

.sidebar-item-active {
  background: rgba(90,138,110,0.1);
  color: #5a8a6e;
  font-weight: 500;
}

/* 目录中不同类型的样式 */
.sidebar-type-document_title .sidebar-name,
.sidebar-type-chapter_title .sidebar-name { font-weight: 600; }
.sidebar-type-author .sidebar-name { font-style: italic; color: var(--church-warm-gray, #8a8178); }
.sidebar-type-verse_ref .sidebar-name { color: #8b6914; }

.sidebar-idx {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: rgba(90,138,110,0.06);
  color: #5a8a6e;
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.sidebar-item-active .sidebar-idx { background: #5a8a6e; color: #fff; }

.sidebar-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: center;
  gap: 4px;
}

.sidebar-type-icon { font-size: 12px; flex-shrink: 0; }

/* 主内容区 */
.read-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.read-content {
  flex: 1;
  overflow-y: auto;
  padding: 40px;
  max-width: 800px;
  margin: 0 auto;
  width: 100%;
}

/* 段落块：连续排列 */
.section-block {
  margin-bottom: 32px;
  scroll-margin-top: 20px;
}

.section-block:last-child {
  margin-bottom: 80px;
}

/* 块类型标签 */
.content-type-tag {
  display: inline-block;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 3px;
  margin-bottom: 10px;
  color: #fff;
}
.tag-document_title { background: #5a8a6e; }
.tag-author { background: #8a8178; }
.tag-preface { background: #6b8da6; }
.tag-chapter_title { background: #7a6b8a; }
.tag-section_title { background: #8a7b6b; }
.tag-verse_ref { background: #8b6914; }

/* 标题样式：根据块类型差异化 */
.content-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--church-charcoal, #3a3a3a);
  margin: 0 0 12px 0;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--church-border, #e0d8cf);
}

.title-document_title {
  font-size: 20px;
  text-align: center;
  border-bottom: none;
  padding-bottom: 4px;
}

.title-author {
  font-size: 14px;
  font-weight: 400;
  text-align: center;
  color: var(--church-warm-gray, #8a8178);
  border-bottom: none;
}

.title-chapter_title {
  font-size: 18px;
  color: #5a8a6e;
}

.title-verse_ref {
  font-size: 15px;
  color: #8b6914;
  background: rgba(139,105,20,0.06);
  padding: 8px 12px;
  border-radius: 4px;
  border-bottom: none;
}

.content-body {
  font-size: 15px;
  color: var(--church-charcoal, #3a3a3a);
  line-height: 1.8;
  word-break: break-word;
}

/* 经文引用高亮 */
.content-body :deep(.verse-highlight) {
  color: #8b6914;
  font-weight: 500;
  background: rgba(139,105,20,0.08);
  padding: 1px 3px;
  border-radius: 2px;
}

/* 原文模式样式 */
.content-title-plain {
  font-size: 16px;
  font-weight: 600;
  color: var(--church-charcoal, #3a3a3a);
  border-bottom: 1px solid var(--church-border, #e0d8cf);
}

.content-body-plain {
  font-size: 15px;
  color: var(--church-charcoal, #3a3a3a);
  line-height: 1.8;
}

/* 对比模式 */
.read-main-compare {
  overflow: hidden;
}

.compare-container {
  flex: 1;
  display: flex;
  overflow: hidden;
  gap: 0;
}

.compare-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-right: 1px solid var(--church-border, #e0d8cf);
}

.compare-pane:last-child {
  border-right: none;
}

.compare-pane-label {
  font-size: 11px;
  font-weight: 600;
  text-align: center;
  padding: 6px 0;
  color: var(--church-warm-gray, #8a8178);
  background: rgba(90,138,110,0.04);
  border-bottom: 1px solid var(--church-border, #e0d8cf);
  flex-shrink: 0;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.compare-pane-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px 20px;
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--app-text-tertiary, #9a948e);
  font-size: 16px;
}

@media (max-width: 768px) {
  .read-sidebar { width: 200px; }
  .read-content { padding: 24px 16px; }
  .compare-pane-content { padding: 16px 12px; }
  .mode-btn { padding: 4px 8px; font-size: 11px; }
}

@media (max-width: 480px) {
  .read-sidebar { display: none; }
  .sidebar-toggle { display: none; }
  .compare-container { flex-direction: column; }
  .compare-pane { border-right: none; border-bottom: 1px solid var(--church-border, #e0d8cf); }
  .compare-pane:last-child { border-bottom: none; }
  .header-title { max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
}
</style>
