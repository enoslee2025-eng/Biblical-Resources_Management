<script setup>
/**
 * 圣经译本编辑器（Element Plus 桌面版）
 * 支持新建和编辑圣经译本
 * 三个 Tab：基本信息、经文内容、预览
 * 功能：批量导入、保存提醒、离开确认、自动保存、书卷进度高亮
 */
import { ref, reactive, onMounted, computed, watch, onBeforeUnmount, nextTick } from 'vue'
import { useRouter, useRoute, onBeforeRouteLeave } from 'vue-router'
import { createResource, getResourceDetail, updateResource } from '@/api/resource'
import { ElMessage, ElMessageBox, ElLoading } from 'element-plus'
import { saveLocal, updateLocal, getLocalItem, isLocalId } from '@/utils/localStore'
import { useI18n } from 'vue-i18n'
import { readFileContent, readMultipleFiles, mergeTexts, isSupportedFile, matchBookFromFileName, splitIntoChapters, detectBookFromContent, splitTextToVerses, smartSplitBookChapters, BIBLE_VERSE_COUNTS, isBibleJsonFormat, parseBibleJson } from '@/utils/fileImport'
import { formatVersesForApp } from '@/utils/bibleFormat'
import { parseBibleText, splitMergedVerses } from '@/utils/bibleVerseParser'
import { markPersonNames, clearPersonNameMarks, markPlainTextPersonNames } from '@/utils/biblePersonNames'
import { markPlaceNames, clearPlaceNameMarks, markPlainTextPlaceNames } from '@/utils/biblePlaceNames'
import VersionHistory from '@/components/VersionHistory.vue'
import RichTextEditor from '@/components/RichTextEditor.vue'

const router = useRouter()
const route = useRoute()
const { t } = useI18n()

/** 资源ID（编辑模式时有值） */
const resourceId = computed(() => route.params.id ? Number(route.params.id) : null)

/** 是否为编辑模式 */
const isEdit = computed(() => !!resourceId.value)

/** 当前激活的 Tab */
const activeTab = ref('content')

/** 是否正在保存 */
const saving = ref(false)

/** 是否有未保存的修改 */
const isDirty = ref(false)

/** 是否显示版本历史面板 */
const showVersionHistory = ref(false)

/** 是否正在编辑版本名称 */
const editingVersion = ref(false)

/** 版本名称输入框 */
const versionNameInput = ref('')

/** 行号区 DOM 引用（滚动同步用） */
const lineNumbersRef = ref(null)

/** 经文文本框引用（滚动同步用） */
const versesTextareaRef = ref(null)

/** 上次保存后的内容快照（用于脏检查） */
let savedSnapshot = ''

/** 自动保存定时器 */
let autoSaveTimer = null

/** 脏检查防抖定时器 */
let dirtyCheckTimer = null

/** 基本信息（meta） */
const meta = reactive({
  id: '',
  version: 1,
  versionName: '',
  title: '',
  abbr: '',
  iso: 'zh',
  summary: '',
  infos: 1,
  chapters: 0,
  addi: 0,
  page: 0,
  odir: 0,
  ndir: 0,
  ttf: '',
  downUrl: ''
})

/** 圣经66卷书的名称列表 */
const bibleBooks = [
  '创世记','出埃及记','利未记','民数记','申命记',
  '约书亚记','士师记','路得记','撒母耳记上','撒母耳记下',
  '列王纪上','列王纪下','历代志上','历代志下','以斯拉记',
  '尼希米记','以斯帖记','约伯记','诗篇','箴言',
  '传道书','雅歌','以赛亚书','耶利米书','耶利米哀歌',
  '以西结书','但以理书','何西阿书','约珥书','阿摩司书',
  '俄巴底亚书','约拿书','弥迦书','那鸿书','哈巴谷书',
  '西番雅书','哈该书','撒迦利亚书','玛拉基书',
  '马太福音','马可福音','路加福音','约翰福音','使徒行传',
  '罗马书','哥林多前书','哥林多后书','加拉太书','以弗所书',
  '腓立比书','歌罗西书','帖撒罗尼迦前书','帖撒罗尼迦后书',
  '提摩太前书','提摩太后书','提多书','腓利门书','希伯来书',
  '雅各书','彼得前书','彼得后书','约翰一书','约翰二书',
  '约翰三书','犹大书','启示录'
]

/** 每卷书的标准简写 */
const bibleBookAbbrs = [
  '创','出','利','民','申',
  '书','士','得','撒上','撒下',
  '王上','王下','代上','代下','拉',
  '尼','斯','伯','诗','箴',
  '传','歌','赛','耶','哀',
  '结','但','何','珥','摩',
  '俄','拿','弥','鸿','哈',
  '番','该','亚','玛',
  '太','可','路','约','徒',
  '罗','林前','林后','加','弗',
  '腓','西','帖前','帖后',
  '提前','提后','多','门','来',
  '雅','彼前','彼后','约壹','约贰',
  '约叁','犹','启'
]

/** 每卷书的标准章数 */
const bookChapterCounts = [
  50,40,27,36,34,24,21,4,31,24,22,25,29,36,10,
  13,10,42,150,31,12,8,66,52,5,48,12,14,3,9,
  1,4,7,3,3,3,2,14,4,
  28,16,24,21,28,16,16,13,6,6,4,4,5,3,6,4,3,1,13,5,5,3,5,1,1,1,22
]

/** 经文内容：books 数组 */
const books = ref([])

/** 当前选中的书卷索引 */
const currentBookIndex = ref(0)

/** 当前选中的章节索引 */
const currentChapterIndex = ref(0)

/** 当前章节的经文文本（每行一节） */
const versesText = ref('')

/** 是否显示批量导入弹窗 */
const showImportDialog = ref(false)

/** 导入文本内容 */
const importText = ref('')

/** 导入范围：chapter-当前章节, book-整卷书 */
const importScope = ref('chapter')

/** 文件上传输入框 ref */
const fileInput = ref(null)

/** 文件夹上传输入框 ref */
const folderInput = ref(null)

/** 是否正在读取导入文件 */
const importLoading = ref(false)

/** 导入进度 (0-100) */
const importProgress = ref(0)

/** 导入预览数据 */
const importPreviewData = ref(null)

/** 是否显示导入预览 */
const showImportPreview = ref(false)

/** 整卷导入起始章节（从0开始的索引） */
const importStartChapter = ref(0)

/** 当前正在读取的文件名（进度显示） */
const importFileName = ref('')

/** 是否处于拖拽状态 */
const isDragOver = ref(false)

/** 整本圣经导入匹配数据 */
const fullBibleImportData = ref(null)

/** 智能识别到的书卷（{ bookIndex, bookName } 或 null） */
const detectedBook = ref(null)

/** 用户是否选择忽略智能识别结果 */
const ignoreDetection = ref(false)

/** 是否显示智能格式化预览 */
const showSmartFormatPreview = ref(false)

/** 智能格式化后的预览数据 */
const smartFormatResult = ref(null)

/** 智能排版范围：chapter 本章 / book 本卷书 */
const smartFormatScope = ref('chapter')

/** 图片上传输入框 ref */
const imageInput = ref(null)

/** OCR 识别进度 (0-100) */
const ocrProgress = ref(0)

/** 是否正在进行 OCR 识别 */
const ocrLoading = ref(false)

/** OCR 状态文字 */
const ocrStatusText = ref('')

/** 编辑视图模式：inline（逐节编辑）/ raw（文本编辑） */
const editorViewMode = ref('raw')

/** 富文本编辑器内容（HTML 字符串） */
const richTextContent = ref('')

/** 富文本同步标记（防止循环更新） */
let syncingRichText = false

/** 当前正在编辑的经文索引（-1 = 无） */
const editingVerseIndex = ref(-1)

/** 逐节编辑模式：当前编辑中的经文富文本内容 */
const inlineRichContent = ref('')

/** 逐节编辑模式：同步标记 */
let syncingInlineRich = false

/** 文本编辑模式：富文本内容 */
const rawRichContent = ref('')

/** 文本编辑模式：同步标记 */
let syncingRawRich = false

/** 人名标注是否开启 */
const personNameMarkEnabled = ref(false)

/** 地名标注是否开启 */
const placeNameMarkEnabled = ref(false)

/** 注释弹窗状态 */
const annotationDialog = reactive({
  visible: false,
  verseIndex: -1,
  content: ''
})

/** 字体显示设置 */
const fontSettings = reactive({
  fontSize: 16,
  fontFamily: '',
  lineHeight: 2.0
})

/** 内联编辑同步标记（防止循环更新） */
let syncingFromInline = false

/** 文件上传输入框 ref（整本圣经用） */
const fullBibleFileInput = ref(null)
/** 文件夹上传输入框 ref（整本圣经用） */
const fullBibleFolderInput = ref(null)

/** 经文行数统计（非空行） */
const verseLineCount = computed(() => {
  if (!versesText.value.trim()) return 0
  return versesText.value.split('\n').filter(l => l.trim()).length
})

/** 文本框实际行数（含空行，行号用） */
const rawLineCount = computed(() => {
  if (!versesText.value) return 5
  return Math.max(versesText.value.split('\n').length, 5)
})

/** 已编辑的书卷数量 */
const filledBooksCount = computed(() => {
  return books.value.filter((_, idx) => bookHasContent(idx)).length
})

/** 已填写的章节数量（有经文的章） */
const filledChaptersCount = computed(() => {
  let count = 0
  books.value.forEach(book => {
    if (!book.chapters) return
    book.chapters.forEach(ch => {
      if (ch.verses && ch.verses.length > 0) count++
    })
  })
  return count
})

/** 标准总章节数 (1189) */
const totalStandardChapters = computed(() => bookChapterCounts.reduce((a, b) => a + b, 0))

/** 获取某卷书已填写的章数 */
function getBookFilledChapters(bookIdx) {
  const book = books.value[bookIdx]
  if (!book || !book.chapters) return 0
  return book.chapters.filter(ch => ch.verses && ch.verses.length > 0).length
}

/** 下一个空书卷的索引（-1 表示全部已填） */
const nextEmptyBookIndex = computed(() => {
  for (let i = 0; i < books.value.length; i++) {
    if (!bookHasContent(i)) return i
  }
  return -1
})

/**
 * 判断某卷书是否有内容
 */
function bookHasContent(bookIndex) {
  const book = books.value[bookIndex]
  if (!book || !book.chapters) return false
  return book.chapters.some(ch => ch.verses && ch.verses.length > 0)
}

/**
 * 判断某章是否有内容
 */
function chapterHasContent(chapterIndex) {
  const book = books.value[currentBookIndex.value]
  if (!book || !book.chapters) return false
  const chapter = book.chapters[chapterIndex]
  return chapter && chapter.verses && chapter.verses.length > 0
}

/**
 * 获取预览数据：当前书卷的所有章节经文
 */
const previewChapters = computed(() => {
  const book = books.value[currentBookIndex.value]
  if (!book || !book.chapters) return []
  return book.chapters
    .map((ch, idx) => ({
      chapter: idx + 1,
      verses: ch.verses || []
    }))
    .filter(ch => ch.verses.length > 0)
})

/**
 * 当前章节的经文数组（内联编辑用）
 */
const currentVerses = computed(() => {
  const book = books.value[currentBookIndex.value]
  if (!book) return []
  const chapter = book.chapters?.[currentChapterIndex.value]
  if (!chapter || !chapter.verses) return []
  return chapter.verses
})

/** 当前章节的段落标题 */
const currentChapterHeadings = computed(() => {
  const book = books.value[currentBookIndex.value]
  if (!book) return {}
  const chapter = book.chapters?.[currentChapterIndex.value]
  return chapter?.sectionHeadings || {}
})

/**
 * 可视编辑区域的样式（字体设置）
 */
const verseAreaStyle = computed(() => ({
  fontSize: fontSettings.fontSize + 'px',
  fontFamily: fontSettings.fontFamily || 'inherit',
  lineHeight: fontSettings.lineHeight
}))

/**
 * 生成当前内容快照（用于脏检查）
 */
function getContentSnapshot() {
  return JSON.stringify({ meta: { ...meta }, books: books.value })
}

/**
 * 标记内容已保存
 */
function markSaved() {
  savedSnapshot = getContentSnapshot()
  isDirty.value = false
}

/**
 * 检查内容是否有变化（防抖版本）
 */
function checkDirty() {
  if (dirtyCheckTimer) clearTimeout(dirtyCheckTimer)
  dirtyCheckTimer = setTimeout(() => {
    isDirty.value = getContentSnapshot() !== savedSnapshot
  }, 500)
}

/**
 * 立即检查脏状态
 */
function checkDirtyNow() {
  if (dirtyCheckTimer) clearTimeout(dirtyCheckTimer)
  isDirty.value = getContentSnapshot() !== savedSnapshot
}

/** 监听经文文本变化，标记脏数据 */
watch(versesText, () => {
  checkDirty()
})

/** 监听 meta 变化，标记为脏 */
watch(meta, () => {
  checkDirty()
}, { deep: true })

/** 路由离开前确认 */
onBeforeRouteLeave((to, from, next) => {
  if (isDirty.value) {
    ElMessageBox.confirm(t('be_unsaved_leave_msg'), t('be_hint'), {
      confirmButtonText: t('be_confirm_leave'),
      cancelButtonText: t('be_continue_edit'),
      type: 'warning'
    }).then(() => next()).catch(() => next(false))
  } else {
    next()
  }
})

/** 浏览器关闭/刷新前提醒 */
function onBeforeUnloadHandler(e) {
  if (isDirty.value) {
    e.preventDefault()
    e.returnValue = ''
  }
}

/** 启动自动保存定时器（每30秒） */
function startAutoSave() {
  stopAutoSave()
  autoSaveTimer = setInterval(() => {
    if (isDirty.value && isEdit.value && !saving.value) {
      handleAutoSave()
    }
  }, 30000)
}

/** 停止自动保存定时器 */
function stopAutoSave() {
  if (autoSaveTimer) {
    clearInterval(autoSaveTimer)
    autoSaveTimer = null
  }
}

/** 执行自动保存 */
async function handleAutoSave() {
  /* 各编辑模式同步数据 */
  if (editorViewMode.value === 'raw') saveRawRichToChapter()
  if (editorViewMode.value === 'rich') saveRichTextToChapter()
  if (editorViewMode.value === 'inline') saveInlineRichToVerse()
  saving.value = true
  try {
    const metaJson = JSON.stringify(buildMetaJson())
    const contentJson = JSON.stringify(books.value)
    await updateResource(resourceId.value, {
      title: meta.title,
      metaJson,
      contentJson
    })
    markSaved()
    ElMessage({ message: t('be_auto_save_success'), type: 'success', duration: 1500 })
  } catch (e) {
    // 自动保存失败不弹错误
  } finally {
    saving.value = false
  }
}

/** 构建 metaJson 对象 */
function buildMetaJson() {
  return {
    id: meta.id || meta.abbr?.toLowerCase() || 'custom',
    version: meta.version,
    versionName: meta.versionName,
    title: meta.title,
    abbr: meta.abbr,
    iso: meta.iso,
    summary: meta.summary,
    infos: meta.infos,
    chapters: books.value.reduce((sum, b) => sum + b.chapters.length, 0),
    addi: meta.addi,
    page: meta.page,
    odir: meta.odir,
    ndir: meta.ndir,
    ttf: meta.ttf,
    downUrl: meta.downUrl
  }
}

