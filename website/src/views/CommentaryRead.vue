<script setup>
/**
 * 注释逐节阅读/编辑页面
 * 按书卷和章节浏览注释，支持逐节编辑
 * 富文本编辑器 + AI 智能排版（原版风格 / AI 排版风格）
 */
import { ref, reactive, computed, onMounted, watch, nextTick, onBeforeUnmount, shallowRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { getResourceDetail, updateResource, getResourceList } from '@/api/resource'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, MagicStick, Loading } from '@element-plus/icons-vue'
import { BIBLE_BOOK_NAMES, BOOK_CHAPTER_COUNTS, BIBLE_VERSE_COUNTS } from '@/utils/fileImport'

/** Tiptap 富文本编辑器 */
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyle } from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import FontFamily from '@tiptap/extension-font-family'
import Placeholder from '@tiptap/extension-placeholder'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

/** 资源 ID */
const resourceId = route.params.id

/** 资源数据 */
const resource = ref(null)

/** 元数据 */
const meta = ref({})

/** 注释条目列表 */
const entries = ref([])

/** 加载状态 */
const loading = ref(false)

/** 保存状态 */
const saving = ref(false)

/** 当前选中的书卷索引 */
const currentBookIndex = ref(0)

/** 当前选中的章索引 */
const currentChapterIndex = ref(0)

/** 正在编辑的节号（-1 表示未编辑） */
const editingVerse = ref(-1)

/** AI 排版中的节号 */
const aiFormattingVerse = ref(-1)

/** 对照经文：加载的圣经译本数据 */
const bibleBooks = ref([])

/** 已加载的圣经资源 ID */
const loadedBibleId = ref(null)

/** 所有圣经译本列表 */
const allBibleList = ref([])

/** 选择的圣经译本 ID */
const selectedBibleId = ref(null)

/** 是否显示经文参考 */
const showBibleRef = ref(true)

/** 是否有未保存修改 */
const isDirty = ref(false)

/**
 * 显示模式：original = 原版风格, ai = AI 排版风格
 * 每节注释存两份内容：content（原版） 和 formattedContent（AI 排版后）
 */
const displayMode = ref('original')

/** 当前书卷名 */
const currentBookName = computed(() => BIBLE_BOOK_NAMES[currentBookIndex.value] || '')

/** 当前章数 */
const totalChapters = computed(() => BOOK_CHAPTER_COUNTS[currentBookIndex.value] || 0)

/** 当前章的经文节数 */
const verseCount = computed(() => {
  const vc = BIBLE_VERSE_COUNTS[currentBookIndex.value]
  if (!vc || currentChapterIndex.value >= vc.length) return 0
  return vc[currentChapterIndex.value]
})

/**
 * 构建注释引用键
 * 格式：书名 第N章:M
 */
function buildVerseKey(bookIdx, chapterIdx, verseNum) {
  return `${BIBLE_BOOK_NAMES[bookIdx]} ${t('commentary_chapter_unit', { num: chapterIdx + 1 })}:${verseNum}`
}

/**
 * 解析引用键 → bookIndex, chapter, verse
 */
function parseVerseRef(verseStr) {
  if (!verseStr) return null
  const s = verseStr.trim()
  for (let i = 0; i < BIBLE_BOOK_NAMES.length; i++) {
    const name = BIBLE_BOOK_NAMES[i]
    if (s.startsWith(name)) {
      const rest = s.slice(name.length).trim()
      const m = rest.match(/第?(\d+)[章]?\s*[:：]\s*(\d+)/)
      if (m) {
        return { bookIndex: i, chapter: parseInt(m[1]) - 1, verse: parseInt(m[2]) }
      }
    }
  }
  return null
}

/** 当前章的注释映射：verseNum → entry对象 */
const currentChapterEntries = computed(() => {
  const map = {}
  entries.value.forEach(entry => {
    const parsed = parseVerseRef(entry.verse)
    if (parsed && parsed.bookIndex === currentBookIndex.value && parsed.chapter === currentChapterIndex.value) {
      map[parsed.verse] = entry
    }
  })
  return map
})

/** 当前章有注释的节数 */
const commentedVerseCount = computed(() => Object.keys(currentChapterEntries.value).length)

/** 当前章的经文列表（用于逐节显示） */
const verseList = computed(() => {
  const count = verseCount.value
  const list = []
  for (let i = 1; i <= count; i++) {
    const entry = currentChapterEntries.value[i]
    list.push({
      number: i,
      /** 原版内容 */
      content: entry?.content || '',
      /** AI 排版内容 */
      formattedContent: entry?.formattedContent || '',
      hasComment: !!entry?.content,
      hasFormatted: !!entry?.formattedContent,
      bibleText: getBibleVerseText(i)
    })
  }
  return list
})

/** 根据当前显示模式获取注释内容 */
function getDisplayContent(verse) {
  if (displayMode.value === 'ai' && verse.formattedContent) {
    return verse.formattedContent
  }
  return verse.content
}

/** 获取圣经经文文本（对照用） */
function getBibleVerseText(verseNum) {
  if (!showBibleRef.value || bibleBooks.value.length === 0) return ''
  const book = bibleBooks.value[currentBookIndex.value]
  if (!book || !book.chapters) return ''
  const chapter = book.chapters[currentChapterIndex.value]
  if (!chapter || !chapter.verses) return ''
  const verses = chapter.verses
  if (!Array.isArray(verses)) return ''
  const v = verses.find(item => (item.number || item.verse) === verseNum) || verses[verseNum - 1]
  if (!v) return ''
  return v.text || v.content || (typeof v === 'string' ? v : '')
}

