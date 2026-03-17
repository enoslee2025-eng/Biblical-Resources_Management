<script setup>
/**
 * 注释阅读页面
 * 按段落/主题浏览注释内容
 * 左侧目录导航，右侧内容阅读
 * 支持块类型识别和经文引用高亮
 */
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { getResourceDetail } from '@/api/resource'
import { ElMessage } from 'element-plus'
import { ArrowLeft, ArrowRight } from '@element-plus/icons-vue'
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

/** 当前选中的段落索引 */
const currentIndex = ref(0)

/** 侧边栏展开状态 */
const sidebarOpen = ref(true)

/** 当前段落 */
const currentSection = computed(() => sections.value[currentIndex.value] || null)

/** 是否有上一个段落 */
const hasPrev = computed(() => currentIndex.value > 0)

/** 是否有下一个段落 */
const hasNext = computed(() => currentIndex.value < sections.value.length - 1)

/** 从段落中提取文档作者（如有） */
const docAuthor = computed(() => {
  const authorBlock = sections.value.find(s => s.type === 'author')
  if (authorBlock) return authorBlock.title
  return meta.value.author || ''
})

/** 总字数 */
const totalChars = computed(() => {
  return sections.value.reduce((sum, s) => sum + (s.content || '').length, 0)
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
      /* 需要在转义后的文本中计算偏移量 */
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
      currentIndex.value = sectionParam
    }
  } catch (e) {
    console.error('加载详情失败:', e)
  } finally {
    loading.value = false
  }
}

/** 切换到指定段落 */
function goToSection(index) {
  currentIndex.value = index
  nextTick(() => {
    const el = document.querySelector('.read-content')
    if (el) el.scrollTop = 0
  })
}

/** 上一个段落 */
function goPrev() {
  if (hasPrev.value) goToSection(currentIndex.value - 1)
}

/** 下一个段落 */
function goNext() {
  if (hasNext.value) goToSection(currentIndex.value + 1)
}

/** 返回详情页 */
function goBack() {
  router.push(`/commentary/detail/${resourceId}`)
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
      <div class="header-right">
        <span class="header-meta" v-if="docAuthor">{{ docAuthor }}</span>
        <span class="header-divider" v-if="docAuthor">·</span>
        <span class="header-progress" v-if="sections.length > 0">
          {{ currentIndex + 1 }} / {{ sections.length }}
        </span>
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
              @click="goToSection(idx)"
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

      <!-- 主内容区 -->
      <div class="read-main">
        <div class="read-content" v-if="currentSection">
          <!-- 块类型标签 -->
          <div v-if="currentSection.type && currentSection.type !== 'body'" class="content-type-tag" :class="'tag-' + currentSection.type">
            {{ getTypeLabel(currentSection.type) }}
          </div>

          <!-- 标题：根据块类型使用不同样式 -->
          <h2 class="content-title" :class="'title-' + (currentSection.type || 'body')">
            {{ currentSection.title }}
          </h2>

          <!-- 内容 -->
          <div class="content-body" v-html="formatContent(currentSection.content)"></div>
        </div>

        <!-- 上下翻页 -->
        <div class="read-nav">
          <div class="nav-btn" :class="{ 'nav-btn-disabled': !hasPrev }" @click="goPrev">
            <el-icon :size="14"><ArrowLeft /></el-icon>
            {{ t('commentary_prev_section') }}
          </div>
          <div class="nav-btn" :class="{ 'nav-btn-disabled': !hasNext }" @click="goNext">
            {{ t('commentary_next_section') }}
            <el-icon :size="14"><ArrowRight /></el-icon>
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
  margin: 0 0 20px 0;
  padding-bottom: 12px;
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

/* 翻页导航 */
.read-nav {
  display: flex;
  justify-content: space-between;
  padding: 12px 40px;
  border-top: 1px solid var(--church-border, #e0d8cf);
  background: #fff;
  flex-shrink: 0;
}

.nav-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 20px;
  border: 1px solid var(--church-border, #e0d8cf);
  border-radius: 4px;
  font-size: 13px;
  color: #5a8a6e;
  cursor: pointer;
  transition: all 0.2s;
  user-select: none;
}

.nav-btn:hover { background: rgba(90,138,110,0.06); border-color: #5a8a6e; }
.nav-btn-disabled { opacity: 0.3; pointer-events: none; }

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
  .read-nav { padding: 12px 16px; }
}

@media (max-width: 480px) {
  .read-sidebar { display: none; }
  .sidebar-toggle { display: none; }
}
</style>