/** 键盘快捷键：Ctrl+S / Cmd+S 保存 */
function onKeyDown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault()
    handleSave()
  }
}

onMounted(async () => {
  window.addEventListener('beforeunload', onBeforeUnloadHandler)
  window.addEventListener('keydown', onKeyDown)
  await loadResource()
  /* 从 URL query 参数恢复书卷和章节位置（如从阅览页跳转） */
  const qBook = Number(route.query.book)
  const qChapter = Number(route.query.chapter)
  if (!isNaN(qBook) && qBook >= 0 && qBook < 66) {
    currentBookIndex.value = qBook
  }
  if (!isNaN(qChapter) && qChapter >= 0) {
    currentChapterIndex.value = qChapter
  }
  loadCurrentVerses()
  /* 恢复人名标注状态 */
  restorePersonNameMark()
  /* 默认进入时加载对应模式的内容 */
  if (editorViewMode.value === 'rich') {
    loadRichTextFromChapter()
  } else if (editorViewMode.value === 'raw') {
    loadRawRichFromChapter()
  }
  startAutoSave()
  /* 行号与文本框滚动同步 */
  nextTick(() => {
    setupScrollSync()
  })
})

/** 设置行号和文本框的滚动同步 */
function setupScrollSync() {
  const textareaEl = versesTextareaRef.value?.$el?.querySelector('textarea')
  if (textareaEl && lineNumbersRef.value) {
    textareaEl.addEventListener('scroll', () => {
      lineNumbersRef.value.scrollTop = textareaEl.scrollTop
    })
  }
}

/** 切换 Tab 后重新建立滚动同步 */
watch(activeTab, (val) => {
  if (val === 'content' && editorViewMode.value === 'raw') {
    nextTick(() => setupScrollSync())
  }
})

