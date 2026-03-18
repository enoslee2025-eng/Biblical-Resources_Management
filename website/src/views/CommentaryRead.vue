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
import { parseCommentaryText, findAllScriptureRefs, detectScriptureRef } from '@/utils/fileImport'

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
 * 智能目录导航项
 * 根据块类型和内容智能生成有意义的导航标签
 * - 非 body 类型的块直接显示（有明确语义标题）
 * - body 块尝试从内容中提取经文引用作为标签
 * - 连续无标题 body 块合并到上一个导航项下
 */
const navItems = computed(() => {
  const items = []
  /** 导航有意义的块类型 */
  const navTypes = ['document_title', 'author', 'preface', 'chapter_title', 'section_title', 'verse_ref']

  for (let i = 0; i < sections.value.length; i++) {
    const sec = sections.value[i]

    /* 非 body 类型：直接作为导航项 */
    if (navTypes.includes(sec.type)) {
      items.push({
        sectionIndex: i,
        label: cleanTitle(sec.title) || getTypeLabel(sec.type),
        type: sec.type
      })
      continue
    }

    /* body 类型：尝试从内容中提取经文引用 */
    const text = (sec.title || '') + ' ' + (sec.content || '')
    const refs = findAllScriptureRefs(text)

    if (refs.length > 0) {
      /* 用找到的第一个经文引用作为标签 */
      const firstRef = text.substring(refs[0].start, refs[0].end)
      items.push({
        sectionIndex: i,
        label: firstRef,
        type: 'verse_ref'
      })
    } else if (sec.title && sec.title.length <= 30 && sec.title !== sec.content?.slice(0, sec.title.length)) {
      /* 有独立标题（非截取自内容开头）的 body 块也显示 */
      items.push({
        sectionIndex: i,
        label: sec.title,
        type: 'body'
      })
    }
    /* 否则跳过，不在目录中显示 */
  }

  /* 如果过滤后目录为空（全是纯 body 块），按固定间隔生成导航点 */
  if (items.length === 0 && sections.value.length > 0) {
    const step = Math.max(1, Math.ceil(sections.value.length / 15))
    for (let i = 0; i < sections.value.length; i += step) {
      const sec = sections.value[i]
      const label = sec.title || `${t('commentary_section')} ${i + 1}`
      items.push({ sectionIndex: i, label, type: sec.type || 'body' })
    }
  }

  return items
})

/**
 * 当前高亮的目录项索引（根据滚动位置映射到最近的导航项）
 */