/** ========== Tiptap 富文本编辑器 ========== */

/** 编辑器实例 */
const editor = useEditor({
  extensions: [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4] }
    }),
    Underline,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    TextStyle,
    Color,
    Highlight.configure({ multicolor: true }),
    FontFamily,
    Placeholder.configure({
      placeholder: () => t('commentary_click_to_add')
    })
  ],
  editorProps: {
    attributes: {
      class: 'rich-editor-content'
    }
  },
  onUpdate: () => {
    /* 编辑器内容变化时不做额外处理，保存时统一获取 */
  }
})

/** 字号列表 */
const fontSizeOptions = [12, 13, 14, 16, 18, 20, 24, 28, 32]

/** 当前选择的字号 */
const currentFontSize = ref(14)

/** 行高选项 */
const lineHeightOptions = [1.0, 1.2, 1.5, 1.8, 2.0, 2.5, 3.0]

/** 工具栏按钮操作 */
const toolbarActions = {
  bold: () => editor.value?.chain().focus().toggleBold().run(),
  italic: () => editor.value?.chain().focus().toggleItalic().run(),
  underline: () => editor.value?.chain().focus().toggleUnderline().run(),
  strike: () => editor.value?.chain().focus().toggleStrike().run(),
  heading1: () => editor.value?.chain().focus().toggleHeading({ level: 1 }).run(),
  heading2: () => editor.value?.chain().focus().toggleHeading({ level: 2 }).run(),
  heading3: () => editor.value?.chain().focus().toggleHeading({ level: 3 }).run(),
  paragraph: () => editor.value?.chain().focus().setParagraph().run(),
  bulletList: () => editor.value?.chain().focus().toggleBulletList().run(),
  orderedList: () => editor.value?.chain().focus().toggleOrderedList().run(),
  blockquote: () => editor.value?.chain().focus().toggleBlockquote().run(),
  alignLeft: () => editor.value?.chain().focus().setTextAlign('left').run(),
  alignCenter: () => editor.value?.chain().focus().setTextAlign('center').run(),
  alignRight: () => editor.value?.chain().focus().setTextAlign('right').run(),
  alignJustify: () => editor.value?.chain().focus().setTextAlign('justify').run(),
  horizontalRule: () => editor.value?.chain().focus().setHorizontalRule().run(),
  undo: () => editor.value?.chain().focus().undo().run(),
  redo: () => editor.value?.chain().focus().redo().run(),
  clearFormat: () => editor.value?.chain().focus().clearNodes().unsetAllMarks().run()
}

/** 检查工具栏按钮激活状态 */
function isActive(name, attrs) {
  return editor.value?.isActive(name, attrs) || false
}

/** 设置文本颜色 */
function setTextColor(color) {
  editor.value?.chain().focus().setColor(color).run()
}

/** 设置高亮颜色 */
function setHighlight(color) {
  if (color) {
    editor.value?.chain().focus().setHighlight({ color }).run()
  } else {
    editor.value?.chain().focus().unsetHighlight().run()
  }
}

/** 颜色预设 */
const textColors = ['#000000', '#3a3a3a', '#666666', '#999999', '#3d5a80', '#5a8a6e', '#b8914a', '#c44e52', '#7a6b8a', '#e67e22']
const highlightColors = ['#fff3cd', '#d4edda', '#d1ecf1', '#f8d7da', '#e2d5f1', '#fce4ec', '#fff8e1', '#e8f5e9']

/** ========== 编辑逻辑 ========== */

/** 开始编辑某节 */
function startEdit(verseNum) {
  /* 如果正在编辑其他节，先保存 */
  if (editingVerse.value >= 0 && editingVerse.value !== verseNum) {
    saveEdit()
  }

  editingVerse.value = verseNum
  const entry = currentChapterEntries.value[verseNum]

  /* 加载内容到编辑器：优先加载当前模式对应的内容 */
  let contentToLoad = ''
  if (displayMode.value === 'ai' && entry?.formattedContent) {
    contentToLoad = entry.formattedContent
  } else if (entry?.content) {
    contentToLoad = entry.content
  }

  nextTick(() => {
    if (editor.value) {
      editor.value.commands.setContent(contentToLoad || '')
      editor.value.commands.focus('end')
    }
  })
}

/** 保存编辑 */
function saveEdit() {
  if (editingVerse.value < 0 || !editor.value) return

  const verseNum = editingVerse.value
  const html = editor.value.getHTML()
  /** 检查是否有实际内容（去掉空标签） */
  const textContent = editor.value.getText().trim()
  const key = buildVerseKey(currentBookIndex.value, currentChapterIndex.value, verseNum)

  /* 查找已有条目 */
  const existingIdx = entries.value.findIndex(e => {
    const parsed = parseVerseRef(e.verse)
    return parsed && parsed.bookIndex === currentBookIndex.value && parsed.chapter === currentChapterIndex.value && parsed.verse === verseNum
  })

  if (textContent) {
    const newEntry = { verse: key, content: '', formattedContent: '' }

    if (existingIdx >= 0) {
      newEntry.content = entries.value[existingIdx].content || ''
      newEntry.formattedContent = entries.value[existingIdx].formattedContent || ''
    }

    /* 根据当前模式更新对应字段 */
    if (displayMode.value === 'ai') {
      newEntry.formattedContent = html
    } else {
      newEntry.content = html
    }

    if (existingIdx >= 0) {
      entries.value[existingIdx] = newEntry
    } else {
      /* 新条目：原版和排版内容相同 */
      newEntry.content = html
      entries.value.push(newEntry)
    }
  } else if (existingIdx >= 0) {
    /* 清空内容则删除条目 */
    entries.value.splice(existingIdx, 1)
  }

  editingVerse.value = -1
  isDirty.value = true
}