/** 切换编辑模式时的数据同步 */
watch(editorViewMode, (val, oldVal) => {
  editingVerseIndex.value = -1

  /* 离开 inline 模式时保存正在编辑的经文 */
  if (oldVal === 'inline') {
    saveInlineRichToVerse()
  }
  /* 离开 raw 模式时保存 */
  if (oldVal === 'raw') {
    saveRawRichToChapter()
  }
  /* 离开 rich 模式时保存富文本到 chapter.richText */
  if (oldVal === 'rich') {
    saveRichTextToChapter()
  }

  /* 进入 raw 模式：加载经文到富文本编辑器 */
  if (val === 'raw') {
    loadRawRichFromChapter()
  }
  /* 进入 rich 模式 */
  if (val === 'rich') {
    loadRichTextFromChapter()
  }
  /* 进入 inline 模式：加载经文并自动选中第一节 */
  if (val === 'inline') {
    loadCurrentVerses()
    nextTick(() => {
      if (currentVerses.value.length > 0) {
        startEditVerse(0)
      }
    })
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', onBeforeUnloadHandler)
  window.removeEventListener('keydown', onKeyDown)
  stopAutoSave()
  if (dirtyCheckTimer) clearTimeout(dirtyCheckTimer)
})

/** 初始化空的 books 数据结构 */
function initEmptyBooks() {
  books.value = bibleBooks.map((name, index) => ({
    name,
    abbr: bibleBookAbbrs[index] || '',
    chapters: Array.from({ length: bookChapterCounts[index] }, (_, i) => ({
      chapter: i + 1,
      verses: []
    }))
  }))
}

/**
 * 为已加载的 books 数据补充缺失的简写
 */
function fillMissingAbbrs() {
  books.value.forEach((book, idx) => {
    if (!book.abbr && bibleBookAbbrs[idx]) {
      book.abbr = bibleBookAbbrs[idx]
    }
  })
}

/** 加载已有资源数据 */
async function loadResource() {
  if (!resourceId.value) {
    initEmptyBooks()
    markSaved()
    return
  }

  // 本地 ID：直接从 localStorage 加载
  if (isLocalId(resourceId.value)) {
    const data = getLocalItem('bible', resourceId.value)
    if (data) {
      if (data.metaJson) Object.assign(meta, JSON.parse(data.metaJson))
      meta.title = data.title || meta.title
      books.value = data.contentJson ? JSON.parse(data.contentJson) : []
      if (!books.value.length) initEmptyBooks()
      fillMissingAbbrs()
      loadCurrentVerses()
      markSaved()
    } else {
      ElMessage.error(t('be_local_data_not_found'))
    }
    return
  }

  const loadingInstance = ElLoading.service({ text: t('loading') })
  try {
    const res = await getResourceDetail(resourceId.value)
    const data = res.data

    if (data.metaJson) {
      const parsed = JSON.parse(data.metaJson)
      Object.assign(meta, parsed)
    }
    meta.title = data.title || meta.title

    if (data.contentJson) {
      books.value = JSON.parse(data.contentJson)
    } else {
      initEmptyBooks()
    }

    fillMissingAbbrs()
    loadCurrentVerses()
    markSaved()
  } catch (e) {
    // 后端失败时尝试从本地加载
    const localData = getLocalItem('bible', String(resourceId.value))
    if (localData) {
      if (localData.metaJson) Object.assign(meta, JSON.parse(localData.metaJson))
      meta.title = localData.title || meta.title
      books.value = localData.contentJson ? JSON.parse(localData.contentJson) : []
      if (!books.value.length) initEmptyBooks()
      fillMissingAbbrs()
      loadCurrentVerses()
      markSaved()
      ElMessage.warning(t('be_backend_unavailable_local'))
    } else {
      ElMessage.error(t('be_load_failed'))
    }
  } finally {
    loadingInstance.close()
  }
}

/** 加载当前选中章节的经文到文本框 */
function loadCurrentVerses() {
  const book = books.value[currentBookIndex.value]
  if (!book) return
  const chapter = book.chapters[currentChapterIndex.value]
  if (!chapter) return

  if (chapter.verses && chapter.verses.length > 0) {
    versesText.value = chapter.verses.map(v => v.text || '').join('\n')
  } else {
    versesText.value = ''
  }
}

/** 保存当前章节的经文到 books 数据 */
function saveCurrentVerses() {
  const book = books.value[currentBookIndex.value]
  if (!book) return
  const chapter = book.chapters[currentChapterIndex.value]
  if (!chapter) return

  const lines = versesText.value.split('\n')
  chapter.verses = lines
    .map(text => text.trim())
    .filter(t => t)
    .map((text, index) => ({ verse: index + 1, text }))
}

/* stripVerseNum 已删除 — 新架构中 text 字段不包含节号 */

/**
 * 内联编辑：开始编辑某节经文
 */
function startEditVerse(index) {
  /* 先保存上一节的内容 */
  if (editingVerseIndex.value >= 0) {
    saveInlineRichToVerse()
  }
  editingVerseIndex.value = index
  /* 加载当前节的内容到富文本编辑器 */
  syncingInlineRich = true
  const verse = currentVerses.value[index]
  inlineRichContent.value = verse ? (verse.text || '') : ''
  nextTick(() => { syncingInlineRich = false })
}

/**
 * 内联编辑：结束编辑
 */
function finishEditVerse() {
  saveInlineRichToVerse()
  editingVerseIndex.value = -1
  syncVersesTextFromChapter()
}

/**
 * 将逐节编辑器的富文本内容保存到经文数据
 */
function saveInlineRichToVerse() {
  const idx = editingVerseIndex.value
  if (idx < 0) return
  const book = books.value[currentBookIndex.value]
  const chapter = book?.chapters?.[currentChapterIndex.value]
  if (!chapter?.verses?.[idx]) return
  /* 提取纯文本（去掉 HTML 标签） */
  const tmp = document.createElement('div')
  tmp.innerHTML = inlineRichContent.value
  chapter.verses[idx].text = tmp.textContent || ''
  checkDirty()
}

/**
 * 内联编辑：输入经文文本
 */
function onVerseInput(index, event) {
  const book = books.value[currentBookIndex.value]
  const chapter = book?.chapters?.[currentChapterIndex.value]
  if (!chapter?.verses?.[index]) return
  chapter.verses[index].text = event.target.value
  /* 自动调整高度 */
  event.target.style.height = 'auto'
  event.target.style.height = event.target.scrollHeight + 'px'
  checkDirty()
}

/**
 * 内联编辑：回车结束当前行并编辑下一行
 */
function finishAndNext(index) {
  const book = books.value[currentBookIndex.value]
  const chapter = book?.chapters?.[currentChapterIndex.value]
  if (!chapter) return
  saveInlineRichToVerse()
  syncVersesTextFromChapter()
  if (index < chapter.verses.length - 1) {
    startEditVerse(index + 1)
  } else {
    editingVerseIndex.value = -1
  }
}

/**
 * 内联编辑：在指定位置后插入新经文
 */
function addVerseAfter(index) {
  const book = books.value[currentBookIndex.value]
  const chapter = book?.chapters?.[currentChapterIndex.value]
  if (!chapter) return
  const newVerse = { verse: index + 2, text: '' }
  chapter.verses.splice(index + 1, 0, newVerse)
  /* 重新编号 */
  chapter.verses.forEach((v, i) => { v.verse = i + 1 })
  syncVersesTextFromChapter()
  checkDirty()
  startEditVerse(index + 1)
}

/**
 * 内联编辑：添加第一节经文（空章节用）
 */
function addFirstVerse() {
  const book = books.value[currentBookIndex.value]
  const chapter = book?.chapters?.[currentChapterIndex.value]
  if (!chapter) return
  chapter.verses = [{ verse: 1, text: '' }]
  syncVersesTextFromChapter()
  checkDirty()
  startEditVerse(0)
}

/**
 * 内联编辑：删除经文
 */
function deleteVerse(index) {
  const book = books.value[currentBookIndex.value]
  const chapter = book?.chapters?.[currentChapterIndex.value]
  if (!chapter?.verses?.length) return
  chapter.verses.splice(index, 1)
  /* 重新编号 */
  chapter.verses.forEach((v, i) => { v.verse = i + 1 })
  if (editingVerseIndex.value === index) editingVerseIndex.value = -1
  syncVersesTextFromChapter()
  checkDirty()
}

/**
 * 从章节数据同步到 versesText（不触发 saveCurrentVerses）
 */
function syncVersesTextFromChapter() {
  const book = books.value[currentBookIndex.value]
  const chapter = book?.chapters?.[currentChapterIndex.value]
  if (!chapter) return
  syncingFromInline = true
  versesText.value = (chapter.verses || []).map(v => v.text || '').join('\n')
  nextTick(() => { syncingFromInline = false })
}

/**
 * 从章节数据加载富文本内容
 * 优先读取 chapter.richText，若无则从 verses 生成 HTML
 */
function loadRichTextFromChapter() {
  const book = books.value[currentBookIndex.value]
  const chapter = book?.chapters?.[currentChapterIndex.value]
  if (!chapter) { richTextContent.value = ''; return }

  syncingRichText = true
  if (chapter.richText) {
    /* 已有富文本内容，直接使用 */
    richTextContent.value = chapter.richText
  } else if (chapter.verses && chapter.verses.length > 0) {
    /* 从经文数据生成初始 HTML（每节一段，节号加粗） */
    const html = chapter.verses.map(v => {
      return `<p><strong>${v.verse}</strong>\u3000${v.text || ''}</p>`
    }).join('\n')
    richTextContent.value = html
  } else {
    richTextContent.value = ''
  }
  nextTick(() => { syncingRichText = false })
}

/**
 * 将富文本内容保存到章节数据
 */
function saveRichTextToChapter() {
  const book = books.value[currentBookIndex.value]
  const chapter = book?.chapters?.[currentChapterIndex.value]
  if (!chapter) return
  chapter.richText = richTextContent.value
}

/** 富文本内容变化时标记脏数据 */
watch(richTextContent, () => {
  if (!syncingRichText) {
    saveRichTextToChapter()
    checkDirty()
  }
})

/**
 * 从章节经文数据加载到文本编辑器的富文本内容
 * 每节经文显示为一行（带节号上标）
 */
function loadRawRichFromChapter() {
  const book = books.value[currentBookIndex.value]
  const chapter = book?.chapters?.[currentChapterIndex.value]
  syncingRawRich = true
  if (chapter?.verses?.length > 0) {
    const headings = chapter.sectionHeadings || {}
    let html = chapter.verses.map(v => {
      let prefix = ''
      /* 如果该节前有段落标题，插入加粗标题行 */
      if (headings[v.verse]) {
        prefix = `<p><strong>${headings[v.verse]}</strong></p>\n`
      }
      /* 如果标注已开启且有 markedText，使用 markedText */
      const content = (anyMarkEnabled.value && v.markedText) ? v.markedText : (v.text || '')
      return `${prefix}<p><strong>${v.verse}</strong>\u3000${content}</p>`
    }).join('\n')
    /* 如果标注已开启但没有 markedText，自动标注并保存 */
    if (anyMarkEnabled.value && !chapter.verses.some(v => v.markedText)) {
      html = applyAllMarksToHtml(html)
      for (const v of chapter.verses) {
        if (v.text) {
          const marked = applyAllMarks(v.text)
          if (marked !== v.text) v.markedText = marked
        }
      }
    }
    rawRichContent.value = html
  } else {
    rawRichContent.value = ''
  }
  nextTick(() => { syncingRawRich = false })
}

/**
 * 将文本编辑器的富文本内容保存回经文数据
 * 每个 <p> 标签解析为一节经文
 */
function saveRawRichToChapter() {
  const book = books.value[currentBookIndex.value]
  const chapter = book?.chapters?.[currentChapterIndex.value]
  if (!chapter) return
  const tmp = document.createElement('div')
  tmp.innerHTML = rawRichContent.value
  /* 每个段落 = 一节经文或段落标题 */
  const paragraphs = tmp.querySelectorAll('p')
  const verses = []
  const sectionHeadings = {}
  /** 暂存段落标题，等下一节经文确定位置 */
  let pendingHeading = ''

  paragraphs.forEach((p, i) => {
    /**
     * 判断是否为段落标题：
     * 段落标题的特征：整个 <p> 内只有一个 <strong> 子元素，
     * 且没有全角空格分隔符（与经文行 "<strong>节号</strong>\u3000文本" 区分）
     */
    const fullText = p.textContent?.trim() || ''
    const strongEls = p.querySelectorAll('strong')
    const isHeading = strongEls.length === 1
      && !fullText.includes('\u3000')
      && !/^\d{1,3}$/.test(strongEls[0].textContent?.trim())
      && strongEls[0].textContent?.trim() === fullText
      && fullText.length <= 30
      && !/[，。；：？！]/.test(fullText)

    if (isHeading) {
      /* 段落标题：暂存，等下一节经文确定位置 */
      pendingHeading = pendingHeading ? (pendingHeading + '\n' + fullText) : fullText
      return
    }

    /* 移除节号标签（sup 或 strong），提取纯文本 */
    const sups = p.querySelectorAll('sup')
    sups.forEach(s => s.remove())
    const strongs = p.querySelectorAll('strong')
    strongs.forEach(s => s.remove())
    /* 去掉开头的全角空格（节号与正文之间的分隔符） */
    const clone = p.cloneNode(true)
    /* 移除 clone 中的节号标签 */
    clone.querySelectorAll('sup').forEach(s => s.remove())
    clone.querySelectorAll('strong').forEach(s => s.remove())
    /* 提取纯文本用于 text 字段 */
    let text = p.textContent?.trim()
    if (text) text = text.replace(/^\u3000+/, '')
    /* 提取带人名标注的 HTML 用于 markedText 字段 */
    let innerHtml = clone.innerHTML?.trim()
    if (innerHtml) innerHtml = innerHtml.replace(/^\u3000+/, '')
    if (text) {
      const verseNum = verses.length + 1
      const obj = { verse: verseNum, text }
      /* 保留原有注释 */
      const existing = chapter.verses?.[verses.length]
      if (existing?.note) obj.note = existing.note
      /* 如果 HTML 中包含标注 span，保存 markedText */
      if (innerHtml && (innerHtml.includes('person-name') || innerHtml.includes('place-name'))) {
        obj.markedText = innerHtml
      }
      /* 绑定暂存的段落标题到该节 */
      if (pendingHeading) {
        sectionHeadings[verseNum] = pendingHeading
        pendingHeading = ''
      }
      verses.push(obj)
    }
  })
  if (verses.length > 0) {
    chapter.verses = verses
    /* 保存段落标题 */
    if (Object.keys(sectionHeadings).length > 0) {
      chapter.sectionHeadings = sectionHeadings
    } else {
      delete chapter.sectionHeadings
    }
  }
}

/** 文本编辑器内容变化时标记脏数据 */
watch(rawRichContent, () => {
  if (!syncingRawRich) {
    saveRawRichToChapter()
    checkDirty()
  }
})

/** 逐节编辑器内容变化时标记脏数据 */
watch(inlineRichContent, () => {
  if (!syncingInlineRich) {
    saveInlineRichToVerse()
    checkDirty()
  }
})

/** 选择书卷 */
function onSelectBook(index) {
  saveInlineRichToVerse()
  editingVerseIndex.value = -1
  if (editorViewMode.value === 'raw') saveRawRichToChapter()
  if (editorViewMode.value === 'rich') saveRichTextToChapter()
  currentBookIndex.value = index
  currentChapterIndex.value = 0
  loadCurrentVerses()
  if (editorViewMode.value === 'rich') loadRichTextFromChapter()
  if (editorViewMode.value === 'raw') loadRawRichFromChapter()
  if (editorViewMode.value === 'inline') {
    nextTick(() => {
      if (currentVerses.value.length > 0) startEditVerse(0)
    })
  }
  scrollEditorToTop()
}

/** 选择章节 */
function onSelectChapter(index) {
  saveInlineRichToVerse()
  editingVerseIndex.value = -1
  if (editorViewMode.value === 'raw') saveRawRichToChapter()
  if (editorViewMode.value === 'rich') saveRichTextToChapter()
  currentChapterIndex.value = index
  loadCurrentVerses()
  if (editorViewMode.value === 'rich') loadRichTextFromChapter()
  if (editorViewMode.value === 'raw') loadRawRichFromChapter()
  if (editorViewMode.value === 'inline') {
    nextTick(() => {
      if (currentVerses.value.length > 0) startEditVerse(0)
    })
  }
  scrollEditorToTop()
}

/** 编辑区滚动到顶部 */
function scrollEditorToTop() {
  nextTick(() => {
    const wrapper = document.querySelector('.verses-editor-wrapper')
    if (wrapper) wrapper.scrollTop = 0
    const inlineEditor = document.querySelector('.inline-editor')
    if (inlineEditor) inlineEditor.scrollTop = 0
    const richEditor = document.querySelector('.rich-editor-section')
    if (richEditor) richEditor.scrollTop = 0
  })
}

/** 上一章 */
function goToPrevChapter() {
  editingVerseIndex.value = -1
  if (editorViewMode.value === 'raw') saveRawRichToChapter()
  if (editorViewMode.value === 'rich') saveRichTextToChapter()
  if (editorViewMode.value === 'inline') saveInlineRichToVerse()
  if (currentChapterIndex.value > 0) {
    currentChapterIndex.value--
  } else if (currentBookIndex.value > 0) {
    currentBookIndex.value--
    currentChapterIndex.value = books.value[currentBookIndex.value].chapters.length - 1
  }
  loadCurrentVerses()
  if (editorViewMode.value === 'rich') loadRichTextFromChapter()
  if (editorViewMode.value === 'raw') loadRawRichFromChapter()
  if (editorViewMode.value === 'inline') {
    nextTick(() => {
      if (currentVerses.value.length > 0) startEditVerse(0)
    })
  }
  scrollEditorToTop()
}

/** 下一章 */
function goToNextChapter() {
  editingVerseIndex.value = -1
  if (editorViewMode.value === 'raw') saveRawRichToChapter()
  if (editorViewMode.value === 'rich') saveRichTextToChapter()
  if (editorViewMode.value === 'inline') saveInlineRichToVerse()
  const maxCh = currentChapterCount.value - 1
  if (currentChapterIndex.value < maxCh) {
    currentChapterIndex.value++
  } else if (currentBookIndex.value < 65) {
    currentBookIndex.value++
    currentChapterIndex.value = 0
  }
  loadCurrentVerses()
  if (editorViewMode.value === 'rich') loadRichTextFromChapter()
  if (editorViewMode.value === 'raw') loadRawRichFromChapter()
  if (editorViewMode.value === 'inline') {
    nextTick(() => {
      if (currentVerses.value.length > 0) startEditVerse(0)
    })
  }
  scrollEditorToTop()
}

/** 跳转到下一个空书卷 */
function goToNextEmptyBook() {
  if (nextEmptyBookIndex.value >= 0) {
    onSelectBook(nextEmptyBookIndex.value)
  }
}

/**
 * 修复当前书卷的章节分配
 * 收集所有章节中的经文，按圣经标准结构重新分配到各章
 */
async function repairBookChapters() {
  const bookIdx = currentBookIndex.value
  const book = books.value[bookIdx]
  if (!book) return

  const verseCounts = BIBLE_VERSE_COUNTS[bookIdx]
  if (!verseCounts) return

  /* 收集当前书卷所有章节中的经文文本 */
  const allTexts = []
  book.chapters.forEach(ch => {
    if (ch.verses && ch.verses.length > 0) {
      ch.verses.forEach(v => {
        if (v.text && v.text.trim()) {
          allTexts.push(v.text.trim())
        }
      })
    }
  })

  if (allTexts.length === 0) {
    ElMessage.warning(t('be_no_verses_to_repair'))
    return
  }

  const totalExpected = verseCounts.reduce((a, b) => a + b, 0)

  /* 将所有文本按句子拆分（处理合并经文） */
  const rawSentences = []
  for (const text of allTexts) {
    const parts = text.match(/[^。！？]+[。！？]+["\u201d\u300d\u300f）》]*/g)
    const remainder = parts ? text.slice(parts.join('').length).trim() : null
    if (parts && parts.length > 1) {
      for (const p of parts) {
        const s = p.trim()
        if (s) rawSentences.push(s)
      }
      if (remainder) rawSentences.push(remainder)
    } else {
      rawSentences.push(text)
    }
  }
  /* 合并纯标点片段到相邻句子 */
  const allSentences = []
  for (const s of rawSentences) {
    if (/^[\s""''「」『』（）《》…—]+$/.test(s) && allSentences.length > 0) {
      allSentences[allSentences.length - 1] += s
    } else {
      allSentences.push(s)
    }
  }

  try {
    await ElMessageBox.confirm(
      t('be_repair_confirm_msg', { book: book.name, verses: allSentences.length, expected: totalExpected, chapters: verseCounts.length }),
      t('be_repair_chapter_title'),
      { type: 'warning', confirmButtonText: t('be_confirm_repair'), cancelButtonText: t('cancel') }
    )
  } catch {
    return
  }

  /* 如果书卷章节数不足，补充缺失的章节 */
  while (book.chapters.length < verseCounts.length) {
    book.chapters.push({ chapter: book.chapters.length + 1, verses: [] })
  }

  /* 按标准每章节数重新分配句子 */
  let offset = 0
  for (let ch = 0; ch < verseCounts.length; ch++) {
    const expectedCount = verseCounts[ch]
    const chapterVerses = []
    /* 计算该章应分配多少句子 */
    const sentencesForChapter = Math.round(expectedCount / totalExpected * allSentences.length)
    const actualCount = Math.min(sentencesForChapter || expectedCount, allSentences.length - offset)

    if (actualCount <= expectedCount) {
      /* 句子数 <= 预期节数：每句一节 */
      for (let v = 0; v < actualCount && offset < allSentences.length; v++) {
        chapterVerses.push({ verse: v + 1, text: allSentences[offset] })
        offset++
      }
    } else {
      /* 句子数 > 预期节数：均匀合并句子到各节 */
      const sentencesPerVerse = actualCount / expectedCount
      for (let v = 0; v < expectedCount; v++) {
        const startIdx = offset + Math.round(v * sentencesPerVerse)
        const endIdx = offset + Math.round((v + 1) * sentencesPerVerse)
        const text = allSentences.slice(startIdx, endIdx).join('')
        chapterVerses.push({ verse: v + 1, text })
      }
      offset += actualCount
    }
    book.chapters[ch].verses = chapterVerses
  }

  /* 剩余句子追加到最后一章 */
  if (offset < allSentences.length) {
    const lastCh = book.chapters[book.chapters.length - 1]
    while (offset < allSentences.length) {
      lastCh.verses.push({ verse: lastCh.verses.length + 1, text: allSentences[offset] })
      offset++
    }
  }

  loadCurrentVerses()
  await nextTick()
  if (editorViewMode.value === 'raw') loadRawRichFromChapter()
  if (editorViewMode.value === 'rich') loadRichTextFromChapter()
  checkDirtyNow()

  /* 自动保存修复结果到存储 */
  await handleSave()
  ElMessage.success(t('be_repair_done', { verses: allSentences.length, chapters: verseCounts.length }))
}

/**
 * 一键修复所有书卷的章节分配
 */
async function repairAllBooks() {
  try {
    await ElMessageBox.confirm(
      t('be_repair_all_confirm_msg'),
      t('be_repair_all_title'),
      { type: 'warning', confirmButtonText: t('be_confirm_repair_all'), cancelButtonText: t('cancel') }
    )
  } catch {
    return
  }

  let repairedCount = 0
  let totalVersesFixed = 0

  for (let bookIdx = 0; bookIdx < 66 && bookIdx < books.value.length; bookIdx++) {
    const book = books.value[bookIdx]
    const verseCounts = BIBLE_VERSE_COUNTS[bookIdx]
    if (!book || !verseCounts) continue

    /* 收集所有经文文本 */
    const allTexts = []
    book.chapters.forEach(ch => {
      if (ch.verses) {
        ch.verses.forEach(v => {
          if (v.text && v.text.trim()) allTexts.push(v.text.trim())
        })
      }
    })
    if (allTexts.length === 0) continue

    /* 检查是否需要修复：如果章节分布已正确则跳过 */
    const filledChapters = book.chapters.filter(ch => ch.verses && ch.verses.length > 0).length
    if (filledChapters >= verseCounts.length * 0.8) continue

    /* 将所有文本按句子拆分（处理合并经文） */
    const totalExpected = verseCounts.reduce((a, b) => a + b, 0)
    const rawSentences = []
    for (const text of allTexts) {
      const parts = text.match(/[^。！？]+[。！？]+["\u201d\u300d\u300f）》]*/g)
      const remainder = parts ? text.slice(parts.join('').length).trim() : null
      if (parts && parts.length > 1) {
        for (const p of parts) {
          const s = p.trim()
          if (s) rawSentences.push(s)
        }
        if (remainder) rawSentences.push(remainder)
      } else {
        rawSentences.push(text)
      }
    }
    /* 合并纯标点片段到相邻句子 */
    const allSentences = []
    for (const s of rawSentences) {
      if (/^[\s""''「」『』（）《》…—]+$/.test(s) && allSentences.length > 0) {
        allSentences[allSentences.length - 1] += s
      } else {
        allSentences.push(s)
      }
    }

    /* 如果章节数不足，补充缺失的章节 */
    while (book.chapters.length < verseCounts.length) {
      book.chapters.push({ chapter: book.chapters.length + 1, verses: [] })
    }

    /* 按标准每章节数重新分配句子 */
    let offset = 0
    for (let ch = 0; ch < verseCounts.length; ch++) {
      const expectedCount = verseCounts[ch]
      const chapterVerses = []
      const sentencesForChapter = Math.round(expectedCount / totalExpected * allSentences.length)
      const actualCount = Math.min(sentencesForChapter || expectedCount, allSentences.length - offset)

      if (actualCount <= expectedCount) {
        for (let v = 0; v < actualCount && offset < allSentences.length; v++) {
          chapterVerses.push({ verse: v + 1, text: allSentences[offset] })
          offset++
        }
      } else {
        const sentencesPerVerse = actualCount / expectedCount
        for (let v = 0; v < expectedCount; v++) {
          const startIdx = offset + Math.round(v * sentencesPerVerse)
          const endIdx = offset + Math.round((v + 1) * sentencesPerVerse)
          const text = allSentences.slice(startIdx, endIdx).join('')
          chapterVerses.push({ verse: v + 1, text })
        }
        offset += actualCount
      }
      book.chapters[ch].verses = chapterVerses
    }
    if (offset < allSentences.length) {
      const lastCh = book.chapters[book.chapters.length - 1]
      while (offset < allSentences.length) {
        lastCh.verses.push({ verse: lastCh.verses.length + 1, text: allSentences[offset] })
        offset++
      }
    }
    repairedCount++
    totalVersesFixed += allSentences.length
  }

  loadCurrentVerses()
  await nextTick()
  if (editorViewMode.value === 'raw') loadRawRichFromChapter()
  if (editorViewMode.value === 'rich') loadRichTextFromChapter()
  checkDirtyNow()

  /* 自动保存修复结果到存储 */
  if (repairedCount > 0) {
    await handleSave()
  }

  if (repairedCount > 0) {
    ElMessage.success(t('be_repair_all_done', { books: repairedCount, verses: totalVersesFixed }))
  } else {
    ElMessage.info(t('be_repair_all_ok'))
  }
}

/**
 * 自动编辑排版：使用 BibleVerseParser 重新解析当前章节经文
 * - 智能识别节号、拆分经文
 * - 修复标点符号（全角半角混用、多余空格）
 * - 删除非经文内容（乱码、页码、注释标记等）
 * - 保留全角空格（"　神"尊称格式）
 *
 * 新架构流程（10 步）：
 *   Step 1: Source Text Acquisition
 *   Step 2: Text Normalization
 *   Step 3: Verse Candidate Detection
 *   Step 4: Inline Verse Segmentation
 *   Step 5: Continuation Line Assignment
 *   Step 6: Non-Scripture Filtering
 *   Step 7: Punctuation Restoration
 *   Step 8: Speech Pattern Detection
 *   Step 9: Structural Validation
 *   Step 10: Save Canonical Verse Structure
 *
 * 核心原则：
 *   - text 字段永远不存储节号
 *   - verse number 只存在 verse 结构字段
 *   - 不修改原始导入文本
 */
async function autoFormatChapter() {
  const book = books.value[currentBookIndex.value]
  const chapter = book?.chapters?.[currentChapterIndex.value]
  if (!chapter?.verses?.length) {
    ElMessage.warning(t('be_no_chapter_data'))
    return
  }

  try {
    await ElMessageBox.confirm(
      t('be_auto_format_confirm_msg', { book: book.name, chapter: currentChapterIndex.value + 1, verses: chapter.verses.length }),
      t('be_auto_format_title'),
      { type: 'info', confirmButtonText: t('be_start_format'), cancelButtonText: t('cancel') }
    )
  } catch {
    return
  }

  const beforeCount = chapter.verses.length

  /* ======= Step 1: Source Text Acquisition =======
   * 优先使用 sourceImportText（原始导入文本）
   * 如果不存在，从 verse 列表重建：prepend verse number 供 parser 识别
   * （verse number 仅用于临时重建，不存入 text 字段） */
  const rawText = chapter.sourceImportText || chapter.verses.map(v => {
    const text = (v.text || '').trim()
    const num = v.verse || ''
    /* 如果 text 已经以该节号开头（旧数据格式），不重复添加 */
    if (text && /^\d{1,3}/.test(text) && text.startsWith(String(num))) {
      return text
    }
    return num + text
  }).filter(t => t).join('\n')

  /* ======= Steps 2-9: 由 parseBibleText 统一执行 =======
   * 包含：Text Normalization, Verse Candidate Detection,
   * Inline Verse Segmentation, Continuation Line Assignment,
   * Non-Scripture Filtering, Punctuation Restoration,
   * Speech Pattern Detection, Structural Validation */
  const parsed = parseBibleText(rawText)

  /* 取第一章的解析结果（单章排版） */
  const parsedChapter = parsed.chapters[0]
  if (!parsedChapter || parsedChapter.verses.length === 0) {
    ElMessage.warning(t('be_format_no_result'))
    return
  }

  /* ======= 检测是否需要书卷级修复 =======
   * 如果当前章节的经文数量远超预期（包含了多章内容），
   * 提示用户使用「修复章节」功能 */
  const bookIdx = currentBookIndex.value
  const expectedVerseCounts = BIBLE_VERSE_COUNTS[bookIdx]
  const chapterIdx = currentChapterIndex.value

  if (expectedVerseCounts && chapterIdx < expectedVerseCounts.length) {
    const expectedCount = expectedVerseCounts[chapterIdx]
    if (parsedChapter.verses.length > expectedCount * 2) {
      /* 经文数量是预期的 2 倍以上 → 可能包含多章内容，自动触发书卷级修复 */
      ElMessage.info('检测到章节包含多章内容，正在执行书卷级修复...')
      await repairBookChapters()
      return
    }
  }

  /* ======= 合并经文拆分 =======
   * 如果解析结果的节数远少于预期（一个 verse 条目包含了多节经文），
   * 按句子边界拆分以匹配标准经文结构 */
  let finalVerses = parsedChapter.verses
  if (expectedVerseCounts && chapterIdx < expectedVerseCounts.length) {
    const expectedCount = expectedVerseCounts[chapterIdx]
    finalVerses = splitMergedVerses(parsedChapter.verses, expectedCount)
  }

  /* ======= Step 10: Save Canonical Verse Structure =======
   * Canonical Data: { verse: number, text: string }
   * 禁止: text 包含节号 */
  const formatted = finalVerses.map(v => ({
    verse: v.verse,
    text: v.text
  }))

  /* 应用结果 */
  chapter.verses = formatted

  /* 如果有 needsManualReview 标记，提示用户 */
  if (parsed.needsManualReview) {
    ElMessage.warning(t('be_format_needs_review') || '排版完成，部分内容可能需要手动检查')
  }

  loadCurrentVerses()
  await nextTick()
  if (editorViewMode.value === 'raw') loadRawRichFromChapter()
  if (editorViewMode.value === 'rich') loadRichTextFromChapter()
  checkDirtyNow()
  await handleSave()

  ElMessage.success(t('be_format_done', { before: beforeCount, after: formatted.length }))
}

/** 智能工具下拉菜单命令 */
function handleRepairCommand(command) {
  if (command === 'current') repairBookChapters()
  else if (command === 'all') repairAllBooks()
  else if (command === 'format') autoFormatChapter()
}

/**
 * 清除当前章节的所有经文内容
 */
async function clearCurrentChapter() {
  const book = books.value[currentBookIndex.value]
  const chapter = book?.chapters?.[currentChapterIndex.value]
  if (!chapter) return

  try {
    await ElMessageBox.confirm(
      t('be_clear_chapter_confirm', { book: book.name, chapter: currentChapterIndex.value + 1 }),
      t('be_clear_chapter_title'),
      { type: 'warning', confirmButtonText: t('confirm'), cancelButtonText: t('cancel') }
    )
  } catch {
    return
  }

  chapter.verses = []
  delete chapter.sourceImportText
  loadCurrentVerses()
  await nextTick()
  if (editorViewMode.value === 'raw') loadRawRichFromChapter()
  if (editorViewMode.value === 'rich') loadRichTextFromChapter()
  checkDirtyNow()
  ElMessage.success(t('be_clear_chapter_done', { chapter: currentChapterIndex.value + 1 }))
}

/** 当前书卷名称 */
const currentBookName = computed(() => {
  return books.value[currentBookIndex.value]?.name || ''
})

/** 当前书卷的章数 */
const currentChapterCount = computed(() => {
  return books.value[currentBookIndex.value]?.chapters?.length || 0
})

/** 上一章提示文本 */
const prevChapterHint = computed(() => {
  if (currentChapterIndex.value > 0) {
    return t('be_chapter_nav_label', { book: currentBookName.value, chapter: currentChapterIndex.value })
  } else if (currentBookIndex.value > 0) {
    const prevBook = books.value[currentBookIndex.value - 1]
    const prevCh = prevBook?.chapters?.length || 1
    return t('be_chapter_nav_label', { book: prevBook?.name || '', chapter: prevCh })
  }
  return ''
})

/** 下一章提示文本 */
const nextChapterHint = computed(() => {
  const maxCh = currentChapterCount.value - 1
  if (currentChapterIndex.value < maxCh) {
    return t('be_chapter_nav_label', { book: currentBookName.value, chapter: currentChapterIndex.value + 2 })
  } else if (currentBookIndex.value < 65) {
    const nextBook = books.value[currentBookIndex.value + 1]?.name || ''
    return t('be_chapter_nav_label', { book: nextBook, chapter: 1 })
  }
  return ''
})

/** 是否已到最后一章最后一卷 */
const isLastChapter = computed(() => {
  return currentBookIndex.value === 65 && currentChapterIndex.value === currentChapterCount.value - 1
})

/** 打开批量导入弹窗 */
function openImport() {
  importText.value = ''
  importScope.value = 'chapter'
  importStartChapter.value = 0
  importFileName.value = ''
  fullBibleImportData.value = null
  detectedBook.value = null
  ignoreDetection.value = false
  showImportDialog.value = true
}

/** 处理文件选择 */
async function onFileSelected(event) {
  const file = event.target.files[0]
  if (!file) return
  event.target.value = ''

  if (!isSupportedFile(file)) {
    ElMessage.warning(t('be_unsupported_format'))
    return
  }

  importLoading.value = true
  try {
    const { text } = await readFileContent(file)

    /* 检测是否为圣经 APP JSON 格式 */
    if (file.name.toLowerCase().endsWith('.json') && isBibleJsonFormat(text)) {
      const result = parseBibleJson(text)
      if (result) {
        /* 直接导入所有书卷数据 */
        books.value = result.books

        /* 更新元数据（仅新建时或字段为空时） */
        if (!meta.title && result.meta.title) meta.title = result.meta.title
        if (!meta.abbr && result.meta.abbr) meta.abbr = result.meta.abbr
        if (!meta.iso && result.meta.iso) meta.iso = result.meta.iso
        if (!meta.summary && result.meta.summary) meta.summary = result.meta.summary
        if (result.meta.ttf) meta.ttf = result.meta.ttf
        meta.odir = result.meta.odir
        meta.ndir = result.meta.ndir

        loadCurrentVerses()
        checkDirtyNow()
        showImportDialog.value = false
        ElMessage.success(t('be_json_import_success', { books: result.stats.importedBooks, verses: result.stats.totalVerses }))
        return
      }
    }

    importText.value = text
  } catch (e) {
    ElMessage.error(t('be_read_file_failed'))
  } finally {
    importLoading.value = false
  }
}

/** 处理文件夹选择（批量导入） */
async function onFolderSelected(event) {
  const files = Array.from(event.target.files)
  if (files.length === 0) return
  event.target.value = ''

  importScope.value = 'book'
  importLoading.value = true
  importProgress.value = 0
  importFileName.value = ''

  try {
    const { results, errors } = await readMultipleFiles(files, (current, total, fileName) => {
      importProgress.value = Math.round((current / total) * 100)
      importFileName.value = fileName
    })

    if (results.length === 0) {
      ElMessage.warning(t('be_no_supported_files'))
      return
    }

    importText.value = mergeTexts(results)

    if (errors.length > 0) {
      ElMessage.warning(t('be_read_partial', { success: results.length, fail: errors.length }))
    } else {
      ElMessage.success(t('be_read_success', { count: results.length }))
    }
  } catch (e) {
    ElMessage.error(t('be_read_failed'))
  } finally {
    importLoading.value = false
  }
}

/**
 * 处理整本圣经文件选择（多文件）
 * 复用文件夹选择的相同处理逻辑
 */
async function onFullBibleFileSelected(event) {
  return onFullBibleFolderSelected(event)
}

/**
 * 处理整本圣经文件夹选择
 */
async function onFullBibleFolderSelected(event) {
  const files = Array.from(event.target.files)
  if (files.length === 0) return
  event.target.value = ''

  importLoading.value = true
  importProgress.value = 0

  try {
    const supportedFiles = files.filter(f => isSupportedFile(f))
    const hasSubdirs = supportedFiles.some(f => {
      const parts = (f.webkitRelativePath || '').split('/')
      return parts.length >= 3
    })

    let results = []
    let errors = []

    if (hasSubdirs) {
      const groups = {}
      for (const file of supportedFiles) {
        const parts = (file.webkitRelativePath || file.name).split('/')
        const dirName = parts.length >= 3 ? parts[parts.length - 2] : '_root'
        if (!groups[dirName]) groups[dirName] = []
        groups[dirName].push(file)
      }

      const sortedDirs = Object.keys(groups).sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
      )

      const total = sortedDirs.length
      for (let i = 0; i < sortedDirs.length; i++) {
        const dirName = sortedDirs[i]
        const dirFiles = groups[dirName].sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
        )

        importProgress.value = Math.round(((i + 1) / total) * 100)
        importFileName.value = dirName

        const chapterTexts = []
        for (const file of dirFiles) {
          try {
            const { text } = await readFileContent(file)
            if (text.trim()) chapterTexts.push(text.trim())
          } catch (e) {
            errors.push({ fileName: file.name, error: e.message })
          }
        }

        if (chapterTexts.length > 0) {
          results.push({
            text: chapterTexts.join('\n\n---\n\n'),
            fileName: dirName
          })
        }
      }
    } else {
      const readResult = await readMultipleFiles(supportedFiles, (current, total, fileName) => {
        importProgress.value = Math.round((current / total) * 100)
        importFileName.value = fileName
      })
      results = readResult.results
      errors = readResult.errors
    }

    if (results.length === 0) {
      ElMessage.warning(t('be_no_supported_files'))
      return
    }

    const matched = []
    const unmatched = []
    for (const result of results) {
      const bookIdx = matchBookFromFileName(result.fileName)
      if (bookIdx >= 0) {
        matched.push({ bookIndex: bookIdx, bookName: bibleBooks[bookIdx], fileName: result.fileName, text: result.text })
      } else {
        unmatched.push(result)
      }
    }

    if (matched.length >= results.length * 0.5) {
      const usedIndices = new Set(matched.map(m => m.bookIndex))
      let unmatchedIdx = 0
      const allMatched = [...matched]
      for (const um of unmatched) {
        while (unmatchedIdx < 66 && usedIndices.has(unmatchedIdx)) unmatchedIdx++
        if (unmatchedIdx < 66) {
          allMatched.push({ bookIndex: unmatchedIdx, bookName: bibleBooks[unmatchedIdx], fileName: um.fileName, text: um.text })
          usedIndices.add(unmatchedIdx)
        }
      }
      fullBibleImportData.value = allMatched.sort((a, b) => a.bookIndex - b.bookIndex)
      ElMessage.success(t('be_smart_match_success', { count: matched.length }))
    } else {
      fullBibleImportData.value = results.map((r, i) => ({
        bookIndex: i,
        bookName: i < 66 ? bibleBooks[i] : '',
        fileName: r.fileName,
        text: r.text
      })).filter(d => d.bookIndex < 66)
      ElMessage.info(t('be_sequential_map', { count: fullBibleImportData.value.length }))
    }

    generateFullBiblePreview()
  } catch (e) {
    ElMessage.error(t('be_read_failed'))
  } finally {
    importLoading.value = false
  }
}

/** 生成整本圣经导入预览 */
function generateFullBiblePreview() {
  if (!fullBibleImportData.value || fullBibleImportData.value.length === 0) return

  const data = fullBibleImportData.value
  let totalVerses = 0
  const preview = data.slice(0, 10).map(d => {
    const chapterTexts = splitIntoChapters(d.text)
    const verseCount = chapterTexts.reduce((sum, ch) => sum + ch.split('\n').filter(l => l.trim()).length, 0)
    totalVerses += verseCount
    return { bookIndex: d.bookIndex, bookName: d.bookName, fileName: d.fileName, chapters: chapterTexts.length, verses: verseCount }
  })

  for (let i = 10; i < data.length; i++) {
    const chapterTexts = splitIntoChapters(data[i].text)
    totalVerses += chapterTexts.reduce((sum, ch) => sum + ch.split('\n').filter(l => l.trim()).length, 0)
  }

  importPreviewData.value = {
    scope: 'fullBible',
    totalBooks: data.length,
    totalCount: totalVerses,
    preview,
    hasMore: data.length > 10
  }
  showImportPreview.value = true
}

/** 确认整本圣经导入 */
function confirmFullBibleImport() {
  if (!fullBibleImportData.value) return

  let totalVerses = 0
  let importedBooks = 0

  for (const item of fullBibleImportData.value) {
    const book = books.value[item.bookIndex]
    if (!book) continue

    /* 使用智能分章：根据圣经标准结构精准分配章节经文 */
    const smartResult = smartSplitBookChapters(item.text, item.bookIndex)

    if (smartResult) {
      smartResult.forEach((verses, idx) => {
        if (idx >= book.chapters.length) return
        book.chapters[idx].verses = verses
        totalVerses += verses.length
      })
    } else {
      /* 降级：常规分章 */
      const chapters = splitIntoChapters(item.text)
      chapters.forEach((chapterText, idx) => {
        if (idx >= book.chapters.length) return
        const verses = splitTextToVerses(chapterText)
        book.chapters[idx].verses = verses
        totalVerses += verses.length
      })
    }
    importedBooks++
  }

  ElMessage.success(t('be_full_import_success', { books: importedBooks, verses: totalVerses }))
  showImportPreview.value = false
  showImportDialog.value = false
  fullBibleImportData.value = null
  importPreviewData.value = null
  loadCurrentVerses()
  checkDirtyNow()
}

/** 拖拽事件 */
function onDragOver(e) {
  e.preventDefault()
  isDragOver.value = true
}

function onDragLeave() {
  isDragOver.value = false
}

async function onDrop(e) {
  e.preventDefault()
  isDragOver.value = false

  const files = Array.from(e.dataTransfer.files)
  if (files.length === 0) return

  openImport()
  if (files.length > 1) {
    importScope.value = 'book'
  }

  importLoading.value = true
  importProgress.value = 0
  try {
    const { results, errors } = await readMultipleFiles(files, (current, total, fileName) => {
      importProgress.value = Math.round((current / total) * 100)
      importFileName.value = fileName
    })

    if (results.length === 0) {
      ElMessage.warning(t('be_no_supported_files'))
      return
    }

    importText.value = results.length === 1 ? results[0].text : mergeTexts(results)
  } catch (err) {
    ElMessage.error(t('be_read_failed'))
  } finally {
    importLoading.value = false
  }
}

/** 智能去除行首序号前缀 */
function stripLineNumbers(lines) {
  const pattern = /^\s*[\(（【]?\d{1,4}[\)）】]?\s*[\.。、:：\-\s]\s*/
  const matchCount = lines.filter(l => pattern.test(l)).length
  if (matchCount > lines.length / 2) {
    return lines.map(l => l.replace(pattern, '').trim())
  }
  return lines.map(l => l.trim())
}

/** 生成导入预览数据 */
function generateImportPreview() {
  if (importScope.value === 'fullBible') {
    generateFullBiblePreview()
    return
  }

  const text = importText.value.trim()
  if (!text) {
    ElMessage.warning(t('be_input_content_first'))
    return
  }

  /* 智能识别内容属于哪卷书 */
  detectedBook.value = null
  ignoreDetection.value = false
  const detected = detectBookFromContent(text)
  if (detected && detected.bookIndex !== currentBookIndex.value) {
    detectedBook.value = detected
  }

  if (importScope.value === 'chapter') {
    const rawLines = text.split('\n').filter(line => line.trim())
    if (rawLines.length === 0) {
      ElMessage.warning(t('be_content_empty'))
      return
    }
    const lines = stripLineNumbers(rawLines)
    importPreviewData.value = {
      scope: 'chapter',
      totalCount: lines.length,
      preview: lines.slice(0, 10).map((l, i) => ({ verse: i + 1, text: l })),
      hasMore: lines.length > 10
    }
  } else {
    const rawParts = text.split(/\n\s*---\s*\n/).filter(c => c.trim())
    const chapters = rawParts.length > 1 ? rawParts : splitIntoChapters(text)
    if (chapters.length === 0) {
      ElMessage.warning(t('be_content_empty'))
      return
    }
    const startIdx = importStartChapter.value
    const book = books.value[currentBookIndex.value]
    const maxChapters = book ? book.chapters.length : 999
    const overflowCount = Math.max(0, (startIdx + chapters.length) - maxChapters)
    let totalVerses = 0
    const preview = []
    chapters.forEach((chapterText, chapterIdx) => {
      const rawLines = chapterText.split('\n').filter(line => line.trim())
      const lines = stripLineNumbers(rawLines)
      totalVerses += lines.length
      if (chapterIdx < 3) {
        preview.push({ chapter: startIdx + chapterIdx + 1, verses: lines.slice(0, 3), total: lines.length })
      }
    })
    importPreviewData.value = {
      scope: 'book',
      totalChapters: chapters.length,
      totalCount: totalVerses,
      overflowCount,
      preview,
      hasMore: chapters.length > 3
    }
  }

  showImportPreview.value = true
}

/** 确认导入经文 */
async function confirmImport() {
  if (importScope.value === 'fullBible') {
    confirmFullBibleImport()
    return
  }

  const text = importText.value.trim()
  if (!text) return

  /* 如果智能识别到了不同的书卷且用户未忽略，先切换到目标书卷 */
  let switchedBook = false
  if (detectedBook.value && !ignoreDetection.value && detectedBook.value.bookIndex !== currentBookIndex.value) {
    if (editorViewMode.value === 'raw') saveRawRichToChapter()
    if (editorViewMode.value === 'rich') saveRichTextToChapter()
    currentBookIndex.value = detectedBook.value.bookIndex
    currentChapterIndex.value = 0
    switchedBook = true
  }

  if (importScope.value === 'chapter') {
    /* 使用 splitTextToVerses 智能解析经文（支持多种格式） */
    const verses = splitTextToVerses(text)
    const book = books.value[currentBookIndex.value]
    const chapter = book.chapters[currentChapterIndex.value]
    chapter.verses = verses
    /* 保存原始导入文本供智能排版使用 */
    chapter.sourceImportText = text
    loadCurrentVerses()
    await nextTick()
    if (editorViewMode.value === 'raw') loadRawRichFromChapter()
    if (editorViewMode.value === 'rich') loadRichTextFromChapter()
    if (switchedBook) {
      ElMessage.success(t('import_switched_book', { book: detectedBook.value.bookName }) + ` ${verses.length}`)
    } else {
      ElMessage.success(t('be_import_verses_success', { count: verses.length }))
    }
  } else {
    const bookIdx = currentBookIndex.value
    const book = books.value[bookIdx]
    const startIdx = switchedBook ? 0 : importStartChapter.value
    let totalVerses = 0

    /* 尝试使用智能分章（基于圣经标准章节结构） */
    const smartResult = startIdx === 0 ? smartSplitBookChapters(text, bookIdx) : null

    if (smartResult) {
      /* 智能分章成功：直接写入 */
      smartResult.forEach((verses, idx) => {
        if (idx >= book.chapters.length) return
        book.chapters[idx].verses = verses
        totalVerses += verses.length
      })
    } else {
      /* 降级：常规分章 + splitTextToVerses */
      const rawParts = text.split(/\n\s*---\s*\n/).filter(c => c.trim())
      const chapters = rawParts.length > 1 ? rawParts : splitIntoChapters(text)

      chapters.forEach((chapterText, idx) => {
        const chapterIdx = startIdx + idx
        if (chapterIdx >= book.chapters.length) return
        const verses = splitTextToVerses(chapterText)
        book.chapters[chapterIdx].verses = verses
        totalVerses += verses.length
      })
    }

    currentChapterIndex.value = startIdx
    loadCurrentVerses()
    await nextTick()
    if (editorViewMode.value === 'raw') loadRawRichFromChapter()
    if (editorViewMode.value === 'rich') loadRichTextFromChapter()
    if (switchedBook) {
      ElMessage.success(t('import_switched_book', { book: detectedBook.value.bookName }) + ` ${totalVerses}`)
    } else {
      ElMessage.success(t('be_import_verses_success', { count: totalVerses }))
    }
  }

  showImportPreview.value = false
  showImportDialog.value = false
  importPreviewData.value = null
  checkDirtyNow()
}

/**
 * 智能排版：与导入使用相同的解析规则
 * 支持本章和本卷书两种范围
 */
function smartFormatText() {
  const text = importText.value.trim()
  if (!text) {
    ElMessage.warning(t('be_input_content_first'))
    return
  }

  const bookIdx = currentBookIndex.value
  const book = books.value[bookIdx]
  if (!book) return

  if (smartFormatScope.value === 'chapter') {
    /* 本章模式：使用 splitTextToVerses（与导入一致） */
    const verses = splitTextToVerses(text)
    if (verses.length === 0) {
      ElMessage.warning(t('be_no_valid_verses'))
      return
    }
    smartFormatResult.value = {
      chapters: [{ chapter: currentChapterIndex.value + 1, verses }],
      totalChapters: 1,
      totalVerses: verses.length,
      isMultiChapter: false
    }
  } else {
    /* 本卷书模式：使用与导入整卷书相同的逻辑 */
    let totalVerses = 0
    const chapters = []
    const smartResult = smartSplitBookChapters(text, bookIdx)
    if (smartResult) {
      smartResult.forEach((verses, idx) => {
        if (idx >= book.chapters.length) return
        chapters.push({ chapter: idx + 1, verses })
        totalVerses += verses.length
      })
    } else {
      /* 降级：常规分章 + splitTextToVerses */
      const rawParts = text.split(/\n\s*---\s*\n/).filter(c => c.trim())
      const chapterTexts = rawParts.length > 1 ? rawParts : splitIntoChapters(text)
      chapterTexts.forEach((chapterText, idx) => {
        if (idx >= book.chapters.length) return
        const verses = splitTextToVerses(chapterText)
        chapters.push({ chapter: idx + 1, verses })
        totalVerses += verses.length
      })
    }
    if (totalVerses === 0) {
      ElMessage.warning(t('be_no_valid_verses'))
      return
    }
    smartFormatResult.value = {
      chapters,
      totalChapters: chapters.length,
      totalVerses,
      isMultiChapter: true
    }
  }
  showSmartFormatPreview.value = true
}

/* splitTextToVerses 使用从 fileImport.js 导入的版本，支持更多格式 */

/**
 * 确认智能格式化导入
 */
async function confirmSmartFormat() {
  if (!smartFormatResult.value) return

  const { chapters, isMultiChapter } = smartFormatResult.value
  const book = books.value[currentBookIndex.value]
  if (!book) return

  /* Canonical Data Structure: text 不包含节号 */
  let totalVerses = 0

  if (isMultiChapter) {
    /** 多章模式：写入对应章节 */
    for (const ch of chapters) {
      const chIdx = ch.chapter - 1
      if (chIdx < 0 || chIdx >= book.chapters.length) continue
      book.chapters[chIdx].verses = ch.verses.map(v => ({ verse: v.verse, text: v.text }))
      /* 保存段落标题 */
      if (ch.sectionHeadings) {
        book.chapters[chIdx].sectionHeadings = ch.sectionHeadings
      }
      /* 保存原始导入文本供后续重新排版使用 */
      book.chapters[chIdx].sourceImportText = importText.value.trim()
      totalVerses += ch.verses.length
    }
    /** 切换到第一个导入的章 */
    if (chapters.length > 0) {
      currentChapterIndex.value = chapters[0].chapter - 1
    }
  } else {
    /** 单章模式：写入当前选中章节 */
    const chapter = book.chapters[currentChapterIndex.value]
    if (chapter) {
      chapter.verses = chapters[0].verses.map(v => ({ verse: v.verse, text: v.text }))
      /* 保存段落标题 */
      if (chapters[0].sectionHeadings) {
        chapter.sectionHeadings = chapters[0].sectionHeadings
      }
      /* 保存原始导入文本 */
      chapter.sourceImportText = importText.value.trim()
      totalVerses = chapters[0].verses.length
    }
  }

  loadCurrentVerses()
  await nextTick()
  if (editorViewMode.value === 'raw') loadRawRichFromChapter()
  if (editorViewMode.value === 'rich') loadRichTextFromChapter()
  ElMessage.success(t('be_smart_format_done', { count: totalVerses }))
  showSmartFormatPreview.value = false
  showImportDialog.value = false
  smartFormatResult.value = null
  checkDirtyNow()
}

/**
 * 处理图片上传并进行 OCR 识别
 * 使用 Tesseract.js 在浏览器端进行文字识别
 */
async function onImageSelected(event) {
  const files = Array.from(event.target.files)
  if (files.length === 0) return
  event.target.value = ''

  /** 验证是否为图片文件 */
  const imageFiles = files.filter(f => f.type.startsWith('image/'))
  if (imageFiles.length === 0) {
    ElMessage.warning(t('ocr_select_image'))
    return
  }

  ocrLoading.value = true
  ocrProgress.value = 0
  ocrStatusText.value = t('ocr_loading_engine')

  try {
    /** 动态导入 Tesseract.js，避免首屏加载 */
    const Tesseract = await import('tesseract.js')

    /** 识别所有图片，合并文本 */
    const allTexts = []
    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i]
      ocrStatusText.value = imageFiles.length > 1
        ? t('ocr_recognizing_multi', { current: i + 1, total: imageFiles.length })
        : t('ocr_recognizing')

      /** 创建图片 URL */
      const imageUrl = URL.createObjectURL(file)

      try {
        /** 根据文件名或内容猜测语言（默认中文+英文） */
        const lang = meta.iso === 'en' ? 'eng' : 'chi_sim+eng'

        /** 执行 OCR 识别 */
        const result = await Tesseract.recognize(imageUrl, lang, {
          logger: (m) => {
            if (m.status === 'recognizing text') {
              /** 计算总进度 */
              const fileProgress = (m.progress || 0) * 100
              const overallProgress = ((i * 100 + fileProgress) / imageFiles.length)
              ocrProgress.value = Math.round(overallProgress)
            }
          }
        })

        if (result.data.text.trim()) {
          allTexts.push(result.data.text.trim())
        }
      } finally {
        URL.revokeObjectURL(imageUrl)
      }
    }

    if (allTexts.length === 0) {
      ElMessage.warning(t('ocr_empty'))
      return
    }

    /** 合并所有识别结果 */
    const rawText = allTexts.join('\n\n')

    /** 智能修正 OCR 识别的常见错误 */
    const cleanedText = cleanOcrText(rawText)

    /** 填入导入文本框 */
    if (importText.value.trim()) {
      importText.value += '\n\n' + cleanedText
    } else {
      importText.value = cleanedText
    }

    ElMessage.success(t('ocr_success', { count: imageFiles.length }))
  } catch (e) {
    console.error('OCR 识别失败:', e)
    ElMessage.error(t('ocr_error') + ': ' + (e.message || ''))
  } finally {
    ocrLoading.value = false
    ocrProgress.value = 0
    ocrStatusText.value = ''
  }
}

/**
 * 智能修正 OCR 识别文本的常见错误
 * 包括：标点符号修正、多余空格清理、编号修正等
 */
function cleanOcrText(text) {
  let cleaned = text

  /** 1. 修正常见的标点符号识别错误 */
  /** 英文标点 → 中文标点（中文环境下） */
  if (meta.iso !== 'en') {
    cleaned = cleaned
      .replace(/,\s*(?=[^\d])/g, '，')  // 逗号（排除数字中的逗号）
      .replace(/\.\s*(?=[^\d\s])/g, '。')  // 句号（排除小数点和省略号）
      .replace(/;\s*/g, '；')
      .replace(/:\s*(?=[^\d])/g, '：')  // 冒号（排除时间格式）
      .replace(/\?\s*/g, '？')
      .replace(/!\s*/g, '！')
      .replace(/\(\s*/g, '（')
      .replace(/\)\s*/g, '）')
  }

  /** 2. 清理 OCR 常见的乱码和噪点字符 */
  cleaned = cleaned
    .replace(/[|¦l]{2,}/g, '')  // 多个竖线（常见噪点）
    .replace(/[^\S\n]+/g, ' ')  // 多个空白合并为一个空格
    .replace(/\n{3,}/g, '\n\n')  // 多个连续空行合并
    .replace(/^\s+$/gm, '')  // 清除只有空白的行

  /** 3. 修正经文编号格式 */
  /** 识别类似 "1、" "1." "1:" 等编号格式，统一为 "1 " */
  cleaned = cleaned.replace(/^(\d{1,3})\s*[、.。:：]\s*/gm, '$1 ')

  /** 4. 修正常见的字符识别错误 */
  /** "—" 有时被识别为多个 "-" */
  cleaned = cleaned.replace(/-{2,}/g, '——')

  /** "..." 修正为 "……" */
  cleaned = cleaned.replace(/\.{3,}/g, '……')
  cleaned = cleaned.replace(/。{2,}/g, '……')

  /** 5. 去除行首行尾多余空格 */
  cleaned = cleaned.split('\n').map(line => line.trim()).join('\n')

  /** 6. 去除首尾空行 */
  cleaned = cleaned.trim()

  return cleaned
}

/** 保存版本名称 */
function saveVersionName() {
  meta.versionName = versionNameInput.value.trim()
  editingVersion.value = false
  isDirty.value = true
}

/** 保存资源（手动） */
async function handleSave() {
  if (editorViewMode.value === 'raw') {
    saveRawRichToChapter()
  }
  if (editorViewMode.value === 'rich') {
    saveRichTextToChapter()
  }
  if (editorViewMode.value === 'inline') {
    saveInlineRichToVerse()
  }

  if (!meta.title) {
    ElMessage.warning(t('be_enter_title'))
    activeTab.value = 'meta'
    return
  }

  saving.value = true
  const loadingInstance = ElLoading.service({ text: t('be_saving') })

  try {
    const metaJson = JSON.stringify(buildMetaJson())
    const contentJson = JSON.stringify(books.value)

    if (isEdit.value && isLocalId(resourceId.value)) {
      // 本地 ID：直接更新 localStorage
      updateLocal('bible', resourceId.value, { title: meta.title, metaJson, contentJson })
      markSaved()
      ElMessage.success(t('be_saved_local'))
    } else if (isEdit.value) {
      await updateResource(resourceId.value, { title: meta.title, metaJson, contentJson })
      markSaved()
      ElMessage.success(t('editor_save_success'))
    } else {
      // 新建：先尝试后端，失败则存本地
      try {
        const res = await createResource({ type: 'bible', title: meta.title, metaJson })
        const newId = res.data.id
        await updateResource(newId, { contentJson })
        router.replace(`/bible/edit/${newId}`)
        markSaved()
        ElMessage.success(t('editor_save_success'))
      } catch {
        // 后端不可用，存到 localStorage
        const saved = saveLocal('bible', { title: meta.title, metaJson, contentJson })
        router.replace(`/bible/edit/${saved.id}`)
        markSaved()
        ElMessage.warning(t('be_backend_saved_local'))
      }
    }
  } catch (e) {
    console.error('保存失败:', e)
    // 最终备用：存本地
    try {
      const metaJson = JSON.stringify(buildMetaJson())
      const contentJson = JSON.stringify(books.value)
      if (isEdit.value) {
        updateLocal('bible', String(resourceId.value), { title: meta.title, metaJson, contentJson })
      } else {
        const saved = saveLocal('bible', { title: meta.title, metaJson, contentJson })
        router.replace(`/bible/edit/${saved.id}`)
      }
      markSaved()
      ElMessage.warning(t('be_backend_saved_local'))
    } catch {
      ElMessage.error(t('be_save_failed') + ': ' + (e.message || ''))
    }
  } finally {
    saving.value = false
    loadingInstance.close()
  }
}

/** 书卷选择列表数据（优先使用 books 中已修改的名称） */
const bookOptions = computed(() => {
  return bibleBooks.map((name, idx) => ({
    label: books.value[idx]?.name || name,
    value: idx,
    hasCont: bookHasContent(idx)
  }))
})

/** 重命名当前书卷 */
async function renameCurrentBook() {
  const book = books.value[currentBookIndex.value]
  if (!book) return
  try {
    const { value } = await ElMessageBox.prompt(
      t('be_rename_book_msg'),
      t('be_rename_book_title'),
      { inputValue: book.name, confirmButtonText: t('confirm'), cancelButtonText: t('cancel') }
    )
    const newName = (value || '').trim()
    if (newName && newName !== book.name) {
      book.name = newName
      checkDirtyNow()
      ElMessage.success(t('be_rename_book_done', { name: newName }))
    }
  } catch { /* 取消 */ }
}

/** 跳转到阅览页面（携带当前书卷和章节位置） */
function goToRead() {
  if (resourceId.value) {
    router.push({ path: `/bible/read/${resourceId.value}`, query: { book: currentBookIndex.value, chapter: currentChapterIndex.value } })
  } else {
    router.back()
  }
}

/** 是否有任何标注功能开启 */
const anyMarkEnabled = computed(() => personNameMarkEnabled.value || placeNameMarkEnabled.value)

/**
 * 对纯文本应用所有已开启的标注
 * @param {string} text - 纯经文文本
 * @returns {string} 带标注 span 的 HTML
 */
function applyAllMarks(text) {
  if (!text) return text
  let result = text
  if (personNameMarkEnabled.value) result = markPlainTextPersonNames(result)
  if (placeNameMarkEnabled.value) result = markPlainTextPlaceNames(result)
  return result
}

/**
 * 对 HTML 应用所有已开启的标注（用于编辑器）
 */
function applyAllMarksToHtml(html) {
  if (!html) return html
  let result = html
  if (personNameMarkEnabled.value) result = markPersonNames(result)
  if (placeNameMarkEnabled.value) result = markPlaceNames(result)
  return result
}

/**
 * 清除 HTML 中的所有标注
 */
function clearAllMarksFromHtml(html) {
  if (!html) return html
  let result = html
  result = clearPersonNameMarks(result)
  result = clearPlaceNameMarks(result)
  return result
}

/**
 * 重建整卷书的 markedText（根据当前标注开关状态）
 */
function rebuildAllMarkedText() {
  const book = books.value[currentBookIndex.value]
  if (!book?.chapters) return

  for (const chapter of book.chapters) {
    if (!chapter?.verses) continue
    for (const v of chapter.verses) {
      if (!v.text) continue
      if (anyMarkEnabled.value) {
        const marked = applyAllMarks(v.text)
        if (marked !== v.text) {
          v.markedText = marked
        } else {
          delete v.markedText
        }
      } else {
        delete v.markedText
      }
    }
  }

  /* 刷新当前章节的编辑器显示 */
  if (editorViewMode.value === 'raw') {
    syncingRawRich = true
    if (anyMarkEnabled.value) {
      rawRichContent.value = applyAllMarksToHtml(clearAllMarksFromHtml(rawRichContent.value))
    } else {
      rawRichContent.value = clearAllMarksFromHtml(rawRichContent.value)
    }
    nextTick(() => { syncingRawRich = false })
  }
}

/**
 * 切换人名标注
 */
function togglePersonNameMark() {
  personNameMarkEnabled.value = !personNameMarkEnabled.value
  const key = `personNameMark_${resourceId.value || 'new'}`
  localStorage.setItem(key, personNameMarkEnabled.value ? '1' : '0')
  rebuildAllMarkedText()
}

/**
 * 切换地名标注
 */
function togglePlaceNameMark() {
  placeNameMarkEnabled.value = !placeNameMarkEnabled.value
  const key = `placeNameMark_${resourceId.value || 'new'}`
  localStorage.setItem(key, placeNameMarkEnabled.value ? '1' : '0')
  rebuildAllMarkedText()
}

/** 恢复标注开关状态 */
function restorePersonNameMark() {
  const rid = resourceId.value || 'new'
  personNameMarkEnabled.value = localStorage.getItem(`personNameMark_${rid}`) === '1'
  placeNameMarkEnabled.value = localStorage.getItem(`placeNameMark_${rid}`) === '1'
}

/**
 * 自动标注下拉菜单命令处理
 * @param {string} command - 标注类型
 */
function handleAutoMark(command) {
  if (command === 'person') togglePersonNameMark()
  else if (command === 'place') togglePlaceNameMark()
}

/**
 * 打开注释编辑弹窗
 * @param {number} idx - 经文索引
 */
function openAnnotation(idx) {
  const verse = currentVerses.value[idx]
  if (!verse) return
  annotationDialog.verseIndex = idx
  annotationDialog.content = verse.note || ''
  annotationDialog.visible = true
}

/**
 * 保存注释到经文数据
 */
function saveAnnotation() {
  const verse = currentVerses.value[annotationDialog.verseIndex]
  if (!verse) return
  const note = annotationDialog.content.trim()
  if (note) {
    verse.note = note
  } else {
    delete verse.note
  }
  annotationDialog.visible = false
  checkDirtyNow()
  ElMessage.success(t('be_annotation_saved'))
}

/** 章节选择列表数据 */
const chapterOptions = computed(() => {
  const count = currentChapterCount.value
  return Array.from({ length: count }, (_, i) => ({
    label: t('be_chapter_n', { n: i + 1 }),
    value: i,
    hasCont: chapterHasContent(i)
  }))
})
</script>

<template>
  <div class="bible-editor">
    <!-- 编辑面板 -->
    <div class="editor-panel">
      <!-- 头部：自定义 Tab + 版本 + 操作按钮，一行搞定 -->
      <div class="panel-header">
        <div class="panel-header-left">
          <nav class="tab-nav">
            <a class="tab-link" :class="{ active: activeTab === 'content' }" @click="activeTab = 'content'">{{ t('be_tab_content') }}</a>
            <a class="tab-link" :class="{ active: activeTab === 'meta' }" @click="activeTab = 'meta'">{{ t('be_tab_meta') }}</a>
          </nav>
          <el-popover v-model:visible="editingVersion" placement="bottom" :width="220" trigger="click">
            <template #reference>
              <span v-if="isEdit" class="version-tag" @click="versionNameInput = meta.versionName || ''">
                {{ meta.versionName || ('v' + meta.version) }}
              </span>
            </template>
            <div style="display: flex; gap: 8px; align-items: center;">
              <el-input v-model="versionNameInput" size="small" :placeholder="t('be_version_name')" @keyup.enter="saveVersionName" />
              <el-button size="small" type="primary" @click="saveVersionName">{{ t('confirm') }}</el-button>
            </div>
          </el-popover>
          <span v-if="isDirty" class="dirty-dot" :title="t('be_unsaved')"></span>
        </div>
        <div class="panel-header-right">
          <a v-if="isEdit" class="header-link" @click="showVersionHistory = true">{{ t('version_history') }}</a>
          <a class="header-link" @click="goToRead">{{ t('be_browse') }}</a>
          <a class="header-link save-link" :class="{ disabled: saving }" @click="!saving && handleSave()">{{ t('save') }}</a>
        </div>
      </div>

      <!-- 内容区域（用 v-show 切换，不用 el-tabs） -->
      <div class="panel-body">
      <!-- 经文编辑 -->
      <div v-show="activeTab === 'content'">
        <div class="content-section" @dragover.prevent="onDragOver" @dragleave="onDragLeave" @drop="onDrop" :class="{ 'drag-over': isDragOver }">
          <!-- 拖拽遮罩 -->
          <div v-if="isDragOver" class="drag-overlay">
            <el-icon :size="48"><Upload /></el-icon>
            <span>{{ t('be_drop_files_here') }}</span>
          </div>

          <!-- 工具栏：书卷/章节 + 操作 + 编辑模式 -->
          <div class="toolbar">
            <div class="toolbar-left">
              <el-select :model-value="currentBookIndex" filterable size="default" style="width: 150px;" @update:model-value="onSelectBook">
                <el-option
                  v-for="opt in bookOptions"
                  :key="opt.value"
                  :label="opt.label"
                  :value="opt.value"
                >
                  <span :style="{ color: opt.hasCont ? '#67c23a' : '' }">{{ opt.label }}</span>
                  <span style="float: right; font-size: 12px; color: #999; margin-top: 2px;">{{ getBookFilledChapters(opt.value) }}/{{ bookChapterCounts[opt.value] }}</span>
                </el-option>
              </el-select>
              <el-button size="small" text @click="renameCurrentBook" :title="t('be_rename_book_title')">
                <el-icon><Edit /></el-icon>
              </el-button>
              <el-select :model-value="currentChapterIndex" size="default" style="width: 110px;" @update:model-value="onSelectChapter">
                <el-option
                  v-for="opt in chapterOptions"
                  :key="opt.value"
                  :label="opt.label"
                  :value="opt.value"
                >
                  <span :style="{ color: opt.hasCont ? '#67c23a' : '' }">{{ opt.label }}</span>
                </el-option>
              </el-select>
              <div class="toolbar-divider"></div>
              <el-button size="small" type="primary" plain @click="openImport">
                <el-icon><Upload /></el-icon>
                {{ t('be_batch_import') }}
              </el-button>
              <el-button size="small" type="warning" plain @click="autoFormatChapter">
                {{ t('be_smart_typeset') }}
              </el-button>
              <el-dropdown trigger="click" @command="handleAutoMark">
                <el-button size="small" :type="anyMarkEnabled ? 'success' : ''" plain>
                  {{ t('be_auto_mark') }}
                  <el-icon style="margin-left: 4px;"><ArrowDown /></el-icon>
                </el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="person">
                      <span :style="{ color: personNameMarkEnabled ? '#67c23a' : '' }">{{ personNameMarkEnabled ? '✓ ' : '' }}{{ t('be_mark_person') }}</span>
                    </el-dropdown-item>
                    <el-dropdown-item command="place">
                      <span :style="{ color: placeNameMarkEnabled ? '#67c23a' : '' }">{{ placeNameMarkEnabled ? '✓ ' : '' }}{{ t('be_mark_place') }}</span>
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
            <div class="toolbar-right">
              <el-button-group size="small">
                <el-button :type="editorViewMode === 'raw' ? 'primary' : ''" @click="editorViewMode = 'raw'">
                  {{ t('be_text_edit') }}
                </el-button>
                <el-button :type="editorViewMode === 'inline' ? 'primary' : ''" @click="editorViewMode = 'inline'">
                  {{ t('be_verse_edit') }}
                </el-button>
              </el-button-group>
            </div>
          </div>

          <!-- ============ 文档编辑模式（富文本） ============ -->
          <div v-if="editorViewMode === 'rich'" class="rich-editor-section">
            <RichTextEditor
              v-model="richTextContent"
              :placeholder="t('be_input_chapter_placeholder', { book: currentBookName, chapter: currentChapterIndex + 1 })"
            />
          </div>

          <!-- ============ 逐节编辑模式 ============ -->
          <div v-if="editorViewMode === 'inline'" class="inline-editor">

            <!-- 空内容提示 -->
            <div v-if="currentVerses.length === 0" class="inline-empty">
              <p>{{ t('be_no_verses') }}</p>
              <el-button type="primary" plain size="small" @click="addFirstVerse">{{ t('be_add_first_verse') }}</el-button>
            </div>

            <!-- 经文列表 -->
            <div v-else class="inline-verses-list">
              <template
                v-for="(v, idx) in currentVerses"
                :key="idx"
              >
                <!-- 段落标题 -->
                <div v-if="currentChapterHeadings[v.verse]" class="iv-section-heading">
                  {{ currentChapterHeadings[v.verse] }}
                </div>
              <div
                class="iv-row"
                :class="{ 'iv-active': editingVerseIndex === idx }"
              >
                <span class="iv-num" @click="startEditVerse(idx)">{{ v.verse }}</span>

                <!-- 编辑状态：富文本编辑器 -->
                <div v-if="editingVerseIndex === idx" class="iv-edit-wrap">
                  <RichTextEditor
                    v-model="inlineRichContent"
                    :placeholder="t('be_edit_verse_n', { n: idx + 1 })"
                  />
                </div>

                <!-- 显示状态（点击进入编辑） -->
                <div v-else class="iv-text" @click="startEditVerse(idx)">
                  {{ v.text || t('be_click_to_edit') }}
                </div>

                <!-- 注释标记（有注释时常显，无注释时悬停显示） -->
                <span
                  class="iv-btn iv-btn-note"
                  :class="{ 'has-note': v.note }"
                  @click.stop="openAnnotation(idx)"
                  :title="v.note || t('be_add_annotation')"
                >
                  <el-icon :size="14"><ChatDotRound /></el-icon>
                </span>

                <!-- 操作按钮（悬停显示） -->
                <div class="iv-actions">
                  <span class="iv-btn" @click.stop="addVerseAfter(idx)" :title="t('be_insert_verse')">+</span>
                  <span class="iv-btn iv-btn-del" @click.stop="deleteVerse(idx)" :title="t('be_delete_verse')">&times;</span>
                </div>

                <!-- 注释内容显示 -->
                <div v-if="v.note" class="iv-note-preview" @click.stop="openAnnotation(idx)">
                  <el-icon :size="12"><ChatDotRound /></el-icon>
                  <span>{{ v.note }}</span>
                </div>
              </div>
              </template>

              <!-- 底部添加按钮 -->
              <div class="iv-add-row" @click="addVerseAfter(currentVerses.length - 1)">
                + {{ t('be_add_new_verse') }}
              </div>
            </div>
          </div>

          <!-- ============ 文本编辑模式（富文本） ============ -->
          <div v-if="editorViewMode === 'raw'" class="rich-editor-section">
            <RichTextEditor
              v-model="rawRichContent"
              :placeholder="t('be_input_chapter_placeholder', { book: currentBookName, chapter: currentChapterIndex + 1 })"
            />
          </div>

          <!-- 上下章切换 -->
          <div class="chapter-nav">
            <a v-if="!(currentBookIndex === 0 && currentChapterIndex === 0)" class="chapter-nav-link" @click="goToPrevChapter">
              ← {{ prevChapterHint }}
            </a>
            <span v-else></span>
            <a v-if="!isLastChapter" class="chapter-nav-link" @click="goToNextChapter">
              {{ nextChapterHint }} →
            </a>
            <span v-else></span>
          </div>
        </div>
      </div>

      <!-- 基本信息 -->
      <div v-show="activeTab === 'meta'">
        <div class="meta-form-wrapper">
          <el-form label-width="120px" class="meta-form">
            <el-form-item :label="t('be_meta_title')" required>
              <el-input v-model="meta.title" :placeholder="t('be_meta_title_ph')" />
            </el-form-item>
            <el-form-item :label="t('be_meta_abbr')">
              <el-input v-model="meta.abbr" :placeholder="t('be_meta_abbr_ph')" />
            </el-form-item>
            <el-form-item :label="t('be_meta_language')">
              <el-input v-model="meta.iso" :placeholder="t('be_meta_language_ph')" />
            </el-form-item>
            <el-form-item :label="t('be_meta_summary')">
              <el-input v-model="meta.summary" type="textarea" :rows="3" :placeholder="t('be_meta_summary_ph')" />
            </el-form-item>
            <el-form-item :label="t('be_meta_sort')">
              <el-input-number v-model="meta.version" :min="1" />
            </el-form-item>
            <el-form-item :label="t('be_meta_has_intro')">
              <el-radio-group v-model="meta.infos">
                <el-radio :value="1">{{ t('be_yes') }}</el-radio>
                <el-radio :value="0">{{ t('be_no') }}</el-radio>
              </el-radio-group>
            </el-form-item>
            <el-form-item :label="t('be_meta_has_appendix')">
              <el-radio-group v-model="meta.addi">
                <el-radio :value="1">{{ t('be_yes') }}</el-radio>
                <el-radio :value="0">{{ t('be_no') }}</el-radio>
              </el-radio-group>
            </el-form-item>
            <el-form-item :label="t('be_meta_has_page')">
              <el-radio-group v-model="meta.page">
                <el-radio :value="1">{{ t('be_yes') }}</el-radio>
                <el-radio :value="0">{{ t('be_no') }}</el-radio>
              </el-radio-group>
            </el-form-item>
            <el-form-item :label="t('be_meta_ot_dir')">
              <el-radio-group v-model="meta.odir">
                <el-radio :value="0">{{ t('be_ltr') }}</el-radio>
                <el-radio :value="1">{{ t('be_rtl') }}</el-radio>
              </el-radio-group>
            </el-form-item>
            <el-form-item :label="t('be_meta_nt_dir')">
              <el-radio-group v-model="meta.ndir">
                <el-radio :value="0">{{ t('be_ltr') }}</el-radio>
                <el-radio :value="1">{{ t('be_rtl') }}</el-radio>
              </el-radio-group>
            </el-form-item>
            <el-form-item :label="t('be_meta_font')">
              <el-input v-model="meta.ttf" :placeholder="t('be_meta_font_ph')" />
            </el-form-item>
            <el-form-item :label="t('be_meta_download_url')">
              <el-input v-model="meta.downUrl" :placeholder="t('be_meta_download_url_ph')" />
            </el-form-item>
          </el-form>
        </div>
      </div>
      </div>
    </div>

    <!-- 批量导入对话框 -->
    <el-dialog v-model="showImportDialog" :title="t('be_batch_import')" width="680px" :close-on-click-modal="false">
      <p class="import-hint">{{ t('be_import_hint') }}</p>

      <!-- 导入范围选择 -->
      <el-form label-width="100px">
        <el-form-item :label="t('be_import_scope')">
          <el-radio-group v-model="importScope">
            <el-radio value="chapter">{{ t('be_import_current_chapter') }}</el-radio>
            <el-radio value="book">{{ t('be_import_whole_book') }}</el-radio>
            <el-radio value="fullBible">{{ t('be_import_full_bible') }}</el-radio>
          </el-radio-group>
        </el-form-item>

        <el-form-item v-if="importScope === 'book'" :label="t('be_import_start_chapter')">
          <el-input-number v-model="importStartChapter" :min="0" :max="currentChapterCount - 1" />
          <span style="margin-left: 8px; color: #999;">{{ t('be_import_start_from', { n: importStartChapter + 1 }) }}</span>
        </el-form-item>
      </el-form>

      <div v-if="importScope === 'fullBible'" class="import-full-hint">
        {{ t('be_import_full_hint') }}
      </div>

      <!-- 文件上传按钮 -->
      <div class="import-file-buttons">
        <template v-if="importScope === 'fullBible'">
          <el-button plain @click="fullBibleFileInput?.click()" :loading="importLoading">
            <el-icon><Document /></el-icon>
            {{ t('be_select_file') }}
          </el-button>
          <el-button plain @click="fullBibleFolderInput?.click()" :loading="importLoading">
            <el-icon><FolderOpened /></el-icon>
            {{ t('be_select_folder') }}
          </el-button>
          <input ref="fullBibleFileInput" type="file" accept=".txt,.pdf,.docx,.json" multiple style="display: none" @change="onFullBibleFileSelected" />
          <input ref="fullBibleFolderInput" type="file" webkitdirectory style="display: none" @change="onFullBibleFolderSelected" />
        </template>
        <template v-else>
          <el-button plain @click="fileInput?.click()" :loading="importLoading">
            <el-icon><Document /></el-icon>
            {{ t('be_select_file') }}
          </el-button>
          <el-button plain @click="folderInput?.click()" :loading="importLoading">
            <el-icon><FolderOpened /></el-icon>
            {{ t('be_select_folder') }}
          </el-button>
          <el-button plain @click="imageInput?.click()" :loading="ocrLoading">
            <el-icon><Picture /></el-icon>
            {{ t('ocr_upload_image') }}
          </el-button>
          <input ref="fileInput" type="file" accept=".txt,.pdf,.docx,.json" style="display: none" @change="onFileSelected" />
          <input ref="folderInput" type="file" webkitdirectory style="display: none" @change="onFolderSelected" />
          <input ref="imageInput" type="file" accept="image/*" multiple style="display: none" @change="onImageSelected" />
        </template>
      </div>

      <!-- 导入进度 -->
      <div v-if="importLoading && importProgress > 0" class="import-progress-area">
        <el-progress :percentage="importProgress" :stroke-width="8" />
        <p v-if="importFileName" class="import-file-name">{{ importFileName }}</p>
      </div>

      <!-- OCR 识别进度 -->
      <div v-if="ocrLoading" class="ocr-progress-area">
        <div class="ocr-status-row">
          <el-icon class="ocr-spin"><Loading /></el-icon>
          <span class="ocr-status-text">{{ ocrStatusText }}</span>
        </div>
        <el-progress v-if="ocrProgress > 0" :percentage="ocrProgress" :stroke-width="8" status="success" />
        <p class="ocr-hint">{{ t('ocr_hint') }}</p>
      </div>

      <!-- 文本输入区 -->
      <el-input
        v-if="importScope !== 'fullBible'"
        v-model="importText"
        type="textarea"
        :rows="10"
        :placeholder="t('be_paste_placeholder')"
        style="margin-top: 12px;"
      />

      <!-- 整本圣经匹配列表 -->
      <div v-if="importScope === 'fullBible' && fullBibleImportData" class="match-list">
        <div v-for="item in fullBibleImportData.slice(0, 10)" :key="item.bookIndex" class="match-item">
          <span class="match-book">{{ item.bookName }}</span>
          <span class="match-arrow">←</span>
          <span class="match-file">{{ item.fileName }}</span>
        </div>
        <p v-if="fullBibleImportData.length > 10" style="text-align: center; color: #999;">... {{ t('be_more_books', { count: fullBibleImportData.length - 10 }) }}</p>
      </div>

      <template #footer>
        <el-button @click="showImportDialog = false">{{ t('cancel') }}</el-button>
        <div v-if="importScope !== 'fullBible'" style="display: inline-flex; align-items: center; gap: 8px;">
          <el-radio-group v-model="smartFormatScope" size="small">
            <el-radio-button value="chapter">{{ t('be_smart_format_chapter') }}</el-radio-button>
            <el-radio-button value="book">{{ t('be_smart_format_book') }}</el-radio-button>
          </el-radio-group>
          <el-button @click="smartFormatText" :disabled="importLoading">
            <el-icon><MagicStick /></el-icon>
            {{ t('smart_format') }}
          </el-button>
        </div>
        <el-button type="primary" @click="generateImportPreview" :disabled="importLoading">{{ t('be_preview_import') }}</el-button>
      </template>
    </el-dialog>

    <!-- 导入预览对话框 -->
    <el-dialog v-model="showImportPreview" :title="t('import_preview')" width="600px">
      <div v-if="importPreviewData">
        <!-- 智能识别书卷提示 -->
        <el-alert
          v-if="detectedBook && !ignoreDetection && importPreviewData.scope !== 'fullBible'"
          :title="t('import_detected_book', { book: detectedBook.bookName })"
          type="info"
          show-icon
          :closable="false"
          style="margin-bottom: 12px;"
        >
          <el-button link type="primary" size="small" @click="ignoreDetection = true" style="margin-top: 4px;">
            {{ t('import_ignore_detection') }}
          </el-button>
        </el-alert>
        <div class="preview-summary-tags">
          <el-tag type="success" size="large">{{ t('be_total_n_verses', { count: importPreviewData.totalCount }) }}</el-tag>
          <el-tag v-if="importPreviewData.totalBooks" type="info" size="large" style="margin-left: 8px;">
            {{ t('be_n_books', { count: importPreviewData.totalBooks }) }}
          </el-tag>
        </div>
        <div v-if="importPreviewData.overflowCount > 0" class="preview-warning">
          <el-alert :title="t('be_overflow_warning', { count: importPreviewData.overflowCount })" type="warning" :closable="false" />
        </div>

        <div class="import-preview-content">
          <!-- 章节模式预览 -->
          <template v-if="importPreviewData.scope === 'chapter'">
            <div v-for="v in importPreviewData.preview" :key="v.verse" class="preview-line">
              <sup class="verse-num">{{ v.verse }}</sup> {{ v.text }}
            </div>
            <p v-if="importPreviewData.hasMore" class="preview-more">...</p>
          </template>
          <!-- 整卷书模式预览 -->
          <template v-else-if="importPreviewData.scope === 'book'">
            <div v-for="ch in importPreviewData.preview" :key="ch.chapter" class="preview-chapter-block">
              <strong>{{ t('be_chapter_n', { n: ch.chapter }) }} ({{ ch.total }})</strong>
              <div v-for="(v, i) in ch.verses" :key="i" class="preview-line">
                <sup class="verse-num">{{ i + 1 }}</sup> {{ v }}
              </div>
            </div>
            <p v-if="importPreviewData.hasMore" class="preview-more">...</p>
          </template>
          <!-- 整本圣经模式预览 -->
          <template v-else-if="importPreviewData.scope === 'fullBible'">
            <div v-for="item in importPreviewData.preview" :key="item.bookIndex" class="preview-book-item">
              <span class="preview-book-name">{{ item.bookName }}</span>
              <span class="preview-book-info">{{ item.chapters }} {{ t('be_chapters_unit') }}, {{ item.verses }} {{ t('be_verses_unit') }}</span>
              <span class="preview-book-file">← {{ item.fileName }}</span>
            </div>
            <p v-if="importPreviewData.hasMore" class="preview-more">... {{ t('be_more_books', { count: importPreviewData.totalBooks - 10 }) }}</p>
          </template>
        </div>
      </div>

      <template #footer>
        <el-button @click="showImportPreview = false">{{ t('cancel') }}</el-button>
        <el-button type="primary" @click="confirmImport">{{ t('be_confirm_import') }}</el-button>
      </template>
    </el-dialog>

    <!-- 智能格式化预览对话框 -->
    <el-dialog v-model="showSmartFormatPreview" :title="t('smart_format_preview')" width="650px">
      <div v-if="smartFormatResult">
        <div class="preview-summary-tags">
          <el-tag type="success" size="large">{{ t('be_total_n_verses', { count: smartFormatResult.totalVerses }) }}</el-tag>
          <el-tag v-if="smartFormatResult.isMultiChapter" type="info" size="large" style="margin-left: 8px;">
            {{ smartFormatResult.totalChapters }} {{ t('be_chapters_unit') }}
          </el-tag>
          <el-tag v-else type="info" size="large" style="margin-left: 8px;">
            {{ t('be_write_to_chapter', { n: currentChapterIndex + 1 }) }}
          </el-tag>
        </div>

        <p class="smart-format-hint">{{ t('smart_format_hint') }}</p>

        <div class="import-preview-content">
          <div v-for="ch in smartFormatResult.chapters" :key="ch.chapter" class="preview-chapter-block">
            <strong v-if="smartFormatResult.isMultiChapter">
              {{ t('be_chapter_title', { book: currentBookName, chapter: ch.chapter }) }} ({{ ch.verses.length }})
            </strong>
            <template v-for="v in ch.verses.slice(0, smartFormatResult.isMultiChapter ? 3 : 10)" :key="v.verse">
              <div v-if="ch.sectionHeadings && ch.sectionHeadings[v.verse]" class="preview-heading">{{ ch.sectionHeadings[v.verse] }}</div>
              <div class="preview-line">
                <sup class="verse-num">{{ v.verse }}</sup> {{ v.text }}
              </div>
            </template>
            <p v-if="ch.verses.length > (smartFormatResult.isMultiChapter ? 3 : 10)" class="preview-more">
              ... {{ t('be_more_verses', { count: ch.verses.length - (smartFormatResult.isMultiChapter ? 3 : 10) }) }}
            </p>
          </div>
        </div>
      </div>

      <template #footer>
        <el-button @click="showSmartFormatPreview = false">{{ t('cancel') }}</el-button>
        <el-button type="primary" @click="confirmSmartFormat">{{ t('be_confirm_import') }}</el-button>
      </template>
    </el-dialog>

    <!-- 版本历史侧边面板 -->
    <VersionHistory
      v-if="isEdit"
      v-model:show="showVersionHistory"
      :resource-id="resourceId"
      @restored="loadResource"
    />

    <!-- 注释编辑弹窗 -->
    <el-dialog
      v-model="annotationDialog.visible"
      :title="t('be_annotation_title', { verse: annotationDialog.verseIndex + 1 })"
      width="480px"
      append-to-body
    >
      <el-input
        v-model="annotationDialog.content"
        type="textarea"
        :rows="4"
        :placeholder="t('be_annotation_placeholder')"
        :aria-label="t('be_annotation_placeholder')"
      />
      <template #footer>
        <el-button @click="annotationDialog.visible = false">{{ t('cancel') }}</el-button>
        <el-button type="danger" plain @click="annotationDialog.content = ''; saveAnnotation()">{{ t('be_annotation_delete') }}</el-button>
        <el-button type="primary" @click="saveAnnotation">{{ t('confirm') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.bible-editor {
  max-width: 900px;
  margin: 0 auto;
  padding: 24px 20px;
  min-height: 500px;
}

.editor-panel {
  background: #fff;
  border-radius: 8px;
  border: 1px solid #e8e8e8;
  overflow: hidden;
}

/* 头部栏：Tab + 版本 + 操作 */
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  height: 52px;
  border-bottom: 1px solid #f0f0f0;
}

.panel-header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.panel-header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

/* 自定义 Tab 导航 */
.tab-nav {
  display: flex;
  gap: 0;
  height: 52px;
}

.tab-link {
  position: relative;
  display: flex;
  align-items: center;
  padding: 0 16px;
  font-size: 14px;
  font-weight: 500;
  color: #999;
  cursor: pointer;
  transition: color 0.2s;
  user-select: none;
}
.tab-link:hover {
  color: #333;
}
.tab-link.active {
  color: #333;
  font-weight: 600;
}
.tab-link.active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 16px;
  right: 16px;
  height: 2px;
  background: #333;
  border-radius: 1px;
}

/* 版本标签 */
.version-tag {
  font-size: 12px;
  color: #bbb;
  cursor: pointer;
  padding: 2px 8px;
  background: #f7f7f7;
  border-radius: 4px;
  transition: all 0.2s;
}
.version-tag:hover {
  color: #666;
  background: #f0f0f0;
}

/* 未保存小圆点 */
.dirty-dot {
  width: 6px;
  height: 6px;
  background: #e6a23c;
  border-radius: 50%;
  flex-shrink: 0;
}

/* 头部链接按钮 */
.header-link {
  font-size: 13px;
  color: #333;
  cursor: pointer;
  transition: color 0.2s;
  white-space: nowrap;
}
.header-link:hover {
  color: #000;
}

/* 保存链接 */
.save-link.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* 内容区域 */
.panel-body {
  padding: 0 24px 24px;
}

/* 隐藏 el-tabs（只用自定义 tab 导航） */
.editor-tabs,
.editor-tabs-hidden {
  display: none;
}

/* 工具栏 */
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 0;
  margin-bottom: 8px;
  border-bottom: 1px solid #f0f0f0;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.toolbar-right {
  flex-shrink: 0;
}

