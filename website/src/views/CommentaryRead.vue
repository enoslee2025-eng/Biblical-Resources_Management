<script setup>
/**
 * 注释阅读页面
 * 连续滚动浏览所有注释内容
 * 左侧目录导航定位，右侧连续内容
 * 支持块类型识别、经文引用高亮、三种查看模式
 * 支持从阅读页直接编辑
 */
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { getResourceDetail, updateResource } from '@/api/resource'
import { ArrowLeft } from '@element-plus/icons-vue'
import { parseCommentaryText, findAllScriptureRefs, detectScriptureRef } from '@/utils/fileImport'
import { Editor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import Highlight from '@tiptap/extension-highlight'

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
/**
 * 从目录(toc)段落的内容中提取条目，匹配到对应的章节索引
 */
function parseTocEntries(tocContent, allSections) {
  if (!tocContent) return []
  const lines = tocContent.split(/\n/).map(l => l.trim()).filter(Boolean)
  const entries = []

  for (const line of lines) {
    /* 清理装饰符号和编号前缀 */
    const cleaned = line.replace(/^[◆◇●○■□★☆·•▶▪►\-–—\s\d.．、]+/, '').trim()
    if (!cleaned || cleaned.length > 60) continue

    /* 尝试匹配到实际的章节 */
    let matchedIdx = -1
    for (let j = 0; j < allSections.length; j++) {
      const sec = allSections[j]
      if (sec.type === 'toc') continue
      const secTitle = cleanTitle(sec.title || '')
      if (secTitle && (secTitle === cleaned || secTitle.includes(cleaned) || cleaned.includes(secTitle))) {
        matchedIdx = j
        break
      }
    }

    entries.push({ label: cleaned, sectionIndex: matchedIdx })
  }

  return entries
}

const navItems = computed(() => {
  const items = []
  /**
   * 目录只显示文档结构层级（标题类），不显示经文引用和正文内容
   * 经文引用（verse_ref, scripture_block）是正文中的引经，不是文档结构
   */
  const navTypes = ['document_title', 'author', 'preface', 'chapter_title', 'unit_title', 'section_title']

  /* 检查是否有文档自带的目录(toc)段落 */
  const tocSection = sections.value.find(s => s.type === 'toc')
  if (tocSection) {
    /* 使用文档自带的目录作为导航，将每个条目映射到对应章节 */
    const tocEntries = parseTocEntries(tocSection.content, sections.value)
    for (const entry of tocEntries) {
      if (entry.sectionIndex >= 0) {
        items.push({
          sectionIndex: entry.sectionIndex,
          label: entry.label,
          type: sections.value[entry.sectionIndex]?.type || 'body'
        })
      }
    }
    /* 如果 TOC 条目成功匹配到了章节，直接使用 */
    if (items.length > 0) return items
  }

  for (let i = 0; i < sections.value.length; i++) {
    const sec = sections.value[i]

    /* toc 类型本身不作为导航项 */
    if (sec.type === 'toc') continue

    /* 只有文档结构类型才作为导航项 */
    if (navTypes.includes(sec.type)) {
      items.push({
        sectionIndex: i,
        label: cleanTitle(sec.title) || getTypeLabel(sec.type),
        type: sec.type
      })
    }
    /* 经文引用、编号注释、正文等内容块不出现在目录中 */
  }

  /* 如果过滤后目录为空（没有识别出任何标题），按固定间隔生成导航点 */
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
 * 文档清洗：先清洗再排版
 * 删除无意义残留、修复 OCR 断裂、统一格式
 */
function cleanText(text) {
  if (!text) return ''
  let t = text
  /* 删除 PAGE 标记和孤立页码 */
  t = t.replace(/\bPAGE\b\s*\d*/gi, '')
  t = t.replace(/^\s*[-—]?\s*\d{1,4}\s*[-—]?\s*$/gm, '')
  /* 删除重复空行（最多保留一个） */
  t = t.replace(/\n{3,}/g, '\n\n')
  /* 修复断裂标点：标点被错误换行到下一行 */
  t = t.replace(/\n\s*([，。！？；：、）」』】》\)）])/g, '$1')
  /* 修复断裂括号：左括号后错误换行 */
  t = t.replace(/([（「『【《\(])\s*\n\s*/g, '$1')
  /* 统一经文引用中的冒号：数字:数字 → 数字：数字 */
  t = t.replace(/(\d)\s*:\s*(\d)/g, '$1：$2')
  /* 修复残缺括号：只有左括号没有右括号的行尾补全 */
  t = t.replace(/([（(][^）)\n]{1,30})\s*\n/g, (match, p1) => {
    if (!/[）)]/.test(p1)) return p1 + '）\n'
    return match
  })
  /* 清理行尾空格 */
  t = t.replace(/[ \t]+$/gm, '')
  /* 清理段首多余空格（保留编号符号行） */
  t = t.replace(/^[ \t]+(?![①②③④⑤⑥⑦⑧⑨⑩])/gm, '')
  /* 合并被错误断开的短行（<12字、不以句末标点结尾、下一行非编号/标题开头） */
  const lines = t.split('\n')
  const merged = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    const next = (lines[i + 1] || '').trim()
    if (line.length > 0 && line.length < 12 &&
        !/[。！？；\.\!\?：:》」』】）\)]$/.test(line) &&
        !/^[①②③④⑤⑥⑦⑧⑨⑩◆◇●○■□★☆·•▶▪►\-–—]/.test(next) &&
        !/^(第|节|章|卷|单元|序言|前言|目录|附录)/.test(next) &&
        !/^\d+[：:、.．]/.test(next) &&
        next.length > 0 && !/^\s*$/.test(next)) {
      merged.push(line + next)
      i++ /* 跳过下一行 */
    } else {
      merged.push(line)
    }
  }
  t = merged.join('\n')
  return t.trim()
}

/**
 * 智能模式：将纯文本格式化为精排 HTML
 *
 * 处理流程：文本清洗 → 段落拆分 → 编号段识别 → 经文引用块识别 → 渲染
 *
 * 排版规则：
 * 1. 先清洗再排版（删除残留标记、修复 OCR 断裂）
 * 2. 每段只讲一个意思，超过 180 字自动拆分
 * 3. 引经、论证、结论不塞进同一段
 * 4. ①②③ 编号段统一为编号注释样式
 * 5. 多行经文引用独立成引用块
 * 6. 经文引用克制高亮（只标记引用本身）
 */