/** 取消编辑 */
function cancelEdit() {
  editingVerse.value = -1
}

/** 删除某节注释 */
function deleteComment(verseNum) {
  const idx = entries.value.findIndex(e => {
    const parsed = parseVerseRef(e.verse)
    return parsed && parsed.bookIndex === currentBookIndex.value && parsed.chapter === currentChapterIndex.value && parsed.verse === verseNum
  })
  if (idx >= 0) {
    entries.value.splice(idx, 1)
    isDirty.value = true
    ElMessage.success(t('commentary_deleted'))
  }
}

/** ========== AI 排版功能 ========== */

/**
 * AI 排版单节注释
 * 将原始文本通过 AI 整理为格式化 HTML
 */
async function aiFormatVerse(verseNum) {
  const entry = currentChapterEntries.value[verseNum]
  if (!entry || !entry.content) {
    ElMessage.warning(t('commentary_ai_format_no_content'))
    return
  }

  aiFormattingVerse.value = verseNum

  try {
    const rawContent = entry.content
    const verseRef = `${currentBookName.value} ${currentChapterIndex.value + 1}:${verseNum}`

    /* 调用 AI 排版（当前为模拟逻辑，实际应调用后端 AI API） */
    const formatted = await simulateAiFormat(rawContent, verseRef)

    /* 保存排版后内容 */
    const idx = entries.value.findIndex(e => {
      const parsed = parseVerseRef(e.verse)
      return parsed && parsed.bookIndex === currentBookIndex.value && parsed.chapter === currentChapterIndex.value && parsed.verse === verseNum
    })

    if (idx >= 0) {
      entries.value[idx].formattedContent = formatted
      isDirty.value = true
    }

    /* 自动切换到 AI 排版模式查看效果 */
    displayMode.value = 'ai'
    ElMessage.success(t('commentary_ai_format_done'))
  } catch (e) {
    ElMessage.error(t('commentary_ai_format_failed'))
  } finally {
    aiFormattingVerse.value = -1
  }
}

/**
 * AI 排版整章注释
 * 对已有注释的所有经文进行 AI 排版
 */
async function aiFormatChapter() {
  const commented = Object.keys(currentChapterEntries.value)
  if (commented.length === 0) {
    ElMessage.warning(t('commentary_ai_format_no_content'))
    return
  }

  try {
    await ElMessageBox.confirm(
      t('commentary_ai_format_chapter_confirm', {
        book: currentBookName.value,
        chapter: currentChapterIndex.value + 1,
        count: commented.length
      }),
      t('commentary_ai_format_chapter_title'),
      { confirmButtonText: t('confirm'), cancelButtonText: t('cancel'), type: 'info' }
    )
  } catch { return }

  let formatted = 0

  for (const vStr of commented) {
    const verseNum = parseInt(vStr)
    const entry = currentChapterEntries.value[verseNum]
    if (!entry?.content) continue

    /* 跳过已有排版的 */
    if (entry.formattedContent) continue

    aiFormattingVerse.value = verseNum

    try {
      const verseRef = `${currentBookName.value} ${currentChapterIndex.value + 1}:${verseNum}`
      const result = await simulateAiFormat(entry.content, verseRef)

      const idx = entries.value.findIndex(e => {
        const parsed = parseVerseRef(e.verse)
        return parsed && parsed.bookIndex === currentBookIndex.value && parsed.chapter === currentChapterIndex.value && parsed.verse === verseNum
      })

      if (idx >= 0) {
        entries.value[idx].formattedContent = result
        formatted++
      }
    } catch {
      /* 跳过失败 */
    }
  }

  aiFormattingVerse.value = -1
  isDirty.value = true
  displayMode.value = 'ai'
  ElMessage.success(t('commentary_ai_format_chapter_done', { count: formatted }))
}

/**
 * 模拟 AI 排版
 * 实际项目中应替换为后端 AI 接口调用
 * 将无格式纯文本整理为结构化 HTML
 */
async function simulateAiFormat(rawHtml, verseRef) {
  /* 模拟网络延迟 */
  await new Promise(resolve => setTimeout(resolve, 600 + Math.random() * 400))

  /* 提取纯文本内容 */
  const tempDiv = document.createElement('div')
  tempDiv.innerHTML = rawHtml
  const plainText = tempDiv.textContent || tempDiv.innerText || ''

  if (!plainText.trim()) return rawHtml

  /**
   * 模拟 AI 排版逻辑：
   * 1. 按段落分隔
   * 2. 为长段落添加段落标签
   * 3. 识别经文引用并高亮
   * 4. 识别关键词并加粗
   */
  const paragraphs = plainText.split(/\n\s*\n|\n/).filter(p => p.trim())

  let html = ''

  /* 添加经文引用标题 */
  html += `<h3>${verseRef}</h3>`

  paragraphs.forEach((para, idx) => {
    let p = para.trim()
    if (!p) return

    /* 简单模拟：识别书卷名和经文引用并加粗 */
    const bookPattern = BIBLE_BOOK_NAMES.join('|')
    const refRegex = new RegExp(`((?:${bookPattern})\\s*\\d+[：:]\\d+(?:-\\d+)?)`, 'g')
    p = p.replace(refRegex, '<strong style="color: #3d5a80;">$1</strong>')

    /* 如果第一段较短（可能是标题），用 h4 */
    if (idx === 0 && p.length < 30) {
      html += `<h4>${p}</h4>`
    } else {
      html += `<p>${p}</p>`
    }
  })

  return html
}