.toolbar-divider {
  width: 1px;
  height: 20px;
  background: #e0e0e0;
  margin: 0 4px;
}

.tool-active {
  color: #67c23a !important;
}

.tool-danger:hover {
  color: #f56c6c !important;
}

/* 基本信息 */
.meta-form-wrapper {
  max-width: 700px;
  padding: 20px 0;
}

/* 经文编辑 */
.content-section {
  position: relative;
  padding: 16px 0;
}

.drag-over {
  outline: 3px dashed #409eff;
  outline-offset: -3px;
  border-radius: 8px;
}

.drag-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: rgba(64, 158, 255, 0.06);
  border-radius: 8px;
  color: #409eff;
  font-size: 16px;
  font-weight: 600;
  pointer-events: none;
}

/* 精简进度条（单行） */
.pc-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.pc-label {
  font-size: 12px;
  color: #888;
  white-space: nowrap;
}

.selector-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.selector-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.selector-label {
  font-size: 14px;
  color: #666;
  white-space: nowrap;
}

/* 行号 + 编辑区 */
.verses-editor-wrapper {
  display: flex;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  max-height: 65vh;
  overflow-y: auto;
  background: linear-gradient(to right, #f5f7fa 36px, #fff 36px);
}

.line-numbers {
  display: flex;
  flex-direction: column;
  padding: 5px 0;
  min-width: 36px;
  text-align: right;
  user-select: none;
  background: transparent;
  border-right: 1px solid #dcdfe6;
  flex-shrink: 0;
}

.line-num {
  font-size: 12px;
  line-height: 23px;
  color: #999;
  padding-right: 8px;
  font-family: monospace;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-shadow: none;
  font-weight: 400;
}

.verses-textarea {
  flex: 1;
}

.verses-textarea :deep(.el-textarea) {
  box-shadow: none !important;
}

.verses-textarea :deep(.el-textarea__inner) {
  border: none;
  box-shadow: none !important;
  line-height: 23px;
  font-size: 14px;
  border-radius: 0;
  resize: none;
  white-space: nowrap;
  overflow-x: auto;
  overflow-y: hidden;
}

.verse-count-bar {
  text-align: right;
  padding: 4px 0;
  font-size: 12px;
  color: #999;
}

.chapter-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 0;
}
.chapter-nav-link {
  font-size: 13px;
  color: #999;
  cursor: pointer;
  transition: color 0.2s;
}
.chapter-nav-link:hover {
  color: #409eff;
}