const activeNavIndex = computed(() => {
  if (navItems.value.length === 0) return -1
  /* 找到 sectionIndex <= currentIndex 的最后一个导航项 */
  let best = 0
  for (let i = 0; i < navItems.value.length; i++) {
    if (navItems.value[i].sectionIndex <= currentIndex.value) {
      best = i
    }
  }
  return best
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
 * 转义 HTML 特殊字符
 */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * 智能模式：将纯文本格式化为精排 HTML
 * - 按段落分割为 <p> 标签（双换行分段，单换行为 <br>）
 * - 经文引用自动高亮
 * - 首行缩进由 CSS 控制
 */
function formatContent(text) {
  if (!text) return ''

  /* 按双换行分成段落 */
  const paragraphs = text.split(/\n\s*\n/)

  return paragraphs.map(para => {
    const trimmed = para.trim()
    if (!trimmed) return ''
    let escaped = escapeHtml(trimmed)

    /* 高亮经文引用 */
    const refs = findAllScriptureRefs(trimmed)
    if (refs.length > 0) {
      const sortedRefs = [...refs].sort((a, b) => b.start - a.start)
      for (const r of sortedRefs) {
        const original = trimmed.substring(r.start, r.end)
        const esc = escapeHtml(original)
        escaped = escaped.replace(esc, `<span class="verse-highlight">${esc}</span>`)
      }
    }

    /* 段内换行转 <br> */
    escaped = escaped.replace(/\n/g, '<br>')
    return `<p class="smart-paragraph">${escaped}</p>`
  }).filter(Boolean).join('')
}

/**
 * 原文模式：纯文本 HTML（不高亮、不分段）
 */
function formatPlainContent(text) {
  if (!text) return ''
  return escapeHtml(text).replace(/\n/g, '<br>')
}

/** 解析 JSON */
function tryParseJson(str) {
  try { return JSON.parse(str) } catch { return null }
}

/**
 * 清理标题中的装饰符号（◆ ● ■ 等）
 */
function cleanTitle(text) {
  if (!text) return ''
  return text.replace(/^[◆◇●○■□★☆·•▶▪►\-–—\s]+/, '').trim()
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

/**
 * 智能重新分析段落类型
 * 当数据中所有段落都是 body 类型时，自动识别章标题、经文引用、序言等
 * 支持去除 ◆ 等装饰符号后再匹配
 */
function reAnalyzeSections(entries) {
  if (!entries || entries.length === 0) return entries

  /* 检查是否全部为 body 类型（或无类型） */
  const allBody = entries.every(e => !e.type || e.type === 'body')
  if (!allBody) return entries

  let hasDocTitle = false
  let hasAuthor = false
  return entries.map((entry, idx) => {
    const rawTitle = (entry.title || '').trim()
    const content = (entry.content || '').trim()
    /* 去除 ◆ ● ■ ★ ☆ · • 等装饰符号前缀 */
    const title = rawTitle.replace(/^[◆◇●○■□★☆·•▶▪►\-–—\s]+/, '').trim()
    let newType = 'body'

    /* 文档标题：前3个条目中的短标题（无正文内容或内容很少） */
    if (!hasDocTitle && idx < 3 && title.length > 0 && title.length <= 50) {
      if (/牧师|传道|弟兄|姊妹|[著编译撰整理]|作者|译者|编者|by\s/i.test(title)) {
        newType = 'author'
        hasAuthor = true
      } else if (!content || content.length < 20) {
        newType = 'document_title'
        hasDocTitle = true
      }
    }

    /* 作者：标题之后的短行，包含人名+职称 */
    if (newType === 'body' && !hasAuthor && idx < 6 &&
        title.length > 0 && title.length <= 30 && (!content || content.length < 10)) {
      if (/牧师|传道[人]?|弟兄|姊妹|[著编译撰整理]|作者|译者|编者|pastor|by\s|——/i.test(title)) {
        newType = 'author'
        hasAuthor = true
      }
    }

    /* 目录标记 */
    if (newType === 'body' && /^(目录|目次|contents|table\s+of\s+contents)$/i.test(title)) {
      newType = 'section_title'
    }

    /* 章标题：第X章 / X章 / Chapter X */
    if (newType === 'body') {
      if (/^第[\s\d一二三四五六七八九十百零〇]+[章篇部]/.test(title) ||
          /^\d+\s*章/.test(title) ||
          /^(chapter|part)\s+\d+/i.test(title) ||
          /^卷[一二三四五六七八九十\d]+/.test(title) ||
          (/^[A-Z\s]{5,}$/.test(title) && title.length <= 40)) {
        newType = 'chapter_title'
      }
    }

    /* 序言/前言/结语/全景 */
    if (newType === 'body' && /^(序言|前言|引言|简介|概论|导论|绪论|概述|总论|结语|附录|跋|全景|preface|introduction|conclusion|epilogue)/i.test(title)) {
      newType = 'preface'
    }

    /* 经文引用：X：Y-Z 或 X:Y 格式（支持中文全角冒号） */
    if (newType === 'body') {
      const checkText = title || (content ? content.split('\n')[0] : '')
      if (/^\d+\s*[：:]\s*\d+/.test(checkText) ||
          /^\s*[\(（]?\s*[一二三\u4e00-\u9fff]{1,8}\s*\d{1,3}\s*[：:章篇]/.test(checkText) ||
          /^\s*[\(（]?\s*[123]?\s*[A-Za-z]{2,15}\.?\s+\d{1,3}\s*[：:]/.test(checkText)) {
        newType = 'verse_ref'
      }
    }

    /* 小节标题：编号开头的短标题（放在经文引用后，避免误判） */
    if (newType === 'body' && title.length > 0 && title.length <= 50 && (
      /^[一二三四五六七八九十]+[、.．：:]/.test(title) ||
      /^\d+[、.．]\s*\S/.test(title) ||
      /^[（(]\s*\d+\s*[）)]/.test(title) ||
      /^[IVXLC]+[、.．]/.test(title)
    )) {
      newType = 'section_title'
    }

    /* 节标题：包含 "节" 字的标记 */
    if (newType === 'body' && /^节\s+/.test(title)) {
      newType = 'section_title'
    }

    return { ...entry, type: newType }
  })
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
        sections.value = reAnalyzeSections(normalizeEntries(parsed))
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
              v-for="(nav, nIdx) in navItems"
              :key="nav.sectionIndex"
              class="sidebar-item"
              :class="{
                'sidebar-item-active': nIdx === activeNavIndex,
                ['sidebar-type-' + (nav.type || 'body')]: true
              }"
              @click="scrollToSection(nav.sectionIndex)"
            >
              <span class="sidebar-idx">{{ nIdx + 1 }}</span>
              <span class="sidebar-name">
                <span v-if="nav.type && nav.type !== 'body'" class="sidebar-type-icon">{{ getTypeIcon(nav.type) }}</span>
                {{ nav.label }}
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
            :class="[
              'section-block',
              viewMode === 'smart' ? 'smart-block smart-block-' + (sec.type || 'body') : 'plain-block'
            ]"
          >
            <!-- 智能模式 -->
            <template v-if="viewMode === 'smart'">
              <!-- 章标题前加分隔线（非第一个） -->
              <div v-if="sec.type === 'chapter_title' && idx > 0" class="chapter-divider"></div>

              <!-- 文档标题 -->
              <div v-if="sec.type === 'document_title'" class="smart-doc-title">
                <h1>{{ cleanTitle(sec.title) }}</h1>
                <div v-if="sec.content" class="smart-doc-subtitle" v-html="formatContent(sec.content)"></div>
              </div>

              <!-- 作者 -->
              <div v-else-if="sec.type === 'author'" class="smart-author">
                {{ cleanTitle(sec.title) }}
              </div>

              <!-- 序言 -->
              <div v-else-if="sec.type === 'preface'" class="smart-preface">
                <div class="smart-preface-label">{{ cleanTitle(sec.title) }}</div>
                <div class="smart-preface-body" v-html="formatContent(sec.content)"></div>
              </div>

              <!-- 章标题 -->
              <div v-else-if="sec.type === 'chapter_title'" class="smart-chapter">
                <h2>{{ cleanTitle(sec.title) }}</h2>
                <div v-if="sec.content" class="smart-chapter-body" v-html="formatContent(sec.content)"></div>
              </div>

              <!-- 小节标题 -->
              <div v-else-if="sec.type === 'section_title'" class="smart-section">
                <h3>{{ cleanTitle(sec.title) }}</h3>
                <div v-if="sec.content" class="smart-section-body" v-html="formatContent(sec.content)"></div>
              </div>

              <!-- 经文引用 -->
              <div v-else-if="sec.type === 'verse_ref'" class="smart-verse">
                <div class="smart-verse-ref">{{ cleanTitle(sec.title) }}</div>
                <div v-if="sec.content" class="smart-verse-body" v-html="formatContent(sec.content)"></div>
              </div>

              <!-- 正文 -->
              <div v-else class="smart-body">
                <div v-if="sec.title" class="smart-body-title">{{ cleanTitle(sec.title) }}</div>
                <div class="smart-body-content" v-html="formatContent(sec.content)"></div>
              </div>
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
                :class="['section-block', 'smart-block', 'smart-block-' + (sec.type || 'body')]"
              >
                <div v-if="sec.type === 'chapter_title' && idx > 0" class="chapter-divider"></div>
                <div v-if="sec.type === 'document_title'" class="smart-doc-title"><h1>{{ cleanTitle(sec.title) }}</h1></div>
                <div v-else-if="sec.type === 'author'" class="smart-author">{{ cleanTitle(sec.title) }}</div>
                <div v-else-if="sec.type === 'preface'" class="smart-preface">
                  <div class="smart-preface-label">{{ cleanTitle(sec.title) }}</div>
                  <div class="smart-preface-body" v-html="formatContent(sec.content)"></div>
                </div>
                <div v-else-if="sec.type === 'chapter_title'" class="smart-chapter">
                  <h2>{{ cleanTitle(sec.title) }}</h2>
                  <div v-if="sec.content" class="smart-chapter-body" v-html="formatContent(sec.content)"></div>
                </div>
                <div v-else-if="sec.type === 'section_title'" class="smart-section">
                  <h3>{{ cleanTitle(sec.title) }}</h3>
                  <div v-if="sec.content" class="smart-section-body" v-html="formatContent(sec.content)"></div>
                </div>
                <div v-else-if="sec.type === 'verse_ref'" class="smart-verse">
                  <div class="smart-verse-ref">{{ cleanTitle(sec.title) }}</div>
                  <div v-if="sec.content" class="smart-verse-body" v-html="formatContent(sec.content)"></div>
                </div>
                <div v-else class="smart-body">
                  <div v-if="sec.title" class="smart-body-title">{{ cleanTitle(sec.title) }}</div>
                  <div class="smart-body-content" v-html="formatContent(sec.content)"></div>
                </div>
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

/* ========== 段落块基础 ========== */
.section-block {
  scroll-margin-top: 20px;
}
.section-block:last-child { margin-bottom: 80px; }

/* ========== 原文模式（plain） ========== */
.plain-block {
  margin-bottom: 24px;
}

.content-title-plain {
  font-size: 15px;
  font-weight: 600;
  color: var(--church-charcoal, #3a3a3a);
  margin: 0 0 8px 0;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--church-border, #e0d8cf);
}

.content-body-plain {
  font-size: 15px;
  color: var(--church-charcoal, #3a3a3a);
  line-height: 1.8;
}

/* ========== 智能模式（smart） ========== */
.smart-block { margin-bottom: 8px; }
.smart-block-document_title { margin-bottom: 4px; }
.smart-block-author { margin-bottom: 24px; }
.smart-block-chapter_title { margin-bottom: 16px; }
.smart-block-preface { margin-bottom: 24px; }
.smart-block-section_title { margin-bottom: 16px; }
.smart-block-verse_ref { margin-bottom: 20px; }
.smart-block-body { margin-bottom: 4px; }

/* --- 章节分隔线 --- */
.chapter-divider {
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--church-border, #d4cdc4), transparent);
  margin: 40px 0 32px 0;
}

/* --- 文档标题 --- */
.smart-doc-title {
  text-align: center;
  padding: 32px 0 8px 0;
}
.smart-doc-title h1 {
  font-size: 24px;
  font-weight: 700;
  color: var(--church-charcoal, #3a3a3a);
  margin: 0;
  letter-spacing: 2px;
}
.smart-doc-subtitle {
  font-size: 14px;
  color: var(--church-warm-gray, #8a8178);
  margin-top: 8px;
  line-height: 1.6;
}

/* --- 作者 --- */
.smart-author {
  text-align: center;
  font-size: 14px;
  color: var(--church-warm-gray, #8a8178);
  font-style: italic;
  padding-bottom: 16px;
  border-bottom: 2px solid var(--church-border, #e0d8cf);
}

/* --- 序言 --- */
.smart-preface {
  background: rgba(107,141,166,0.06);
  border-left: 3px solid #6b8da6;
  border-radius: 0 6px 6px 0;
  padding: 16px 20px;
}
.smart-preface-label {
  font-size: 13px;
  font-weight: 600;
  color: #6b8da6;
  margin-bottom: 10px;
  text-transform: uppercase;
  letter-spacing: 1px;
}
.smart-preface-body {
  font-size: 14px;
  color: #555;
  line-height: 1.8;
  font-style: italic;
}

/* --- 章标题 --- */
.smart-chapter {
  border-left: 4px solid #5a8a6e;
  padding: 12px 0 12px 16px;
}
.smart-chapter h2 {
  font-size: 20px;
  font-weight: 700;
  color: #5a8a6e;
  margin: 0;
}
.smart-chapter-body {
  font-size: 14px;
  color: var(--church-warm-gray, #8a8178);
  margin-top: 6px;
  line-height: 1.6;
}

/* --- 小节标题 --- */
.smart-section {
  padding: 8px 0 4px 0;
}
.smart-section h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--church-charcoal, #3a3a3a);
  margin: 0;
  padding-bottom: 6px;
  border-bottom: 1px dashed var(--church-border, #e0d8cf);
}
.smart-section-body {
  font-size: 15px;
  color: var(--church-charcoal, #3a3a3a);
  line-height: 1.8;
  margin-top: 8px;
}

/* --- 经文引用 --- */
.smart-verse {
  background: rgba(139,105,20,0.04);
  border-left: 3px solid #c4a035;
  border-radius: 0 6px 6px 0;
  padding: 12px 16px;
}
.smart-verse-ref {
  font-size: 14px;
  font-weight: 600;
  color: #8b6914;
  margin-bottom: 8px;
}
.smart-verse-body {
  font-size: 15px;
  color: var(--church-charcoal, #3a3a3a);
  line-height: 1.8;
}

/* --- 正文 --- */
.smart-body {
  padding: 0;
}
.smart-body-title {
  font-size: 15px;
  font-weight: 500;
  color: var(--church-charcoal, #3a3a3a);
  margin-bottom: 4px;
}
.smart-body-content {
  font-size: 15px;
  color: var(--church-charcoal, #3a3a3a);
  line-height: 1.9;
}

/* --- 智能段落（<p> 标签） --- */
.smart-block :deep(.smart-paragraph) {
  margin: 0 0 12px 0;
  text-indent: 2em;
}
.smart-block :deep(.smart-paragraph:last-child) {
  margin-bottom: 0;
}
/* 序言和经文引用内不缩进 */
.smart-preface-body :deep(.smart-paragraph),
.smart-verse-body :deep(.smart-paragraph) {
  text-indent: 0;
}

/* --- 经文引用高亮（通用） --- */
.smart-block :deep(.verse-highlight) {
  color: #8b6914;
  font-weight: 500;
  background: rgba(139,105,20,0.1);
  padding: 1px 4px;
  border-radius: 2px;
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