function formatContent(text) {
  if (!text) return ''

  /* 第一步：文本清洗 */
  const cleaned = cleanText(text)

  /* 第二步：按双换行和单换行拆分，识别段落结构 */
  const rawBlocks = cleaned.split(/\n\s*\n/)
  const allItems = [] /* { text, itemType: 'paragraph'|'numbered'|'scripture' } */

  for (const block of rawBlocks) {
    const trimmed = block.trim()
    if (!trimmed) continue

    /* 检测编号注释段（①②③ 开头的内容） */
    if (/^[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]/.test(trimmed)) {
      /* 按编号符号拆分成独立条目 */
      const items = trimmed.split(/(?=[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳])/)
      for (const item of items) {
        const t = item.trim()
        if (t) allItems.push({ text: t, itemType: 'numbered' })
      }
      continue
    }

    /* 检测多行经文引用（多行短句，看起来像经文） */
    const lines = trimmed.split('\n').filter(l => l.trim())
    if (lines.length >= 2) {
      const avgLen = trimmed.length / lines.length
      const looksLikeScripture = avgLen < 50 && lines.every(l => l.trim().length < 80)
      if (looksLikeScripture && findAllScriptureRefs(trimmed).length > 0) {
        allItems.push({ text: trimmed, itemType: 'scripture' })
        continue
      }
    }

    /* 普通段落：超过 200 字自动拆分 */
    /* 拆分策略：优先在转折词处拆、其次在句末标点处拆 */
    if (trimmed.length > 200) {
      /* 先按句末标点拆分 */
      const sentences = trimmed.split(/(?<=[。！？；\.\!\?])\s*/)
      let current = ''
      for (const sentence of sentences) {
        /* 检测转折词：即使未到 200 字，遇到明显转折也拆段 */
        const hasTransition = current.length > 60 &&
          /^(但是|然而|因此|所以|换句话说|相反|不过|总之|综上|事实上|实际上|另外|此外|与此同时)/
            .test(sentence.trim())
        if ((current.length + sentence.length > 200 || hasTransition) && current.length > 0) {
          allItems.push({ text: current.trim(), itemType: 'paragraph' })
          current = sentence
        } else {
          current += sentence
        }
      }
      if (current.trim()) allItems.push({ text: current.trim(), itemType: 'paragraph' })
    } else {
      allItems.push({ text: trimmed, itemType: 'paragraph' })
    }
  }

  /* 第三步：渲染 HTML */
  return allItems.map(item => {
    let escaped = escapeHtml(item.text)

    /* 经文引用克制高亮 */
    const refs = findAllScriptureRefs(item.text)
    if (refs.length > 0) {
      const sortedRefs = [...refs].sort((a, b) => b.start - a.start)
      for (const r of sortedRefs) {
        const original = item.text.substring(r.start, r.end)
        const esc = escapeHtml(original)
        escaped = escaped.replace(esc, `<span class="verse-highlight">${esc}</span>`)
      }
    }

    escaped = escaped.replace(/\n/g, '<br>')

    if (item.itemType === 'numbered') {
      /* 编号注释段：编号符号高亮，不缩进 */
      escaped = escaped.replace(/([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳])/g,
        '<span class="note-number">$1</span>')
      return `<p class="smart-paragraph numbered-paragraph">${escaped}</p>`
    }

    if (item.itemType === 'scripture') {
      /* 多行经文引用块：独立排版，左侧线条标记 */
      return `<blockquote class="scripture-quote">${escaped}</blockquote>`
    }

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
    unit_title: t('block_type_unit'),
    section_title: t('block_type_section'),
    verse_ref: t('block_type_verse_ref'),
    scripture_block: t('block_type_scripture'),
    numbered_note: t('block_type_numbered'),
    toc: t('block_type_toc'),
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
    unit_title: '📂',
    section_title: '§',
    verse_ref: '📜',
    scripture_block: '📜',
    numbered_note: '🔢',
    toc: '📋',
    body: ''
  }
  return icons[type] || ''
}

/**
 * 重建目录内容为规范结构
 * 每项单独一行，统一缩进，章节与节范围分开处理
 */
function rebuildTocContent(rawContent) {
  if (!rawContent) return []
  const lines = rawContent.split('\n').map(l => l.trim()).filter(Boolean)
  const items = []

  for (const line of lines) {
    /* 清理装饰符号 */
    let cleaned = line.replace(/^[◆◇●○■□★☆·•▶▪►\-–—\s]+/, '').trim()
    if (!cleaned || cleaned.length > 80) continue

    /* 规范化经文范围格式：5：1-16节 → 5：1-16 */
    cleaned = cleaned.replace(/(\d+)\s*[：:]\s*(\d+)\s*[-–—]\s*(\d+)\s*节?/g, '$1：$2-$3')
    /* 规范化章格式：第X章 保持不变 */

    /* 判断层级：章级 vs 节级 */
    let level = 1 /* 默认一级 */
    if (/^第[\s\d一二三四五六七八九十百]+[章篇部]/.test(cleaned) ||
        /^\d+\s*章/.test(cleaned) ||
        /^(chapter|part)\s+\d+/i.test(cleaned)) {
      level = 0 /* 章级，无缩进 */
    } else if (/^\d+\s*[：:]/.test(cleaned) || /^节\s/.test(cleaned)) {
      level = 2 /* 经文/节级，额外缩进 */
    }

    items.push({ text: cleaned, level })
  }

  return items
}

/**
 * 智能重新分析段落类型
 * 当数据中所有段落都是 body 类型时，自动识别章标题、经文引用、序言等
 * 支持去除 ◆ 等装饰符号后再匹配
 */
/**
 * 判断条目是否像目录列表项（短标题、无实质内容）
 */
function isTocLikeEntry(entry) {
  const rawTitle = (entry.title || '').trim()
  const content = (entry.content || '').trim()
  const title = rawTitle.replace(/^[◆◇●○■□★☆·•▶▪►\-–—\s]+/, '').trim()

  /* 无标题的不是目录项 */
  if (!title) return false
  /* 标题太长的不是目录项 */
  if (title.length > 60) return false

  /**
   * 判断标题本身是否为目录格式
   * 如果标题明确匹配目录模式，即使有较长内容也视为目录项
   * 只有当内容是真正的长段落文字时才排除
   */
  const isTocTitle =
    /* ◆ 开头的装饰性条目 */
    /^[◆◇●○■□★☆·•▶▪►]/.test(rawTitle) ||
    /* 章标题格式 */
    /^第[\s\d一二三四五六七八九十百零〇]+[章篇部]/.test(title) ||
    /^\d+\s*章/.test(title) ||
    /^(chapter|part)\s+\d+/i.test(title) ||
    /^卷[一二三四五六七八九十\d]+/.test(title) ||
    /* 经文引用格式 */
    /^\d+\s*[：:]\s*\d+/.test(title) ||
    /* 节标题 */
    /^节\s+/.test(title) ||
    /* 序言/前言等 */
    /^(序言|前言|引言|简介|概论|导论|绪论|概述|总论|结语|附录|全景)/i.test(title) ||
    /* 编号开头的短条目 */
    /^[一二三四五六七八九十]+[、.．：:]/.test(title) ||
    /^\d+[、.．]\s*\S/.test(title)

  if (!isTocTitle) return false

  /* 标题匹配目录格式后，检查内容是否为真正的长段落正文 */
  /* 如果内容是多行短文（其他目录项）或较短文字，仍视为目录项 */
  if (content.length > 200) {
    /* 检查是否为连续长段落（非多行短条目） */
    const lines = content.split('\n').filter(l => l.trim())
    const avgLineLen = content.length / Math.max(1, lines.length)
    if (avgLineLen > 80) return false /* 每行平均超过80字=真正的正文 */
  }

  return true
}

function reAnalyzeSections(entries) {
  if (!entries || entries.length === 0) return entries

  /* 检查是否全部为 body 类型（或无类型） */
  const allBody = entries.every(e => !e.type || e.type === 'body')
  if (!allBody) return entries

  /* ====== 第一步：文本清洗 ====== */
  let cleaned = entries.map(e => ({
    ...e,
    title: cleanText(e.title || ''),
    content: cleanText(e.content || '')
  }))

  /* ====== 第二步：合并断裂标题 ====== */
  /* 相邻的短标题（<15字）且无内容，可能是 OCR 拆开的同一标题 */
  const preMerged = []
  for (let i = 0; i < cleaned.length; i++) {
    const cur = cleaned[i]
    const curTitle = cur.title.trim()
    const curContent = cur.content.trim()
    if (curTitle.length > 0 && curTitle.length < 15 && !curContent && i + 1 < cleaned.length) {
      const next = cleaned[i + 1]
      const nextTitle = next.title.trim()
      const nextContent = next.content.trim()
      /* 下一条也是短标题无内容，合并为一个标题 */
      if (nextTitle.length > 0 && nextTitle.length < 20 && !nextContent) {
        cleaned[i + 1] = { ...next, title: curTitle + ' ' + nextTitle }
        continue /* 跳过当前，下轮处理合并后的 */
      }
    }
    preMerged.push(cur)
  }
  cleaned = preMerged

  /* ====== 第三步：找目录并合并后续目录项 ====== */
  let tocIdx = -1
  for (let i = 0; i < cleaned.length; i++) {
    const title = cleaned[i].title.replace(/^[◆◇●○■□★☆·•▶▪►\-–—\s]+/, '').trim()
    if (/^(目录|目次|contents|table\s+of\s+contents)$/i.test(title)) {
      tocIdx = i
      break
    }
  }

  let mergedEntries = cleaned
  if (tocIdx >= 0) {
    mergedEntries = []
    let tocEntry = { ...cleaned[tocIdx] }
    let tocLines = tocEntry.content ? [tocEntry.content.trim()] : []
    let merging = false

    for (let i = 0; i < cleaned.length; i++) {
      if (i === tocIdx) { merging = true; continue }
      if (merging && isTocLikeEntry(cleaned[i])) {
        const line = (cleaned[i].title || '').trim()
        if (line) tocLines.push(line)
        continue
      }
      if (merging) {
        tocEntry.content = tocLines.join('\n')
        tocEntry.type = 'toc'
        mergedEntries.push(tocEntry)
        merging = false
      }
      mergedEntries.push(cleaned[i])
    }
    if (merging) {
      tocEntry.content = tocLines.join('\n')
      tocEntry.type = 'toc'
      mergedEntries.push(tocEntry)
    }
    const beforeToc = cleaned.slice(0, tocIdx)
    mergedEntries = [...beforeToc, ...mergedEntries]
  }

  /* ====== 第四步：识别文档层级 ====== */
  let hasDocTitle = false
  let hasAuthor = false
  const result = mergedEntries.map((entry, idx) => {
    if (entry.type === 'toc') return entry

    const rawTitle = (entry.title || '').trim()
    const content = (entry.content || '').trim()
    const title = rawTitle.replace(/^[◆◇●○■□★☆·•▶▪►\-–—\s]+/, '').trim()
    let newType = 'body'

    /* === 封面页/文档标题（一级）：前3个条目中的短标题 === */
    if (!hasDocTitle && idx < 3 && title.length > 0 && title.length <= 50) {
      if (/牧师|传道|弟兄|姊妹|[著编译撰整理]|作者|译者|编者|by\s/i.test(title)) {
        newType = 'author'
        hasAuthor = true
      } else if (!content || content.length < 20) {
        newType = 'document_title'
        hasDocTitle = true
      }
    }

    /* === 作者 === */
    if (newType === 'body' && !hasAuthor && idx < 6 &&
        title.length > 0 && title.length <= 30 && (!content || content.length < 10)) {
      if (/牧师|传道[人]?|弟兄|姊妹|[著编译撰整理]|作者|译者|编者|pastor|by\s|——/i.test(title)) {
        newType = 'author'
        hasAuthor = true
      }
    }

    /* === 一级标题（篇章级）：序言/前言/全景/总论/导论 === */
    if (newType === 'body' && /^(序言|前言|引言|简介|概论|导论|绪论|概述|总论|结语|附录|跋|全景|preface|introduction|conclusion|epilogue)/i.test(title)) {
      newType = 'preface'
    }

    /* === 二级标题（章级）：第X章 / X章 / Chapter X === */
    if (newType === 'body') {
      if (/^第[\s\d一二三四五六七八九十百零〇]+[章篇部]/.test(title) ||
          /^\d+\s*章/.test(title) ||
          /^(chapter|part)\s+\d+/i.test(title) ||
          /^卷[一二三四五六七八九十\d]+/.test(title) ||
          (/^[A-Z\s]{5,}$/.test(title) && title.length <= 40)) {
        newType = 'chapter_title'
      }
    }

    /* === 三级标题（章内单元）：第X单元 / (1-12) 范围标题 === */
    if (newType === 'body' && title.length > 0 && title.length <= 60) {
      if (/^第[\s\d一二三四五六七八九十]+单元/.test(title) ||
          /^单元[\s\d一二三四五六七八九十]+/.test(title) ||
          /^[（(]\s*\d+[-–—~～至到]\d+\s*[）)]\s*\S/.test(title) ||
          /^第[\s\d一二三四五六七八九十]+段/.test(title)) {
        newType = 'unit_title'
      }
    }

    /* === 四级标题（主题小节）：编号开头的短标题 === */
    if (newType === 'body' && title.length > 0 && title.length <= 50 && (
      /^[一二三四五六七八九十]+[、.．：:]/.test(title) ||
      /^\d+[、.．]\s*\S/.test(title) ||
      /^[（(]\s*\d+\s*[）)]/.test(title) ||
      /^[IVXLC]+[、.．]/.test(title)
    )) {
      newType = 'section_title'
    }

    /* === 节标题 === */
    if (newType === 'body' && /^节\s+/.test(title)) {
      newType = 'section_title'
    }

    /* === 经文引用 === */
    if (newType === 'body') {
      const checkText = title || (content ? content.split('\n')[0] : '')
      if (/^\d+\s*[：:]\s*\d+/.test(checkText) ||
          /^\s*[\(（]?\s*[一二三\u4e00-\u9fff]{1,8}\s*\d{1,3}\s*[：:章篇]/.test(checkText) ||
          /^\s*[\(（]?\s*[123]?\s*[A-Za-z]{2,15}\.?\s+\d{1,3}\s*[：:]/.test(checkText) ||
          /^\s*[\(（]?\s*\d{1,3}\s*[：:]\s*\d{1,3}\s*[-–—~～至到]\s*\d{1,3}/.test(checkText)) {
        newType = 'verse_ref'
      }
    }

    /* === 编号注释段：内容主要由 ①②③ 组成 === */
    if (newType === 'body') {
      const numberedCount = (content.match(/[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]/g) || []).length
      if (numberedCount >= 2) {
        newType = 'numbered_note'
      }
    }

    /* === 多行经文引用块：标题为经文引用、内容为多行经文正文 === */
    if (newType === 'verse_ref' && content) {
      const contentLines = content.split('\n').filter(l => l.trim())
      if (contentLines.length >= 2) {
        const avgLen = content.length / contentLines.length
        /* 多行短行（平均<60字）= 经文引用块 */
        if (avgLen < 60) {
          newType = 'scripture_block'
        }
      }
    }

    /* === 多行诗歌/引文检测（非经文引用的多行短句） === */
    if (newType === 'body' && content) {
      const contentLines = content.split('\n').filter(l => l.trim())
      if (contentLines.length >= 3) {
        const avgLen = content.length / contentLines.length
        const allShort = contentLines.every(l => l.trim().length < 50)
        /* 多行短句（平均<40字、全部<50字）= 诗歌/引文块 */
        if (avgLen < 40 && allShort) {
          newType = 'scripture_block'
        }
      }
    }

    /* === 注释/补充说明检测 === */
    if (newType === 'body' && title.length > 0) {
      if (/^(注[：:]|说明[：:]|补充[：:]|备注[：:]|按[：:]|附注[：:]|Note[：:])/i.test(title)) {
        newType = 'numbered_note'
      }
    }

    /* === 正文中埋藏的小节标题提取 === */
    /* 如果 body 块的标题是短句（<30字）且内容较长，标题可能是小节标题 */
    if (newType === 'body' && title.length > 2 && title.length <= 30 &&
        content.length > 50 && !title.includes('。') && !title.includes('，')) {
      /* 标题不含逗号句号 = 很可能是小节标题而非正文开头 */
      newType = 'section_title'
    }

    return { ...entry, title: rawTitle, content, type: newType }
  })

  return result
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

/* ====== 段落内联编辑 ====== */

/** 当前正在编辑的段落索引（-1 表示未编辑） */
const editingIndex = ref(-1)

/** 编辑器保存中 */
const editSaving = ref(false)

/** 编辑器内容（标题+正文） */
const editTitle = ref('')
const editContent = ref('')

/** Tiptap 编辑器实例（直接使用 Editor 类） */
const inlineEditor = ref(null)

/** 开始编辑某个段落 */
function startEdit(idx) {
  /* 先销毁旧编辑器 */
  if (inlineEditor.value) {
    inlineEditor.value.destroy()
    inlineEditor.value = null
  }

  const sec = sections.value[idx]
  editingIndex.value = idx
  editTitle.value = sec.title || ''

  /* 将纯文本转为简单 HTML 供编辑器使用 */
  const htmlContent = (sec.content || '').split('\n').filter(l => l.trim()).map(l => `<p>${escapeHtml(l)}</p>`).join('')
  editContent.value = htmlContent

  nextTick(() => {
    inlineEditor.value = new Editor({
      content: htmlContent,
      extensions: [
        StarterKit,
        Underline,
        Highlight.configure({ multicolor: true }),
        TextAlign.configure({ types: ['heading', 'paragraph'] })
      ]
    })
  })
}

/** 取消编辑 */
function cancelEdit() {
  editingIndex.value = -1
  editTitle.value = ''
  editContent.value = ''
  if (inlineEditor.value) {
    inlineEditor.value.destroy()
    inlineEditor.value = null
  }
}

/** 从编辑器 HTML 提取纯文本（去除 HTML 标签，保留换行） */
function htmlToPlainText(html) {
  if (!html) return ''
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .trim()
}

/** 保存段落编辑 */
async function saveEdit() {
  if (editingIndex.value < 0) return
  editSaving.value = true

  try {
    const idx = editingIndex.value
    /* 从编辑器获取最新 HTML 并转为纯文本 */
    const editorHtml = inlineEditor.value?.getHTML() || ''
    const plainContent = htmlToPlainText(editorHtml)

    /* 更新本地 sections 数据 */
    const updatedSections = [...sections.value]
    updatedSections[idx] = {
      ...updatedSections[idx],
      title: editTitle.value,
      content: plainContent
    }
    sections.value = updatedSections

    /* 构造完整 contentJson 保存到后端 */
    const contentJson = JSON.stringify(updatedSections.map(s => ({
      type: s.type || 'body',
      title: s.title || '',
      content: s.content || ''
    })))

    await updateResource(resourceId, { contentJson })

    /* 关闭编辑器 */
    cancelEdit()
  } catch (e) {
    console.error('保存段落失败:', e)
  } finally {
    editSaving.value = false
  }
}

/** 智能排版状态 */
const smartFormatting = ref(false)

/**
 * 智能排版：重置所有类型为 body，重新分析结构，保存到后端
 */
async function handleSmartFormat() {
  if (smartFormatting.value || sections.value.length === 0) return
  smartFormatting.value = true

  try {
    /* 将所有条目类型重置为 body，让 reAnalyzeSections 重新分析 */
    const resetEntries = sections.value.map(s => ({
      type: 'body',
      title: s.title || '',
      content: s.content || ''
    }))

    /* 重新智能分析结构 */
    const analyzed = reAnalyzeSections(resetEntries)
    sections.value = analyzed

    /* 保存到后端 */
    const contentJson = JSON.stringify(analyzed.map(s => ({
      type: s.type || 'body',
      title: s.title || '',
      content: s.content || ''
    })))
    await updateResource(resourceId, { contentJson })
  } catch (e) {
    console.error('智能排版失败:', e)
  } finally {
    smartFormatting.value = false
  }
}

onMounted(() => { loadDetail() })

onBeforeUnmount(() => {
  if (inlineEditor.value) {
    inlineEditor.value.destroy()
  }
})
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
        <button
          class="smart-fmt-btn"
          @click="handleSmartFormat"
          :disabled="smartFormatting || sections.length === 0"
          :aria-label="t('smart_format')"
          :aria-busy="smartFormatting"
        >
          {{ smartFormatting ? '...' : t('smart_format') }}
        </button>
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
          @click.self="cancelEdit"
        >
          <div
            v-for="(sec, idx) in sections"
            :key="idx"
            :id="'section-' + idx"
            :class="[
              'section-block',
              'section-editable',
              viewMode === 'smart' ? 'smart-block smart-block-' + (sec.type || 'body') : 'plain-block',
              { 'section-editing': editingIndex === idx }
            ]"
            @click.stop="editingIndex !== idx && startEdit(idx)"
          >

            <!-- 内联编辑器 -->
            <div v-if="editingIndex === idx" class="inline-editor-wrap">
              <!-- 标题编辑 -->
              <div class="inline-editor-title-row">
                <label class="inline-editor-label">{{ t('inline_edit_title') }}</label>
                <input
                  v-model="editTitle"
                  class="inline-editor-title-input"
                  :placeholder="t('inline_edit_title')"
                  :aria-label="t('inline_edit_title')"
                />
              </div>

              <!-- 富文本工具栏 -->
              <div v-if="inlineEditor" class="inline-toolbar">
                <button class="it-btn" :class="{ 'it-active': inlineEditor.isActive('bold') }" @click="inlineEditor.chain().focus().toggleBold().run()" :title="t('inline_bold')"><b>B</b></button>
                <button class="it-btn" :class="{ 'it-active': inlineEditor.isActive('italic') }" @click="inlineEditor.chain().focus().toggleItalic().run()" :title="t('inline_italic')"><i>I</i></button>
                <button class="it-btn" :class="{ 'it-active': inlineEditor.isActive('underline') }" @click="inlineEditor.chain().focus().toggleUnderline().run()" :title="t('inline_underline')"><u>U</u></button>
                <button class="it-btn" :class="{ 'it-active': inlineEditor.isActive('strike') }" @click="inlineEditor.chain().focus().toggleStrike().run()" :title="t('inline_strike')"><s>S</s></button>
                <div class="it-sep"></div>
                <button class="it-btn" :class="{ 'it-active': inlineEditor.isActive('heading', { level: 2 }) }" @click="inlineEditor.chain().focus().toggleHeading({ level: 2 }).run()" title="H2">H2</button>
                <button class="it-btn" :class="{ 'it-active': inlineEditor.isActive('heading', { level: 3 }) }" @click="inlineEditor.chain().focus().toggleHeading({ level: 3 }).run()" title="H3">H3</button>
                <button class="it-btn" :class="{ 'it-active': inlineEditor.isActive('heading', { level: 4 }) }" @click="inlineEditor.chain().focus().toggleHeading({ level: 4 }).run()" title="H4">H4</button>
                <div class="it-sep"></div>
                <button class="it-btn" :class="{ 'it-active': inlineEditor.isActive('bulletList') }" @click="inlineEditor.chain().focus().toggleBulletList().run()" :title="t('inline_bullet_list')">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 19h14v-2H7v2zm0-6h14v-2H7v2zm0-8v2h14V5H7z"/></svg>
                </button>
                <button class="it-btn" :class="{ 'it-active': inlineEditor.isActive('orderedList') }" @click="inlineEditor.chain().focus().toggleOrderedList().run()" :title="t('inline_ordered_list')">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M2 17h2v.5H3v1h1v.5H2v1h3v-4H2v1zm1-9h1V4H2v1h1v3zm-1 3h1.8L2 13.1v.9h3v-1H3.2L5 10.9V10H2v1zm5-6v2h14V5H7zm0 14h14v-2H7v2zm0-6h14v-2H7v2z"/></svg>
                </button>
                <div class="it-sep"></div>
                <button class="it-btn" :class="{ 'it-active': inlineEditor.isActive('blockquote') }" @click="inlineEditor.chain().focus().toggleBlockquote().run()" :title="t('inline_blockquote')">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 17h3l2-4V7H5v6h3zm8 0h3l2-4V7h-6v6h3z"/></svg>
                </button>
                <button class="it-btn" :class="{ 'it-active': inlineEditor.isActive('highlight') }" @click="inlineEditor.chain().focus().toggleHighlight().run()" :title="t('inline_highlight')">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-1 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8z"/></svg>
                </button>
                <div class="it-sep"></div>
                <button class="it-btn" @click="inlineEditor.chain().focus().undo().run()" :disabled="!inlineEditor.can().undo()" :title="t('rte_undo')">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg>
                </button>
                <button class="it-btn" @click="inlineEditor.chain().focus().redo().run()" :disabled="!inlineEditor.can().redo()" :title="t('rte_redo')">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z"/></svg>
                </button>
              </div>

              <!-- 编辑器内容区 -->
              <editor-content v-if="inlineEditor" :editor="inlineEditor" class="inline-editor-content" />

              <!-- 操作按钮 -->
              <div class="inline-editor-actions">
                <button class="inline-save-btn" @click="saveEdit" :disabled="editSaving" :aria-busy="editSaving">
                  {{ editSaving ? t('inline_saving') : t('save') }}
                </button>
                <button class="inline-cancel-btn" @click="cancelEdit" :disabled="editSaving">
                  {{ t('cancel') }}
                </button>
              </div>
            </div>

            <!-- 非编辑状态：正常显示内容 -->
            <template v-if="editingIndex !== idx">
              <!-- 智能模式 -->
              <template v-if="viewMode === 'smart'">
                <!-- 章标题前加分隔线（非第一个） -->
                <div v-if="sec.type === 'chapter_title' && idx > 0" class="chapter-divider"></div>

                <!-- 一级：文档标题（封面） -->
                <div v-if="sec.type === 'document_title'" class="smart-doc-title">
                  <h1>{{ cleanTitle(sec.title) }}</h1>
                  <div v-if="sec.content" class="smart-doc-subtitle" v-html="formatContent(sec.content)"></div>
                </div>

                <!-- 作者 -->
                <div v-else-if="sec.type === 'author'" class="smart-author">
                  {{ cleanTitle(sec.title) }}
                </div>

                <!-- 目录（重建为规范结构，不照抄原断行） -->
                <div v-else-if="sec.type === 'toc'" class="smart-toc">
                  <div class="smart-toc-label">{{ cleanTitle(sec.title) }}</div>
                  <ul class="smart-toc-list">
                    <li
                      v-for="(item, lIdx) in rebuildTocContent(sec.content)"
                      :key="lIdx"
                      class="smart-toc-item"
                      :class="'toc-level-' + item.level"
                    >{{ item.text }}</li>
                  </ul>
                </div>

                <!-- 一级：序言/前言/全景/总论（篇章级） -->
                <div v-else-if="sec.type === 'preface'" class="smart-preface">
                  <div class="smart-preface-label">{{ cleanTitle(sec.title) }}</div>
                  <div class="smart-preface-body" v-html="formatContent(sec.content)"></div>
                </div>

                <!-- 二级：章标题 -->
                <div v-else-if="sec.type === 'chapter_title'" class="smart-chapter">
                  <h2>{{ cleanTitle(sec.title) }}</h2>
                  <div v-if="sec.content" class="smart-chapter-body" v-html="formatContent(sec.content)"></div>
                </div>

                <!-- 三级：章内单元标题 -->
                <div v-else-if="sec.type === 'unit_title'" class="smart-unit">
                  <h3>{{ cleanTitle(sec.title) }}</h3>
                  <div v-if="sec.content" class="smart-unit-body" v-html="formatContent(sec.content)"></div>
                </div>

                <!-- 四级：主题小节标题 -->
                <div v-else-if="sec.type === 'section_title'" class="smart-section">
                  <h4>{{ cleanTitle(sec.title) }}</h4>
                  <div v-if="sec.content" class="smart-section-body" v-html="formatContent(sec.content)"></div>
                </div>

                <!-- 经文引用 -->
                <div v-else-if="sec.type === 'verse_ref'" class="smart-verse">
                  <div class="smart-verse-ref">{{ cleanTitle(sec.title) }}</div>
                  <div v-if="sec.content" class="smart-verse-body" v-html="formatContent(sec.content)"></div>
                </div>

                <!-- 多行经文引用块（独立排版） -->
                <div v-else-if="sec.type === 'scripture_block'" class="smart-scripture">
                  <div class="smart-scripture-ref">{{ cleanTitle(sec.title) }}</div>
                  <blockquote v-if="sec.content" class="smart-scripture-body">{{ sec.content }}</blockquote>
                </div>

                <!-- 编号注释段（①②③） -->
                <div v-else-if="sec.type === 'numbered_note'" class="smart-numbered">
                  <div v-if="sec.title" class="smart-numbered-title">{{ cleanTitle(sec.title) }}</div>
                  <div class="smart-numbered-body" v-html="formatContent(sec.content)"></div>
                </div>

                <!-- 正文 -->
                <div v-else class="smart-body">
                  <div v-if="sec.title" class="smart-body-title">{{ cleanTitle(sec.title) }}</div>
                  <div class="smart-body-content" v-html="formatContent(sec.content)"></div>
                </div>
              </template>

              <!-- 原文模式：完全尊重原始格式，不做任何排版调整 -->
              <template v-else>
                <div v-if="sec.title" class="original-title">{{ sec.title }}</div>
                <div v-if="sec.content" class="original-content" v-html="formatPlainContent(sec.content)"></div>
              </template>
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
                <div v-if="sec.title" class="original-title">{{ sec.title }}</div>
                <div v-if="sec.content" class="original-content" v-html="formatPlainContent(sec.content)"></div>
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
                <div v-else-if="sec.type === 'toc'" class="smart-toc">
                  <div class="smart-toc-label">{{ cleanTitle(sec.title) }}</div>
                  <ul class="smart-toc-list">
                    <li v-for="(item, lIdx) in rebuildTocContent(sec.content)" :key="lIdx" class="smart-toc-item" :class="'toc-level-' + item.level">{{ item.text }}</li>
                  </ul>
                </div>
                <div v-else-if="sec.type === 'preface'" class="smart-preface">
                  <div class="smart-preface-label">{{ cleanTitle(sec.title) }}</div>
                  <div class="smart-preface-body" v-html="formatContent(sec.content)"></div>
                </div>
                <div v-else-if="sec.type === 'chapter_title'" class="smart-chapter">
                  <h2>{{ cleanTitle(sec.title) }}</h2>
                  <div v-if="sec.content" class="smart-chapter-body" v-html="formatContent(sec.content)"></div>
                </div>
                <div v-else-if="sec.type === 'unit_title'" class="smart-unit">
                  <h3>{{ cleanTitle(sec.title) }}</h3>
                  <div v-if="sec.content" class="smart-unit-body" v-html="formatContent(sec.content)"></div>
                </div>
                <div v-else-if="sec.type === 'section_title'" class="smart-section">
                  <h4>{{ cleanTitle(sec.title) }}</h4>
                  <div v-if="sec.content" class="smart-section-body" v-html="formatContent(sec.content)"></div>
                </div>
                <div v-else-if="sec.type === 'verse_ref'" class="smart-verse">
                  <div class="smart-verse-ref">{{ cleanTitle(sec.title) }}</div>
                  <div v-if="sec.content" class="smart-verse-body" v-html="formatContent(sec.content)"></div>
                </div>
                <div v-else-if="sec.type === 'scripture_block'" class="smart-scripture">
                  <div class="smart-scripture-ref">{{ cleanTitle(sec.title) }}</div>
                  <blockquote v-if="sec.content" class="smart-scripture-body">{{ sec.content }}</blockquote>
                </div>
                <div v-else-if="sec.type === 'numbered_note'" class="smart-numbered">
                  <div v-if="sec.title" class="smart-numbered-title">{{ cleanTitle(sec.title) }}</div>
                  <div class="smart-numbered-body" v-html="formatContent(sec.content)"></div>
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
.smart-fmt-btn {
  font-size: 12px;
  padding: 4px 12px;
  border: 1px solid #b8860b;
  border-radius: 4px;
  background: transparent;
  color: #b8860b;
  cursor: pointer;
  margin-left: 8px;
  transition: all 0.2s;
}

.smart-fmt-btn:hover {
  background: #b8860b;
  color: #fff;
}

.smart-fmt-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

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
.sidebar-type-chapter_title .sidebar-name,
.sidebar-type-preface .sidebar-name { font-weight: 600; }
.sidebar-type-unit_title .sidebar-name { font-weight: 500; }
.sidebar-type-author .sidebar-name { font-style: italic; color: var(--church-warm-gray, #8a8178); }
.sidebar-type-verse_ref .sidebar-name,
.sidebar-type-scripture_block .sidebar-name { color: #8b6914; }
.sidebar-type-numbered_note .sidebar-name { color: #5a8a6e; }

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

/* ========== 原文模式（完全保留原始格式） ========== */
.plain-block {
  margin-bottom: 16px;
}

.original-title {
  margin: 0 0 4px 0;
}

.original-content {
  color: inherit;
  line-height: inherit;
}

/**
 * ========== 智能模式排版系统（书稿/注释规格） ==========
 *
 * 颜色系统（克制得体，仅三类）：
 *   正文色：#222222
 *   标题色：#1F1F1F / #2C3E50 / #34495E / #4A6072
 *   注释/引用色：#555555
 *
 * 字体系统：
 *   标题：黑体系（Noto Sans CJK SC / Microsoft YaHei / sans-serif）
 *   正文/序言：宋体系（Noto Serif CJK SC / SimSun / serif）
 *   经文引用：楷体系（KaiTi / STKaiti / serif）
 *
 * 四级标题层级：
 *   一级（序言/章/全景）：18px 700  #1F1F1F  段前24px 段后13px
 *   二级（单元）：        15px 700  #2C3E50  段前18px 段后8px
 *   三级（小节）：        13px 700  #34495E  段前13px 段后5px
 *   四级（注释性标题）：  12px 600  #4A6072  段前10px 段后4px
 *
 * 正文：14px #222222  行距1.65  首行缩进2字符  段后6px
 */

/* --- 字体族变量 --- */
.smart-block {
  --smart-font-heading: "Noto Sans CJK SC", "Source Han Sans SC", "Microsoft YaHei", "PingFang SC", sans-serif;
  --smart-font-body: "Noto Serif CJK SC", "Source Han Serif SC", "SimSun", "STSong", serif;
  --smart-font-scripture: "KaiTi", "STKaiti", "FangSong", serif;
}

/* --- 块间距（留白节奏：标题前大 > 标题后中 > 段落后小） --- */
.smart-block { margin-bottom: 6px; }
.smart-block-document_title { margin-bottom: 4px; }
.smart-block-author { margin-bottom: 32px; }
.smart-block-chapter_title { margin-bottom: 13px; }
.smart-block-preface { margin-bottom: 24px; }
.smart-block-unit_title { margin-bottom: 8px; }
.smart-block-section_title { margin-bottom: 5px; }
.smart-block-verse_ref { margin-bottom: 14px; }
.smart-block-scripture_block { margin-bottom: 18px; }
.smart-block-numbered_note { margin-bottom: 14px; }
.smart-block-toc { margin-bottom: 36px; }
.smart-block-body { margin-bottom: 6px; }

/* --- 章标题/序言前分隔线（强制分页感） --- */
.chapter-divider {
  height: 1px;
  background: linear-gradient(to right, transparent, #d4cdc4 15%, #d4cdc4 85%, transparent);
  margin: 56px 0 28px 0;
}

/* --- h1 文档标题（封面页） --- */
.smart-doc-title {
  text-align: center;
  padding: 32px 0 10px 0;
}
.smart-doc-title h1 {
  font-family: var(--smart-font-heading);
  font-size: 22px;
  font-weight: 700;
  color: #1F1F1F;
  margin: 0;
  letter-spacing: 1.5px;
  line-height: 1.4;
}
.smart-doc-subtitle {
  font-family: var(--smart-font-body);
  font-size: 13px;
  color: #8a8178;
  margin-top: 8px;
  line-height: 1.5;
}

/* --- 作者信息 --- */
.smart-author {
  text-align: center;
  font-family: var(--smart-font-body);
  font-size: 13px;
  color: #6B5B53;
  padding-bottom: 24px;
  border-bottom: 1px solid #e0d8cf;
}

/* --- 目录（重建结构，分层缩进） --- */
.smart-toc {
  padding: 12px 0;
  border-bottom: 1px solid #e0d8cf;
}
.smart-toc-label {
  font-family: var(--smart-font-heading);
  font-size: 18px;
  font-weight: 700;
  color: #1F1F1F;
  margin-bottom: 14px;
  text-align: center;
}
.smart-toc-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.smart-toc-item {
  font-family: var(--smart-font-heading);
  font-size: 13px;
  color: #2B2B2B;
  padding: 4px 0;
  line-height: 1.45;
}
/* 目录层级缩进 */
.smart-toc-item.toc-level-0 {
  font-weight: 600;
  color: #1F1F1F;
  padding-left: 0;
  margin-top: 8px;
}
.smart-toc-item.toc-level-1 {
  padding-left: 20px;
  font-weight: 400;
}
.smart-toc-item.toc-level-2 {
  padding-left: 40px;
  font-size: 12px;
  color: #555;
  font-weight: 400;
}

/* --- 一级：序言/全景/总论（篇章级） --- */
.smart-preface {
  padding: 24px 0 13px 0;
}
.smart-preface-label {
  font-family: var(--smart-font-heading);
  font-size: 18px;
  font-weight: 700;
  color: #1F1F1F;
  margin-bottom: 13px;
}
.smart-preface-body {
  font-family: var(--smart-font-body);
  font-size: 14px;
  color: #222222;
  line-height: 1.65;
}

/* --- 二级：章标题 --- */
.smart-chapter {
  padding: 24px 0 8px 0;
}
.smart-chapter h2 {
  font-family: var(--smart-font-heading);
  font-size: 18px;
  font-weight: 700;
  color: #1F1F1F;
  margin: 0;
  line-height: 1.4;
}
.smart-chapter-body {
  font-family: var(--smart-font-body);
  font-size: 13px;
  color: #8a8178;
  margin-top: 5px;
  line-height: 1.5;
}

/* --- 三级：章内单元标题 --- */
.smart-unit {
  padding: 18px 0 5px 0;
}
.smart-unit h3 {
  font-family: var(--smart-font-heading);
  font-size: 15px;
  font-weight: 700;
  color: #2C3E50;
  margin: 0;
  line-height: 1.4;
}
.smart-unit-body {
  font-family: var(--smart-font-body);
  font-size: 14px;
  color: #222222;
  line-height: 1.65;
  margin-top: 8px;
}

/* --- 四级：主题小节标题 --- */
.smart-section {
  padding: 13px 0 4px 0;
}
.smart-section h4 {
  font-family: var(--smart-font-heading);
  font-size: 13px;
  font-weight: 700;
  color: #34495E;
  margin: 0;
  line-height: 1.4;
}
.smart-section-body {
  font-family: var(--smart-font-body);
  font-size: 14px;
  color: #222222;
  line-height: 1.65;
  margin-top: 5px;
}

/* --- 经文引用（短引） --- */
.smart-verse {
  padding: 10px 0 4px 0;
}
.smart-verse-ref {
  font-family: var(--smart-font-heading);
  font-size: 13px;
  font-weight: 600;
  color: #6B5B53;
  margin-bottom: 4px;
}
.smart-verse-body {
  font-family: var(--smart-font-body);
  font-size: 14px;
  color: #222222;
  line-height: 1.65;
}

/* --- 多行经文引用块（独立排版，有视觉区隔） --- */
.smart-scripture {
  padding: 8px 0;
}
.smart-scripture-ref {
  font-family: var(--smart-font-heading);
  font-size: 13px;
  font-weight: 600;
  color: #6B5B53;
  margin-bottom: 8px;
}
.smart-scripture-body {
  font-family: var(--smart-font-scripture);
  font-size: 13px;
  color: #444444;
  line-height: 1.9;
  margin: 0;
  padding: 10px 16px 10px 14px;
  border-left: 3px solid #D8D8D8;
  background: transparent;
  white-space: pre-wrap;
}

/* --- 编号注释段（①②③） --- */
.smart-numbered {
  padding: 6px 0;
}
.smart-numbered-title {
  font-family: var(--smart-font-heading);
  font-size: 14px;
  font-weight: 600;
  color: #222222;
  margin-bottom: 8px;
}
.smart-numbered-body {
  font-family: var(--smart-font-body);
  font-size: 14px;
  color: #222222;
  line-height: 1.65;
}

/* --- 正文 --- */
.smart-body {
  padding: 0;
}
.smart-body-title {
  font-family: var(--smart-font-heading);
  font-size: 12px;
  font-weight: 600;
  color: #4A6072;
  margin-bottom: 4px;
}
.smart-body-content {
  font-family: var(--smart-font-body);
  font-size: 14px;
  color: #222222;
  line-height: 1.65;
}

/* --- 段落排版规则 --- */
/* 每段≤200字，首行缩进2字符，段后6px */
.smart-block :deep(.smart-paragraph) {
  margin: 0 0 6px 0;
  text-indent: 2em;
}
.smart-block :deep(.smart-paragraph:last-child) {
  margin-bottom: 0;
}
/* 编号段落不缩进（编号自带视觉起点） */
.smart-block :deep(.numbered-paragraph) {
  text-indent: 0;
  padding-left: 0.5em;
  margin-bottom: 10px;
}
/* 编号符号高亮（克制：深色不抢眼） */
.smart-block :deep(.note-number) {
  color: #1F1F1F;
  font-weight: 700;
  margin-right: 4px;
}
/* 内联经文引用块（formatContent 生成） */
.smart-block :deep(.scripture-quote) {
  font-family: var(--smart-font-scripture);
  font-size: 13px;
  color: #444444;
  line-height: 1.9;
  margin: 8px 0;
  padding: 8px 14px;
  border-left: 3px solid #D8D8D8;
  background: transparent;
}

/* --- 经文引用高亮（克制：只标记引用，不过度装饰） --- */
.smart-block :deep(.verse-highlight) {
  color: #6B5B53;
  font-weight: 500;
}

/* ========== 段落内联编辑 ========== */

/* 可编辑段落：点击进入编辑 */
.section-editable {
  position: relative;
  cursor: pointer;
  border-radius: 6px;
  transition: background 0.15s, box-shadow 0.15s;
}
.section-editable:hover {
  background: rgba(90, 138, 110, 0.04);
  box-shadow: 0 0 0 2px rgba(90, 138, 110, 0.12);
}
/* 编辑中的段落不显示 hover 样式 */
.section-editing {
  cursor: default;
  background: transparent !important;
  box-shadow: none !important;
}

/* 编辑器容器 */
.inline-editor-wrap {
  border: 2px solid #5a8a6e;
  border-radius: 6px;
  background: #fff;
  overflow: hidden;
}

/* 标题编辑行 */
.inline-editor-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid #e8e8e8;
}
.inline-editor-label {
  font-size: 12px;
  color: #888;
  white-space: nowrap;
  flex-shrink: 0;
}
.inline-editor-title-input {
  flex: 1;
  font-size: 14px;
  font-weight: 600;
  border: none;
  outline: none;
  color: var(--church-charcoal, #3a3a3a);
  background: transparent;
  padding: 4px 0;
}
.inline-editor-title-input:focus {
  border-bottom: 1px solid #5a8a6e;
}

/* 工具栏 */
.inline-toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 6px 10px;
  background: #f9fafb;
  border-bottom: 1px solid #e8e8e8;
  flex-wrap: wrap;
}
.it-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 28px;
  border: 1px solid transparent;
  border-radius: 3px;
  background: transparent;
  color: #555;
  cursor: pointer;
  font-size: 13px;
  padding: 0 4px;
  transition: all 0.12s;
}
.it-btn:hover {
  background: #e8f0eb;
  border-color: #c0d4c8;
}
.it-btn.it-active {
  background: #d4e5db;
  border-color: #a0c4af;
  color: #2d5e3e;
}
.it-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.it-sep {
  width: 1px;
  height: 20px;
  background: #d0d3d9;
  margin: 0 4px;
}

/* 编辑器内容区 */
.inline-editor-content {
  min-height: 120px;
  max-height: 400px;
  overflow-y: auto;
  padding: 12px 16px;
}
.inline-editor-content :deep(.tiptap) {
  outline: none;
  min-height: 100px;
  font-size: 14px;
  line-height: 1.8;
  color: #333;
}
.inline-editor-content :deep(.tiptap p) {
  margin: 0 0 0.5em 0;
}
.inline-editor-content :deep(.tiptap h2) {
  font-size: 18px;
  font-weight: 700;
  margin: 0.6em 0 0.3em 0;
}
.inline-editor-content :deep(.tiptap h3) {
  font-size: 16px;
  font-weight: 600;
  margin: 0.5em 0 0.3em 0;
}
.inline-editor-content :deep(.tiptap h4) {
  font-size: 15px;
  font-weight: 600;
  margin: 0.4em 0 0.2em 0;
}
.inline-editor-content :deep(.tiptap blockquote) {
  border-left: 3px solid #c5b358;
  padding-left: 12px;
  margin: 0.5em 0;
  color: #555;
}
.inline-editor-content :deep(.tiptap ul),
.inline-editor-content :deep(.tiptap ol) {
  padding-left: 1.5em;
  margin: 0.4em 0;
}
.inline-editor-content :deep(.tiptap mark) {
  background: #fef3cd;
  border-radius: 2px;
  padding: 0 2px;
}

/* 操作按钮区 */
.inline-editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid #e8e8e8;
  background: #fafafa;
}
.inline-save-btn {
  font-size: 13px;
  padding: 6px 20px;
  border: none;
  border-radius: 4px;
  background: #5a8a6e;
  color: #fff;
  cursor: pointer;
  transition: background 0.2s;
}
.inline-save-btn:hover { background: #4a7a5e; }
.inline-save-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.inline-cancel-btn {
  font-size: 13px;
  padding: 6px 16px;
  border: 1px solid #d0d3d9;
  border-radius: 4px;
  background: #fff;
  color: #666;
  cursor: pointer;
  transition: all 0.2s;
}
.inline-cancel-btn:hover { background: #f5f5f5; }
.inline-cancel-btn:disabled { opacity: 0.6; cursor: not-allowed; }

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