.chapter-nav-current {
  font-size: 14px;
  font-weight: 600;
  color: #333;
}

/* 预览 */
.preview-section {
  padding: 16px 0;
}

.preview-selector {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  font-size: 14px;
}

.preview-content {
  background: #fff;
  border: 1px solid #e8e8e8;
  border-radius: 6px;
  padding: 24px;
  max-height: 70vh;
  overflow-y: auto;
}

.preview-chapter {
  margin-bottom: 28px;
}

.preview-chapter:last-child {
  margin-bottom: 0;
}

.preview-chapter-title {
  font-size: 18px;
  font-weight: 700;
  color: #333;
  margin-bottom: 14px;
  padding-bottom: 10px;
  border-bottom: 2px solid #e6f0ff;
}

.preview-verse {
  font-size: 15px;
  line-height: 2;
  color: #333;
  margin-bottom: 2px;
}

.verse-num {
  color: #409eff;
  font-size: 11px;
  font-weight: 700;
  margin-right: 3px;
}

/* 导入对话框 */
.import-hint {
  font-size: 13px;
  color: #999;
  margin-bottom: 12px;
}

.import-full-hint {
  font-size: 13px;
  color: #666;
  background: #f0f9eb;
  padding: 10px 12px;
  border-radius: 4px;
  line-height: 1.7;
  margin-bottom: 12px;
}