/** ========== 数据加载 ========== */

/** 加载资源数据 */
async function loadData() {
  loading.value = true
  try {
    const res = await getResourceDetail(resourceId)
    const detail = res.data
    resource.value = detail
    meta.value = tryParseJson(detail.metaJson) || {}

    if (detail.contentJson) {
      entries.value = JSON.parse(detail.contentJson) || []
    }

    /* 从 URL 参数设置初始书卷 */
    const bookParam = parseInt(route.query.book)
    if (!isNaN(bookParam) && bookParam >= 0 && bookParam < 66) {
      currentBookIndex.value = bookParam
    }
    const chapterParam = parseInt(route.query.chapter)
    if (!isNaN(chapterParam) && chapterParam >= 0) {
      currentChapterIndex.value = chapterParam
    }
  } catch (e) {
    console.error('加载失败:', e)
  } finally {
    loading.value = false
  }
}

/** 加载圣经译本列表 */
async function loadBibleList() {
  try {
    const res = await getResourceList('bible')
    allBibleList.value = res.data || []
    if (allBibleList.value.length > 0 && !selectedBibleId.value) {
      selectedBibleId.value = allBibleList.value[0].id
    }
  } catch (e) {
    // 静默处理
  }
}

/** 加载选中的圣经译本内容 */
async function loadBibleResource() {
  if (!selectedBibleId.value || loadedBibleId.value === selectedBibleId.value) return
  try {
    const res = await getResourceDetail(selectedBibleId.value)
    const detail = res.data
    if (detail) {
      const content = tryParseJson(detail.contentJson)
      if (content) {
        bibleBooks.value = content.books || (Array.isArray(content) ? content : [])
        loadedBibleId.value = selectedBibleId.value
      }
    }
  } catch (e) {
    console.error('加载圣经译本失败:', e)
  }
}

watch(selectedBibleId, () => { loadBibleResource() })

/** 解析 JSON */
function tryParseJson(str) {
  try { return JSON.parse(str) } catch { return null }
}

/** 保存到服务器 */
async function handleSave() {
  /* 先保存当前编辑中的内容 */
  if (editingVerse.value >= 0) {
    saveEdit()
  }

  saving.value = true
  try {
    const contentJson = JSON.stringify(entries.value)
    await updateResource(resourceId, { contentJson })
    isDirty.value = false
    ElMessage.success(t('editor_save_success'))
  } catch (e) {
    ElMessage.error(t('error'))
  } finally {
    saving.value = false
  }
}

/** 上一章 */
function prevChapter() {
  if (editingVerse.value >= 0) saveEdit()
  if (currentChapterIndex.value > 0) {
    currentChapterIndex.value--
  } else if (currentBookIndex.value > 0) {
    currentBookIndex.value--
    currentChapterIndex.value = BOOK_CHAPTER_COUNTS[currentBookIndex.value] - 1
  }
}

/** 下一章 */
function nextChapter() {
  if (editingVerse.value >= 0) saveEdit()
  if (currentChapterIndex.value < totalChapters.value - 1) {
    currentChapterIndex.value++
  } else if (currentBookIndex.value < 65) {
    currentBookIndex.value++
    currentChapterIndex.value = 0
  }
}

/** 切换书卷时重置 */
watch(currentBookIndex, () => {
  currentChapterIndex.value = 0
  editingVerse.value = -1
})

/** 切换章节时重置 */
watch(currentChapterIndex, () => {
  editingVerse.value = -1
})

/** 键盘快捷键 */
function onKeyDown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault()
    handleSave()
  }
  if (e.key === 'Escape' && editingVerse.value >= 0) {
    cancelEdit()
  }
}