.import-file-buttons {
  display: flex;
  gap: 10px;
  margin-bottom: 12px;
}

.import-progress-area {
  margin: 8px 0;
}

.import-file-name {
  font-size: 12px;
  color: #999;
  margin-top: 4px;
}

.match-list {
  max-height: 250px;
  overflow-y: auto;
  margin-top: 12px;
  border: 1px solid #eee;
  border-radius: 4px;
  padding: 8px;
}

.match-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 0;
  font-size: 13px;
  border-bottom: 1px solid #f0f0f0;
}

.match-book {
  font-weight: 600;
  color: #409eff;
  min-width: 80px;
}

.match-arrow {
  color: #ccc;
}

.match-file {
  color: #666;
}

/* 导入预览 */
.preview-summary-tags {
  margin-bottom: 12px;
}

.import-preview-content {
  max-height: 300px;
  overflow-y: auto;
  padding: 12px;
  background: #f8f9fa;
  border-radius: 4px;
  margin-top: 12px;
}

.preview-line {
  font-size: 14px;
  line-height: 1.8;
  color: #333;
}

.preview-chapter-block {
  margin-bottom: 12px;
}

.preview-chapter-block strong {
  font-size: 13px;
  color: #409eff;
  display: block;
  margin-bottom: 4px;
}