onMounted(() => {
  loadData()
  loadBibleList()
  window.addEventListener('keydown', onKeyDown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
  editor.value?.destroy()
})
</script>

<template>
  <div class="commentary-read" v-loading="loading">
    <!-- 顶部控制栏 -->
    <div class="control-bar">
      <el-button size="small" @click="router.push(`/commentary/detail/${resourceId}`)">
        <el-icon><ArrowLeft /></el-icon>
        {{ t('back') }}
      </el-button>

      <!-- 书卷选择 -->
      <el-select v-model="currentBookIndex" filterable style="width: 160px;">
        <el-option-group :label="t('detail_old_testament')">
          <el-option
            v-for="idx in 39"
            :key="idx - 1"
            :label="BIBLE_BOOK_NAMES[idx - 1]"
            :value="idx - 1"
          />
        </el-option-group>
        <el-option-group :label="t('detail_new_testament')">
          <el-option
            v-for="idx in 27"
            :key="idx + 38"
            :label="BIBLE_BOOK_NAMES[idx + 38]"
            :value="idx + 38"
          />
        </el-option-group>
      </el-select>

      <!-- 章节选择 -->
      <el-select v-model="currentChapterIndex" style="width: 110px;">
        <el-option
          v-for="idx in totalChapters"
          :key="idx - 1"
          :label="t('commentary_chapter_unit', { num: idx })"
          :value="idx - 1"
        />
      </el-select>

      <!-- 上下章 -->
      <el-button size="small" @click="prevChapter" :disabled="currentBookIndex === 0 && currentChapterIndex === 0">
        {{ t('editor_prev_chapter') }}
      </el-button>
      <el-button size="small" @click="nextChapter" :disabled="currentBookIndex === 65 && currentChapterIndex === totalChapters - 1">
        {{ t('editor_next_chapter') }}
      </el-button>

      <div class="control-spacer" />

      <!-- 经文参考开关 -->
      <el-checkbox v-model="showBibleRef" :label="t('commentary_show_bible_ref')" size="small" />

      <!-- 圣经译本选择 -->
      <el-select v-if="showBibleRef" v-model="selectedBibleId" :placeholder="t('commentary_select_bible')" clearable size="small" style="width: 140px;">
        <el-option
          v-for="b in allBibleList"
          :key="b.id"
          :label="b.title"
          :value="b.id"
        />
      </el-select>

      <!-- 保存 -->
      <el-button type="primary" size="small" :loading="saving" @click="handleSave" :disabled="!isDirty">
        {{ t('save') }} <span class="save-shortcut">Ctrl+S</span>
      </el-button>
    </div>

    <!-- 模式切换 + AI 排版栏 -->
    <div class="mode-bar">
      <div class="mode-switch">
        <button
          class="mode-btn"
          :class="{ active: displayMode === 'original' }"
          @click="displayMode = 'original'"
        >
          <span class="mode-icon">📄</span>
          {{ t('commentary_mode_original') }}
        </button>
        <button
          class="mode-btn"
          :class="{ active: displayMode === 'ai' }"
          @click="displayMode = 'ai'"
        >
          <span class="mode-icon">✨</span>
          {{ t('commentary_mode_ai') }}
        </button>
      </div>

      <div class="mode-desc">
        {{ displayMode === 'original' ? t('commentary_mode_original_desc') : t('commentary_mode_ai_desc') }}
      </div>

      <div class="mode-spacer" />

      <!-- AI 整章排版 -->
      <el-button
        type="success"
        size="small"
        @click="aiFormatChapter"
        :loading="aiFormattingVerse >= 0"
      >
        <el-icon><MagicStick /></el-icon>
        {{ t('commentary_ai_format_chapter') }}
      </el-button>
    </div>

    <!-- 未保存提示 -->
    <div v-if="isDirty" class="dirty-bar">{{ t('editor_modified') }}</div>

    <!-- 章节标题 -->
    <div class="chapter-title-bar">
      <h2 class="chapter-title">{{ currentBookName }} {{ t('commentary_chapter_unit', { num: currentChapterIndex + 1 }) }}</h2>
      <span class="chapter-stats">{{ commentedVerseCount }} / {{ verseCount }} {{ t('commentary_stat_verses_commented') }}</span>
    </div>

    <!-- 逐节注释列表 -->
    <div class="verse-list">
      <div
        v-for="verse in verseList"
        :key="verse.number"
        class="verse-item"
        :class="{
          'has-comment': verse.hasComment,
          'is-editing': editingVerse === verse.number,
          'is-formatting': aiFormattingVerse === verse.number
        }"
      >
        <!-- 节号 -->
        <div class="verse-number">{{ verse.number }}</div>

        <!-- 经文内容区 -->
        <div class="verse-body">
          <!-- 圣经原文（如果开启参考） -->
          <div v-if="showBibleRef && verse.bibleText" class="verse-bible-text">
            {{ verse.bibleText }}
          </div>

          <!-- ===== 编辑模式：富文本编辑器 ===== -->
          <div v-if="editingVerse === verse.number" class="verse-edit-area">
            <!-- 富文本工具栏 -->
            <div class="rich-toolbar">
              <!-- 第一行：段落格式 + 文字样式 -->
              <div class="toolbar-row">
                <!-- 段落格式 -->
                <el-dropdown size="small" trigger="click">
                  <button class="toolbar-btn text-btn">
                    {{ isActive('heading', { level: 1 }) ? 'H1' : isActive('heading', { level: 2 }) ? 'H2' : isActive('heading', { level: 3 }) ? 'H3' : t('commentary_toolbar_paragraph') }}
                    <span class="dropdown-arrow">▾</span>
                  </button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item @click="toolbarActions.paragraph">{{ t('commentary_toolbar_paragraph') }}</el-dropdown-item>
                      <el-dropdown-item @click="toolbarActions.heading1">H1 {{ t('commentary_toolbar_heading') }}</el-dropdown-item>
                      <el-dropdown-item @click="toolbarActions.heading2">H2 {{ t('commentary_toolbar_heading') }}</el-dropdown-item>
                      <el-dropdown-item @click="toolbarActions.heading3">H3 {{ t('commentary_toolbar_heading') }}</el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>

                <div class="toolbar-divider" />

                <!-- 引用 -->
                <button class="toolbar-btn" :class="{ active: isActive('blockquote') }" @click="toolbarActions.blockquote" :title="t('commentary_toolbar_quote')">
                  <span class="tb-icon">❝</span>
                </button>

                <div class="toolbar-divider" />

                <!-- 加粗 / 下划线 / 斜体 / 删除线 -->
                <button class="toolbar-btn" :class="{ active: isActive('bold') }" @click="toolbarActions.bold" title="Bold">
                  <b>B</b>
                </button>
                <button class="toolbar-btn" :class="{ active: isActive('underline') }" @click="toolbarActions.underline" title="Underline">
                  <u>U</u>
                </button>
                <button class="toolbar-btn" :class="{ active: isActive('italic') }" @click="toolbarActions.italic" title="Italic">
                  <i>I</i>
                </button>
                <button class="toolbar-btn" :class="{ active: isActive('strike') }" @click="toolbarActions.strike" title="Strikethrough">
                  <s>S</s>
                </button>

                <div class="toolbar-divider" />

                <!-- 文字颜色 -->
                <el-dropdown size="small" trigger="click">
                  <button class="toolbar-btn" :title="t('commentary_toolbar_text_color')">
                    <span class="color-a">A</span><span class="color-bar" style="background:#c44e52;"></span>
                    <span class="dropdown-arrow">▾</span>
                  </button>
                  <template #dropdown>
                    <div class="color-palette">
                      <div
                        v-for="c in textColors"
                        :key="c"
                        class="color-swatch"
                        :style="{ background: c }"
                        @click="setTextColor(c)"
                      />
                    </div>
                  </template>
                </el-dropdown>

                <!-- 高亮颜色 -->
                <el-dropdown size="small" trigger="click">
                  <button class="toolbar-btn" :title="t('commentary_toolbar_highlight')">
                    <span class="highlight-icon">A</span>
                    <span class="dropdown-arrow">▾</span>
                  </button>
                  <template #dropdown>
                    <div class="color-palette">
                      <div
                        class="color-swatch color-swatch-clear"
                        @click="setHighlight(null)"
                      >✕</div>
                      <div
                        v-for="c in highlightColors"
                        :key="c"
                        class="color-swatch"
                        :style="{ background: c }"
                        @click="setHighlight(c)"
                      />
                    </div>
                  </template>
                </el-dropdown>
              </div>

              <!-- 第二行：列表 + 对齐 + 操作 -->
              <div class="toolbar-row">
                <!-- 无序列表 -->
                <button class="toolbar-btn" :class="{ active: isActive('bulletList') }" @click="toolbarActions.bulletList" :title="t('commentary_toolbar_bullet_list')">
                  <span class="tb-icon">☰</span>
                </button>
                <!-- 有序列表 -->
                <button class="toolbar-btn" :class="{ active: isActive('orderedList') }" @click="toolbarActions.orderedList" :title="t('commentary_toolbar_ordered_list')">
                  <span class="tb-icon">1.</span>
                </button>

                <div class="toolbar-divider" />

                <!-- 对齐 -->
                <button class="toolbar-btn" :class="{ active: isActive({ textAlign: 'left' }) }" @click="toolbarActions.alignLeft" :title="t('commentary_toolbar_align_left')">
                  <span class="tb-icon align-icon">≡←</span>
                </button>
                <button class="toolbar-btn" :class="{ active: isActive({ textAlign: 'center' }) }" @click="toolbarActions.alignCenter" :title="t('commentary_toolbar_align_center')">
                  <span class="tb-icon align-icon">≡</span>
                </button>
                <button class="toolbar-btn" :class="{ active: isActive({ textAlign: 'right' }) }" @click="toolbarActions.alignRight" :title="t('commentary_toolbar_align_right')">
                  <span class="tb-icon align-icon">→≡</span>
                </button>
                <button class="toolbar-btn" :class="{ active: isActive({ textAlign: 'justify' }) }" @click="toolbarActions.alignJustify" :title="t('commentary_toolbar_align_justify')">
                  <span class="tb-icon align-icon">⊞</span>
                </button>

                <div class="toolbar-divider" />

                <!-- 分隔线 -->
                <button class="toolbar-btn" @click="toolbarActions.horizontalRule" :title="t('commentary_toolbar_hr')">
                  <span class="tb-icon">—</span>
                </button>

                <!-- 清除格式 -->
                <button class="toolbar-btn" @click="toolbarActions.clearFormat" :title="t('commentary_toolbar_clear_format')">
                  <span class="tb-icon">⌧</span>
                </button>

                <div class="toolbar-divider" />

                <!-- 撤销 / 重做 -->
                <button class="toolbar-btn" @click="toolbarActions.undo" :title="t('commentary_toolbar_undo')">
                  <span class="tb-icon">↩</span>
                </button>
                <button class="toolbar-btn" @click="toolbarActions.redo" :title="t('commentary_toolbar_redo')">
                  <span class="tb-icon">↪</span>
                </button>
              </div>
            </div>

            <!-- Tiptap 编辑器 -->
            <EditorContent :editor="editor" class="rich-editor-wrapper" />

            <!-- 编辑操作按钮 -->
            <div class="edit-actions">
              <el-button type="primary" size="small" @click="saveEdit">
                {{ t('save') }}
              </el-button>
              <el-button size="small" @click="cancelEdit">
                {{ t('cancel') }}
              </el-button>

              <!-- AI 排版当前节 -->
              <el-button
                size="small"
                type="success"
                plain
                @click="() => { saveEdit(); aiFormatVerse(verse.number); }"
                :loading="aiFormattingVerse === verse.number"
              >
                <el-icon><MagicStick /></el-icon>
                {{ t('commentary_ai_format_btn') }}
              </el-button>

              <span class="edit-hint">Ctrl+S {{ t('commentary_save_shortcut') }}</span>
            </div>
          </div>

          <!-- ===== 显示模式：注释内容 ===== -->
          <div v-else-if="verse.hasComment" class="verse-comment" @click="startEdit(verse.number)">
            <!-- 渲染 HTML 内容 -->
            <div class="comment-text rich-display" v-html="getDisplayContent(verse)"></div>
            <!-- AI 排版标识 -->
            <div v-if="displayMode === 'ai' && verse.hasFormatted" class="ai-badge">
              ✨ {{ t('commentary_ai_formatted') }}
            </div>
            <div v-if="displayMode === 'ai' && !verse.hasFormatted && verse.hasComment" class="ai-badge ai-badge-pending">
              {{ t('commentary_ai_not_formatted') }}
            </div>
          </div>

          <!-- 空状态：点击添加 -->
          <div v-else class="verse-empty" @click="startEdit(verse.number)">
            <span class="empty-text">{{ t('commentary_click_to_add') }}</span>
          </div>

          <!-- AI 排版中动画 -->
          <div v-if="aiFormattingVerse === verse.number && editingVerse !== verse.number" class="ai-loading">
            <el-icon class="is-loading"><Loading /></el-icon>
            <span>{{ t('commentary_ai_formatting') }}</span>
          </div>
        </div>
      </div>

      <!-- 空章节 -->
      <el-empty v-if="verseCount === 0" :description="t('commentary_no_verses')" />
    </div>
  </div>
</template>

<style scoped>
.commentary-read {
  max-width: 1000px;
  margin: 0 auto;
  padding: 24px 20px;
}

/* ===== 顶部控制栏 ===== */
.control-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  background: #fff;
  border: 1px solid var(--church-border, #e0d8cf);
  border-radius: 4px;
  padding: 10px 16px;
  flex-wrap: wrap;
}

.control-spacer { flex: 1; }

.save-shortcut {
  font-size: 11px;
  opacity: 0.6;
  margin-left: 4px;
}

/* ===== 模式切换栏 ===== */
.mode-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  background: #fff;
  border: 1px solid var(--church-border, #e0d8cf);
  border-radius: 4px;
  padding: 8px 16px;
  flex-wrap: wrap;
}

.mode-switch {
  display: flex;
  border: 1px solid var(--church-border, #e0d8cf);
  border-radius: 6px;
  overflow: hidden;
}

.mode-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 16px;
  border: none;
  background: #fff;
  font-size: 13px;
  color: var(--church-charcoal, #3a3a3a);
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
}

.mode-btn:first-child { border-right: 1px solid var(--church-border, #e0d8cf); }

.mode-btn.active {
  background: var(--church-navy, #3d5a80);
  color: #fff;
}

.mode-btn:not(.active):hover {
  background: #f5f0eb;
}

.mode-icon { font-size: 14px; }

.mode-desc {
  font-size: 12px;
  color: var(--church-warm-gray, #8a8178);
}

.mode-spacer { flex: 1; }

/* ===== 提示条 ===== */
.dirty-bar {
  background: #fff7e6;
  color: #e6a23c;
  text-align: center;
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 500;
  border: 1px solid #faecd8;
  border-radius: 4px;
  margin-bottom: 12px;
}

/* ===== 章节标题 ===== */
.chapter-title-bar {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 16px;
  padding: 0 4px;
}

.chapter-title {
  font-family: var(--font-heading);
  font-size: 20px;
  font-weight: 600;
  color: var(--church-charcoal, #3a3a3a);
  letter-spacing: 2px;
  margin: 0;
}

.chapter-stats {
  font-size: 13px;
  color: var(--church-warm-gray, #8a8178);
}

/* ===== 逐节注释列表 ===== */
.verse-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.verse-item {
  display: flex;
  gap: 12px;
  padding: 16px 12px;
  background: #fff;
  border: 1px solid var(--church-border, #e0d8cf);
  border-bottom: none;
  position: relative;
  transition: background 0.2s;
}

.verse-item:first-child { border-radius: 4px 4px 0 0; }
.verse-item:last-child { border-bottom: 1px solid var(--church-border, #e0d8cf); border-radius: 0 0 4px 4px; }
.verse-item:only-child { border-radius: 4px; border-bottom: 1px solid var(--church-border, #e0d8cf); }

.verse-item:hover { background: #fafaf8; }
.verse-item.has-comment { background: #fff; }
.verse-item.has-comment:hover { background: #f8faf8; }
.verse-item.is-editing { background: #f8fbf9; border-color: #5a8a6e; z-index: 1; }
.verse-item.is-formatting { background: #f5f0ff; }

/* 节号 */
.verse-number {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  flex-shrink: 0;
  background: rgba(90,138,110,0.08);
  color: #5a8a6e;
}

.verse-item.has-comment .verse-number {
  background: #5a8a6e;
  color: #fff;
}

/* 经文内容区 */
.verse-body {
  flex: 1;
  min-width: 0;
}

.verse-bible-text {
  font-size: 13px;
  color: var(--church-warm-gray, #8a8178);
  line-height: 1.6;
  padding-bottom: 6px;
  margin-bottom: 6px;
  border-bottom: 1px dashed var(--church-border, #e0d8cf);
  font-style: italic;
}

/* 注释内容显示 */
.verse-comment {
  cursor: pointer;
  transition: background 0.2s;
  padding: 4px 8px;
  border-radius: 4px;
}

.verse-comment:hover {
  background: rgba(90,138,110,0.06);
}

/* 富文本展示样式 */
.rich-display {
  font-size: 14px;
  color: var(--church-charcoal, #3a3a3a);
  line-height: 1.8;
  word-break: break-word;
}

.rich-display :deep(h1) { font-size: 20px; font-weight: 700; margin: 12px 0 8px; color: #3d5a80; }
.rich-display :deep(h2) { font-size: 18px; font-weight: 600; margin: 10px 0 6px; color: #3d5a80; }
.rich-display :deep(h3) { font-size: 16px; font-weight: 600; margin: 8px 0 4px; color: #5a8a6e; }
.rich-display :deep(h4) { font-size: 15px; font-weight: 600; margin: 6px 0 4px; }
.rich-display :deep(p) { margin: 4px 0; }
.rich-display :deep(blockquote) {
  border-left: 3px solid #3d5a80;
  padding-left: 12px;
  margin: 8px 0;
  color: #666;
  font-style: italic;
}
.rich-display :deep(ul),
.rich-display :deep(ol) {
  padding-left: 20px;
  margin: 4px 0;
}
.rich-display :deep(hr) {
  border: none;
  border-top: 1px solid var(--church-border, #e0d8cf);
  margin: 12px 0;
}

/* AI 标识 */
.ai-badge {
  display: inline-block;
  font-size: 11px;
  color: #5a8a6e;
  margin-top: 4px;
}

.ai-badge-pending {
  color: var(--church-warm-gray, #8a8178);
}

/* 空状态 */
.verse-empty {
  cursor: pointer;
  padding: 8px;
  border: 1px dashed var(--church-border, #e0d8cf);
  border-radius: 4px;
  text-align: center;
  transition: all 0.2s;
}

.verse-empty:hover {
  border-color: #5a8a6e;
  background: rgba(90,138,110,0.04);
}

.empty-text {
  font-size: 13px;
  color: var(--church-warm-gray, #8a8178);
}

/* ===== 富文本工具栏 ===== */
.rich-toolbar {
  border: 1px solid var(--church-border, #e0d8cf);
  border-radius: 6px 6px 0 0;
  background: #fafaf8;
  padding: 4px 6px;
}

.toolbar-row {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px 0;
  flex-wrap: wrap;
}

.toolbar-row + .toolbar-row {
  border-top: 1px solid var(--church-border, #e0d8cf);
  margin-top: 2px;
  padding-top: 4px;
}

.toolbar-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 30px;
  height: 30px;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  color: var(--church-charcoal, #3a3a3a);
  transition: all 0.15s;
  padding: 0 6px;
  font-family: inherit;
}

.toolbar-btn:hover {
  background: rgba(90,138,110,0.1);
}

.toolbar-btn.active {
  background: var(--church-navy, #3d5a80);
  color: #fff;
}

.text-btn {
  font-size: 12px;
  min-width: 60px;
  gap: 4px;
}

.dropdown-arrow {
  font-size: 10px;
  opacity: 0.6;
}

.toolbar-divider {
  width: 1px;
  height: 20px;
  background: var(--church-border, #e0d8cf);
  margin: 0 4px;
}

.tb-icon {
  font-size: 14px;
  font-style: normal;
  font-weight: 400;
}

.align-icon {
  font-size: 13px;
  letter-spacing: -1px;
}

.color-a {
  font-weight: 700;
  font-size: 15px;
}

.color-bar {
  display: block;
  width: 14px;
  height: 3px;
  border-radius: 1px;
  margin-top: 1px;
}

.highlight-icon {
  font-weight: 700;
  font-size: 15px;
  background: #fff3cd;
  padding: 0 3px;
  border-radius: 2px;
}

/* 颜色面板 */
.color-palette {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 4px;
  padding: 8px;
}

.color-swatch {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  cursor: pointer;
  border: 1px solid #e0d8cf;
  transition: transform 0.15s;
}

.color-swatch:hover {
  transform: scale(1.2);
}

.color-swatch-clear {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: #999;
  background: #fff;
}

/* ===== Tiptap 编辑器主体 ===== */
.rich-editor-wrapper {
  border: 1px solid var(--church-border, #e0d8cf);
  border-top: none;
  border-radius: 0 0 6px 6px;
  min-height: 120px;
  max-height: 400px;
  overflow-y: auto;
  background: #fff;
}

.rich-editor-wrapper :deep(.rich-editor-content) {
  padding: 12px 16px;
  font-size: 14px;
  line-height: 1.8;
  color: var(--church-charcoal, #3a3a3a);
  outline: none;
  min-height: 100px;
}

.rich-editor-wrapper :deep(.rich-editor-content p) {
  margin: 4px 0;
}

.rich-editor-wrapper :deep(.rich-editor-content h1) {
  font-size: 20px;
  font-weight: 700;
  margin: 12px 0 8px;
}

.rich-editor-wrapper :deep(.rich-editor-content h2) {
  font-size: 18px;
  font-weight: 600;
  margin: 10px 0 6px;
}

.rich-editor-wrapper :deep(.rich-editor-content h3) {
  font-size: 16px;
  font-weight: 600;
  margin: 8px 0 4px;
}

.rich-editor-wrapper :deep(.rich-editor-content blockquote) {
  border-left: 3px solid #3d5a80;
  padding-left: 12px;
  margin: 8px 0;
  color: #666;
  font-style: italic;
}

.rich-editor-wrapper :deep(.rich-editor-content ul),
.rich-editor-wrapper :deep(.rich-editor-content ol) {
  padding-left: 20px;
  margin: 4px 0;
}

.rich-editor-wrapper :deep(.rich-editor-content hr) {
  border: none;
  border-top: 1px solid var(--church-border, #e0d8cf);
  margin: 12px 0;
}

.rich-editor-wrapper :deep(.rich-editor-content .is-empty::before) {
  content: attr(data-placeholder);
  color: #c0b8af;
  float: left;
  pointer-events: none;
  height: 0;
}

/* ===== 编辑操作 ===== */
.verse-edit-area {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.edit-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.edit-hint {
  font-size: 11px;
  color: var(--church-warm-gray, #8a8178);
  margin-left: auto;
}

/* AI 加载动画 */
.ai-loading {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 0;
  color: #7a6b8a;
  font-size: 13px;
}
</style>