.preview-heading {
  font-weight: 600;
  color: #555;
  font-size: 14px;
  margin: 8px 0 2px;
}

.preview-more {
  text-align: center;
  color: #999;
  font-size: 16px;
  padding: 4px 0;
}

.preview-book-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 0;
  border-bottom: 1px solid #f0f0f0;
  font-size: 13px;
}

.preview-book-name {
  font-weight: 600;
  color: #409eff;
  min-width: 80px;
}

.preview-book-info {
  color: #666;
}

.preview-book-file {
  color: #999;
  font-size: 12px;
}

.preview-warning {
  margin-bottom: 8px;
}

/* 智能格式化提示 */
.smart-format-hint {
  font-size: 13px;
  color: #999;
  margin: 8px 0 12px;
}

/* OCR 识别进度 */
.ocr-progress-area {
  margin: 12px 0;
  background: #f0f9eb;
  border-radius: 6px;
  padding: 12px 14px;
}

.ocr-status-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  color: #67c23a;
  font-size: 14px;
  font-weight: 500;
}

.ocr-spin {
  animation: ocr-spin-anim 1s linear infinite;
}

@keyframes ocr-spin-anim {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.ocr-status-text {
  color: #333;
}

.ocr-hint {
  font-size: 12px;
  color: #999;
  margin-top: 6px;
}

/* ============ 视图切换 ============ */
.view-toggle {
  margin-left: auto;
}

/* ============ 字体工具栏 ============ */
.font-toolbar {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 10px 14px;
  background: #f8f9fb;
  border: 1px solid #e8e8e8;
  border-radius: 6px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}

.ft-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ft-label {
  font-size: 13px;
  color: #888;
  white-space: nowrap;
}

.ft-val {
  font-size: 12px;
  color: #666;
  min-width: 24px;
  text-align: center;
}

.ft-count {
  margin-left: auto;
  font-size: 13px;
  color: #999;
  font-weight: 500;
}

/* ============ 可视编辑器 ============ */
.inline-editor {
  background: #fff;
  border: 1px solid #e0e3e8;
  border-radius: 8px;
  padding: 24px 28px;
  max-height: 65vh;
  overflow-y: auto;
}

.inline-chapter-title {
  font-size: 1.25em;
  font-weight: 700;
  color: #2c3e50;
  margin-bottom: 18px;
  padding-bottom: 12px;
  border-bottom: 2px solid #e6f0ff;
}

.inline-empty {
  text-align: center;
  padding: 40px 0;
  color: #bbb;
}

.inline-empty p {
  margin-bottom: 12px;
  font-size: 15px;
}

/* 经文行 */
.inline-verses-list {
  /* 外层容器 */
}

.iv-section-heading {
  font-weight: 600;
  color: #555;
  font-size: 14px;
  padding: 10px 0 4px 38px;
}

.iv-row {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 0;
  padding: 4px 6px 4px 0;
  border-radius: 4px;
  transition: background 0.15s;
  position: relative;
}

.iv-row:hover {
  background: #f5f8ff;
}

.iv-row:hover .iv-actions {
  opacity: 1;
}

.iv-row.iv-active {
  background: #eef4ff;
}

/* 节号 */
.iv-num {
  flex-shrink: 0;
  min-width: 36px;
  text-align: right;
  padding-right: 10px;
  padding-top: 1px;
  color: #409eff;
  font-size: 0.72em;
  font-weight: 700;
  cursor: pointer;
  user-select: none;
  line-height: inherit;
}

/* 经文文本（显示态） */
.iv-text {
  flex: 1;
  color: #333;
  cursor: text;
  min-height: 1.4em;
  word-break: break-word;
  border-bottom: 1px solid transparent;
  transition: border-color 0.15s;
  padding: 1px 0;
}

.iv-row:hover .iv-text {
  border-bottom-color: #d0d8e8;
}


/* 经文编辑框 */
.iv-edit-wrap {
  flex: 1;
  min-width: 0;
}

/* 注释按钮 */
.iv-btn-note {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 3px;
  color: #c0c4cc;
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
  opacity: 0;
}

.iv-row:hover .iv-btn-note {
  opacity: 1;
}

.iv-btn-note:hover {
  color: #409eff;
  background: #e6f0ff;
}

/* 有注释时常显 + 高亮 */
.iv-btn-note.has-note {
  opacity: 1;
  color: #e6a23c;
}

.iv-btn-note.has-note:hover {
  color: #cf8a12;
  background: #fdf6ec;
}

/* 注释预览 */
.iv-note-preview {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  flex-basis: 100%;
  margin-left: 36px;
  margin-top: 2px;
  margin-bottom: 2px;
  padding: 4px 8px;
  background: #fdf6ec;
  border-left: 3px solid #e6a23c;
  border-radius: 0 4px 4px 0;
  font-size: 12px;
  color: #8a6d3b;
  line-height: 1.5;
  cursor: pointer;
  word-break: break-word;
}

.iv-note-preview:hover {
  background: #fcecd3;
}

/* 操作按钮 */
.iv-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s;
  flex-shrink: 0;
  margin-left: 4px;
  padding-top: 1px;
}

.iv-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 3px;
  font-size: 14px;
  color: #999;
  cursor: pointer;
  transition: all 0.15s;
  user-select: none;
}

.iv-btn:hover {
  background: #e6f0ff;
  color: #409eff;
}

.iv-btn-del:hover {
  background: #fef0f0;
  color: #f56c6c;
}

/* 底部添加行 */
.iv-add-row {
  text-align: center;
  padding: 10px 0;
  margin-top: 8px;
  color: #a0aec0;
  font-size: 13px;
  cursor: pointer;
  border: 1px dashed #dce2ea;
  border-radius: 4px;
  transition: all 0.15s;
}

.iv-add-row:hover {
  color: #409eff;
  border-color: #409eff;
  background: #f5f8ff;
}

/* ============ 文档编辑器（富文本） ============ */
.rich-editor-section {
  background: #fff;
  border: 1px solid #e0e3e8;
  border-radius: 8px;
  padding: 24px 28px;
  max-height: 70vh;
  overflow-y: auto;
}
</style>
