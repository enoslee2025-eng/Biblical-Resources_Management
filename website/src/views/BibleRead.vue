<script setup>
/**
 * 经文阅读页面
 * 显示指定书卷的章节经文内容，支持切换章节
 * 支持多种显示模式：经典、段落、大字
 * 支持字体设置：字体、大小、行高、颜色
 */
import { ref, reactive, computed, onMounted, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { getResourceDetail, getResourceList } from '@/api/resource'
import { BIBLE_BOOK_NAMES } from '@/utils/fileImport'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

/** 资源 ID */
const resourceId = route.params.id

/** 资源数据 */
const resource = ref(null)

/** 书卷列表 */
const books = ref([])

/** 当前选中的书卷索引 */
const currentBookIndex = ref(0)

/** 当前选中的章索引 */
const currentChapterIndex = ref(0)

/** 已加载范围的起始章索引（向上加载时递减） */
const loadedStartIndex = ref(0)

/** 已加载范围的结束章索引（向下加载时递增） */
const loadedEndIndex = ref(0)

/** 滚动偏移量：当前可见章相对于起始章的偏移 */
const scrolledChapterOffset = ref(0)

/** 是否正在向上加载（用于保持滚动位置） */
let isPrependingChapter = false

/** 经文区域 DOM 引用（用于重置滚动位置） */
const verseAreaRef = ref(null)

/** 对照面板 DOM 引用 */
const compareAreaRef = ref(null)

/** 是否正在同步滚动（防止循环触发） */
let isSyncingScroll = false

/** 加载状态 */
const loading = ref(false)

/** 当前显示模式 */
const displayMode = ref('classic')

/** 是否启用对照模式 */
const compareMode = ref(false)

/** 所有圣经译本列表 */
const allBibleList = ref([])

/** 右侧可选译本（排除左侧当前译本） */
const bibleList = computed(() => allBibleList.value.filter(b => b.id !== leftResourceId.value))

/** 左侧当前译本 ID */
const leftResourceId = ref(Number(resourceId))

/** 对照译本的资源ID */
const compareResourceId = ref(null)

/** 对照译本的书卷数据 */
const compareBooks = ref([])

/** 对照译本加载中 */
const compareLoading = ref(false)

/** 是否显示字体设置弹窗 */
const showFontSettings = ref(false)

/** 字体设置 */
const fontSettings = reactive({
  fontFamily: 'default',
  fontSize: 16,
  lineHeight: 2,
  fontColor: '#333333',
  verseNumColor: '#409eff'
})

/** 可选字体列表 */
const fontFamilyOptions = [
  { value: 'default', label: '默认字体' },
  { value: '"SimSun", "宋体", serif', label: '宋体' },
  { value: '"Microsoft YaHei", "微软雅黑", sans-serif', label: '微软雅黑' },
  { value: '"KaiTi", "楷体", serif', label: '楷体' },
  { value: '"FangSong", "仿宋", serif', label: '仿宋' },
  { value: 'Georgia, "Times New Roman", serif', label: '衬线体' },
  { value: '"Helvetica Neue", Arial, sans-serif', label: '无衬线体' }
]

/** 预设颜色列表 */
const presetColors = [
  '#333333', '#000000', '#555555', '#8B4513',
  '#2c3e50', '#1a1a2e', '#16213e', '#0f3460'
]

/** 预设节号颜色 */
const presetNumColors = [
  '#409eff', '#67c23a', '#e6a23c', '#f56c6c',
  '#909399', '#1989fa', '#07c160', '#ff976a'
]

/** 字体设置 CSS 变量 */
const fontStyleVars = computed(() => {
  const ff = fontSettings.fontFamily === 'default' ? 'inherit' : fontSettings.fontFamily
  return {
    '--read-font-family': ff,
    '--read-font-size': fontSettings.fontSize + 'px',
    '--read-line-height': fontSettings.lineHeight,
    '--read-font-color': fontSettings.fontColor,
    '--read-verse-num-color': fontSettings.verseNumColor
  }
})

/** 显示模式选项 */
const displayModes = [
  { value: 'classic', label: '经典模式', desc: '每节一行，带节号' },
  { value: 'paragraph', label: '段落模式', desc: '自然段落排列' },
  { value: 'large', label: '大字模式', desc: '放大字体，舒适阅读' }
]

/** 判断书卷是否已导入内容 */
function isBookFilled(book) {
  if (!book || !book.chapters) return false
  return book.chapters.some(ch => ch.verses && ch.verses.length > 0)
}

/** 当前书卷 */
const currentBook = computed(() => books.value[currentBookIndex.value] || null)

/** 当前章节列表 */
const chapters = computed(() => currentBook.value?.chapters || [])

/** 当前章节内容 */
const currentChapter = computed(() => chapters.value[currentChapterIndex.value] || null)

/** 经文数据（结构化） */
const verses = computed(() => {
  if (!currentChapter.value) return []
  const raw = currentChapter.value.verses || currentChapter.value.content || []
  if (typeof raw === 'string') {
    return raw.split('\n').filter(l => l.trim()).map((line, i) => ({
      number: i + 1,
      text: line.trim()
    }))
  }
  if (Array.isArray(raw)) {
    return raw.map((v, i) => ({
      number: v.number ?? v.verse ?? (i + 1),
      text: v.text || v.content || (typeof v === 'string' ? v : ''),
      markedText: v.markedText || ''
    }))
  }
  return []
})

/** 页面标题 */
const pageTitle = computed(() => {
  const bookName = currentBook.value?.name || currentBook.value?.title || BIBLE_BOOK_NAMES[currentBookIndex.value] || ''
  const chapterNum = displayChapterIndex.value + 1
  return `${bookName} 第${chapterNum}章`
})

/** 对照译本：当前书卷 */
const compareBook = computed(() => compareBooks.value[currentBookIndex.value] || null)

/** 对照译本：当前章节 */
const compareChapter = computed(() => {
  if (!compareBook.value) return null
  const chs = compareBook.value.chapters || []
  return chs[currentChapterIndex.value] || null
})

/** 对照译本：经文数据 */
const compareVerses = computed(() => {
  if (!compareChapter.value) return []
  const raw = compareChapter.value.verses || compareChapter.value.content || []
  if (typeof raw === 'string') {
    return raw.split('\n').filter(l => l.trim()).map((line, i) => ({
      number: i + 1,
      text: line.trim()
    }))
  }
  if (Array.isArray(raw)) {
    return raw.map((v, i) => ({
      number: v.number ?? v.verse ?? (i + 1),
      text: v.text || v.content || (typeof v === 'string' ? v : '')
    }))
  }
  return []
})

/** 对照译本：段落模式（每5节分一段） */
const compareParagraphs = computed(() => {
  const result = []
  const groupSize = 5
  for (let i = 0; i < compareVerses.value.length; i += groupSize) {
    result.push(compareVerses.value.slice(i, i + groupSize))
  }
  return result
})

/** 对照译本名称 */
const compareResourceName = computed(() => {
  const found = bibleList.value.find(b => b.id === compareResourceId.value)
  return found ? found.title : ''
})

/** 对照译本：所有已加载章节的数据（与左侧保持相同范围） */
const compareLoadedChaptersData = computed(() => {
  if (!compareBook.value) return []
  const chs = compareBook.value.chapters || []
  const result = []
  const startIdx = loadedStartIndex.value
  const endIdx = Math.min(loadedEndIndex.value + 1, chs.length)
  for (let i = startIdx; i < endIdx; i++) {
    const ch = chs[i]
    if (!ch) continue
    const raw = ch.verses || ch.content || []
    let verseList
    if (typeof raw === 'string') {
      verseList = raw.split('\n').filter(l => l.trim()).map((line, j) => ({
        number: j + 1,
        text: line.trim()
      }))
    } else if (Array.isArray(raw)) {
      verseList = raw.map((v, j) => ({
        number: v.number ?? v.verse ?? (j + 1),
        text: v.text || v.content || (typeof v === 'string' ? v : '')
      }))
    } else {
      verseList = []
    }
    const chParagraphs = []
    for (let j = 0; j < verseList.length; j += 5) {
      chParagraphs.push(verseList.slice(j, j + 5))
    }
    result.push({
      chapterIndex: i,
      chapterNum: i + 1,
      verses: verseList,
      paragraphs: chParagraphs
    })
  }
  return result
})

/** 段落模式文本（每5节分一段） */
const paragraphs = computed(() => {
  const result = []
  const groupSize = 5
  for (let i = 0; i < verses.value.length; i += groupSize) {
    const group = verses.value.slice(i, i + groupSize)
    result.push(group)
  }
  return result
})

/** 所有已加载章节的数据（支持双向连续滑动阅读） */
const loadedChaptersData = computed(() => {
  const result = []
  const startIdx = loadedStartIndex.value
  const endIdx = Math.min(loadedEndIndex.value + 1, chapters.value.length)
  for (let i = startIdx; i < endIdx; i++) {
    const ch = chapters.value[i]
    if (!ch) continue
    const raw = ch.verses || ch.content || []
    let verseList
    if (typeof raw === 'string') {
      verseList = raw.split('\n').filter(l => l.trim()).map((line, j) => ({
        number: j + 1,
        text: line.trim()
      }))
    } else if (Array.isArray(raw)) {
      verseList = raw.map((v, j) => ({
        number: v.number ?? v.verse ?? (j + 1),
        text: v.text || v.content || (typeof v === 'string' ? v : ''),
        markedText: v.markedText || ''
      }))
    } else {
      verseList = []
    }
    /* 段落模式分组（每5节一段） */
    const chParagraphs = []
    for (let j = 0; j < verseList.length; j += 5) {
      chParagraphs.push(verseList.slice(j, j + 5))
    }
    result.push({
      chapterIndex: i,
      chapterNum: i + 1,
      verses: verseList,
      paragraphs: chParagraphs,
      sectionHeadings: ch.sectionHeadings || {}
    })
  }
  return result
})

/** 是否还有更多章可向下加载 */
const hasMoreChapters = computed(() => {
  return loadedEndIndex.value < chapters.value.length - 1
})

/** 是否还有更多章可向上加载 */
const hasPrevChapters = computed(() => {
  return loadedStartIndex.value > 0
})

/** 当前可见的章索引（滚动时自动更新，用于选择器和标题显示） */
const displayChapterIndex = computed(() => {
  return Math.min(
    loadedStartIndex.value + scrolledChapterOffset.value,
    chapters.value.length - 1
  )
})

/** 加载数据 */
async function loadData() {
  loading.value = true
  try {
    const res = await getResourceDetail(resourceId)
    const detail = res.data
    if (detail) {
      resource.value = detail
      const content = tryParseJson(detail.contentJson)
      if (content) {
        /** 支持两种数据格式：{ books: [...] } 或直接数组 */
        if (content.books) {
          books.value = content.books
        } else if (Array.isArray(content)) {
          books.value = content
        }
      }
      /** 从 URL 参数设置初始书卷和章节 */
      const bookParam = parseInt(route.query.book)
      if (!isNaN(bookParam) && bookParam >= 0 && bookParam < books.value.length) {
        currentBookIndex.value = bookParam
      }
      const chapterParam = parseInt(route.query.chapter)
      if (!isNaN(chapterParam) && chapterParam >= 0) {
        currentChapterIndex.value = chapterParam
      }
    }
  } catch (e) {
    console.error('加载失败:', e)
  } finally {
    loading.value = false
  }
}

/** 解析 JSON */
function tryParseJson(str) {
  try { return JSON.parse(str) } catch { return null }
}

/** 是否跳过书卷 watcher 的章节重置（prevChapter 跨书卷时使用） */
let skipBookWatcherReset = false

/**
 * 重置章节视图：设置加载范围并滚动到顶部
 * 关键：设置 isPrependingChapter 阻止 scrollTop=0 触发自动加载上一章
 */
function resetChapterView() {
  loadedStartIndex.value = currentChapterIndex.value
  loadedEndIndex.value = currentChapterIndex.value
  scrolledChapterOffset.value = 0
  isPrependingChapter = true
  nextTick(() => {
    if (verseAreaRef.value) {
      verseAreaRef.value.scrollTop = 0
    }
    if (compareAreaRef.value) {
      compareAreaRef.value.scrollTop = 0
    }
    /* 400ms 冷却期：scrollTop=0 触发的 scroll 事件不会自动加载上一章 */
    setTimeout(() => { isPrependingChapter = false }, 400)
  })
}

/** 切换书卷时重置章节 */
watch(currentBookIndex, () => {
  if (skipBookWatcherReset) {
    skipBookWatcherReset = false
  } else {
    currentChapterIndex.value = 0
  }
  resetChapterView()
})

/** 切换章节时重置视图 */
watch(currentChapterIndex, () => {
  resetChapterView()
})

/** 上一章 */
function prevChapter() {
  /* 基于当前可见章（而非 currentChapterIndex）导航，避免滚动偏移导致跳章 */
  const visible = displayChapterIndex.value
  if (visible > 0) {
    currentChapterIndex.value = visible - 1
  } else if (currentBookIndex.value > 0) {
    skipBookWatcherReset = true
    currentBookIndex.value--
    currentChapterIndex.value = chapters.value.length - 1
  }
}

/** 下一章 */
function nextChapter() {
  /* 基于当前可见章（而非 currentChapterIndex）导航，避免滚动偏移导致跳章 */
  const visible = displayChapterIndex.value
  if (visible < chapters.value.length - 1) {
    currentChapterIndex.value = visible + 1
  } else if (currentBookIndex.value < books.value.length - 1) {
    currentBookIndex.value++
    currentChapterIndex.value = 0
  }
}

/** 加载下一章（向下滚动触发） */
function loadNextChapter() {
  if (hasMoreChapters.value) {
    loadedEndIndex.value++
  }
}

/** 加载上一章（向上滚动触发），保持滚动位置不跳动 */
function loadPrevChapter() {
  if (!hasPrevChapters.value || isPrependingChapter) return
  const el = verseAreaRef.value
  if (!el) return

  isPrependingChapter = true
  const oldScrollHeight = el.scrollHeight
  loadedStartIndex.value--

  nextTick(() => {
    /* nextTick 在浏览器渲染前执行，此时 DOM 已更新但还没 paint */
    const newScrollHeight = el.scrollHeight
    el.scrollTop += (newScrollHeight - oldScrollHeight)
    /* 300ms 冷却期：防止惯性滚动在补偿后再次触发加载 */
    setTimeout(() => {
      isPrependingChapter = false
    }, 300)
  })
}

/** 经文区域滚动事件 → 接近顶/底部时自动加载上/下一章 + 更新可见章号 */
function onVerseAreaScroll(e) {
  if (isPrependingChapter) return
  const el = e.target

  /* 接近顶部时加载上一章 */
  if (el.scrollTop < 200 && hasPrevChapters.value) {
    loadPrevChapter()
  }

  /* 接近底部时加载下一章 */
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 200 && hasMoreChapters.value) {
    loadNextChapter()
  }

  /* 检测当前可见的章：第一个分隔符不计数（它对应 loadedStartIndex），从第二个开始计数 */
  const dividers = el.querySelectorAll('.chapter-divider')
  let offset = 0
  const containerTop = el.getBoundingClientRect().top
  const divArr = Array.from(dividers)
  for (let d = 1; d < divArr.length; d++) {
    if (divArr[d].getBoundingClientRect().top <= containerTop + 60) {
      offset++
    }
  }
  if (offset !== scrolledChapterOffset.value) {
    scrolledChapterOffset.value = offset
  }

  /* 对照模式：同步右侧面板滚动位置 */
  if (compareMode.value && !isSyncingScroll) {
    syncScroll(el, compareAreaRef.value)
  }
}

/** 对照面板滚动事件 → 加载上下章 + 同步左侧 */
function onCompareAreaScroll(e) {
  if (isPrependingChapter || !compareMode.value) return
  const el = e.target

  /* 接近顶部时加载上一章 */
  if (el.scrollTop < 200 && hasPrevChapters.value) {
    loadPrevChapter()
  }

  /* 接近底部时加载下一章 */
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 200 && hasMoreChapters.value) {
    loadNextChapter()
  }

  /* 同步左侧滚动位置 */
  if (!isSyncingScroll) {
    syncScroll(el, verseAreaRef.value)
  }
}

/**
 * 基于章节分隔线位置对齐同步滚动
 * 让目标面板的章节分隔线与源面板保持相同的垂直位置
 */
function syncScroll(source, target) {
  if (!source || !target) return
  isSyncingScroll = true

  const sourceDividers = source.querySelectorAll('.chapter-divider')
  const targetDividers = target.querySelectorAll('.chapter-divider')
  if (sourceDividers.length === 0 || targetDividers.length === 0) {
    const ratio = source.scrollTop / (source.scrollHeight - source.clientHeight || 1)
    target.scrollTop = ratio * (target.scrollHeight - target.clientHeight)
    setTimeout(() => { isSyncingScroll = false }, 50)
    return
  }

  const sourceTop = source.getBoundingClientRect().top
  const srcArr = Array.from(sourceDividers)
  const tgtArr = Array.from(targetDividers)

  /* 找到离容器顶部最近的章节分隔符 */
  let activeIdx = 0
  let minDist = Infinity
  for (let i = 0; i < srcArr.length; i++) {
    const dist = Math.abs(srcArr[i].getBoundingClientRect().top - sourceTop)
    if (dist < minDist) {
      minDist = dist
      activeIdx = i
    }
  }

  /* 源面板中该分隔线相对容器顶部的位置 */
  const srcDivY = srcArr[activeIdx].getBoundingClientRect().top - sourceTop

  /* 目标面板对齐：让相同章节的分隔线出现在相同的垂直位置 */
  const tgtIdx = Math.min(activeIdx, tgtArr.length - 1)
  const tgtDivOffsetTop = tgtArr[tgtIdx].offsetTop - target.offsetTop
  target.scrollTop = tgtDivOffsetTop - srcDivY

  setTimeout(() => { isSyncingScroll = false }, 50)
}

/** 返回详情页 */
function goBack() {
  router.push(`/bible/detail/${resourceId}`)
}

/**
 * 切换对照模式
 */
function toggleCompare() {
  compareMode.value = !compareMode.value
  if (compareMode.value && bibleList.value.length === 0) {
    loadBibleList()
  }
}

/**
 * 加载所有圣经译本列表
 */
async function loadBibleList() {
  try {
    const res = await getResourceList('bible')
    allBibleList.value = res.data || []
  } catch (e) {
    // 静默处理
  }
}

/**
 * 加载对照译本内容
 */
async function loadCompareResource() {
  if (!compareResourceId.value) {
    compareBooks.value = []
    return
  }
  compareLoading.value = true
  try {
    const res = await getResourceDetail(compareResourceId.value)
    const detail = res.data
    if (detail) {
      const content = tryParseJson(detail.contentJson)
      if (content) {
        if (content.books) {
          compareBooks.value = content.books
        } else if (Array.isArray(content)) {
          compareBooks.value = content
        }
      }
    }
  } catch (e) {
    console.error('加载对照译本失败:', e)
  } finally {
    compareLoading.value = false
  }
}

/** 选择对照译本后自动加载 */
watch(compareResourceId, () => {
  loadCompareResource()
})

/** 切换左侧译本后重新加载数据 */
watch(leftResourceId, async (newId) => {
  if (!newId) return
  loading.value = true
  try {
    const res = await getResourceDetail(newId)
    const detail = res.data
    if (detail) {
      resource.value = detail
      const content = tryParseJson(detail.contentJson)
      if (content) {
        if (content.books) {
          books.value = content.books
        } else if (Array.isArray(content)) {
          books.value = content
        }
      }
    }
    /* 如果右侧选了相同译本则清除 */
    if (compareResourceId.value === newId) {
      compareResourceId.value = null
    }
  } catch (e) {
    console.error('加载译本失败:', e)
  } finally {
    loading.value = false
  }
  resetChapterView()
})

/** 从 localStorage 恢复显示模式偏好 */
function loadDisplayMode() {
  const saved = localStorage.getItem('bible_display_mode')
  if (saved && displayModes.some(m => m.value === saved)) {
    displayMode.value = saved
  }
}

/** 保存显示模式偏好 */
watch(displayMode, (val) => {
  localStorage.setItem('bible_display_mode', val)
})

/** 从 localStorage 恢复字体设置 */
function loadFontSettings() {
  const saved = localStorage.getItem('bible_font_settings')
  if (saved) {
    try {
      const parsed = JSON.parse(saved)
      Object.assign(fontSettings, parsed)
    } catch {
      // 忽略无效数据
    }
  }
}

/** 保存字体设置到 localStorage */
function saveFontSettings() {
  localStorage.setItem('bible_font_settings', JSON.stringify({ ...fontSettings }))
}

/** 监听字体设置变化，自动保存 */
watch(fontSettings, () => {
  saveFontSettings()
}, { deep: true })

/** 重置字体设置为默认值 */
function resetFontSettings() {
  fontSettings.fontFamily = 'default'
  fontSettings.fontSize = 16
  fontSettings.lineHeight = 2
  fontSettings.fontColor = '#333333'
  fontSettings.verseNumColor = '#409eff'
}

onMounted(() => {
  loadDisplayMode()
  loadFontSettings()
  loadData()
})
</script>

<template>
  <div class="bible-read" v-loading="loading">
    <!-- 顶部控制栏 -->
    <div class="control-bar">
      <el-select v-model="currentBookIndex" filterable style="width: 180px; font-weight: bold;">
        <el-option-group :label="t('detail_old_testament')">
          <el-option
            v-for="idx in Math.min(39, books.length)"
            :key="idx - 1"
            :label="books[idx - 1]?.name || books[idx - 1]?.title || BIBLE_BOOK_NAMES[idx - 1] || `Book ${idx}`"
            :value="idx - 1"
          >
            <span :style="{ color: isBookFilled(books[idx - 1]) ? '' : '#ccc' }">
              {{ books[idx - 1]?.name || books[idx - 1]?.title || BIBLE_BOOK_NAMES[idx - 1] || `Book ${idx}` }}
            </span>
            <span v-if="isBookFilled(books[idx - 1])" style="float: right; color: #5a8a6e; font-size: 12px;">✓</span>
            <span v-else style="float: right; color: #ccc; font-size: 11px;">{{ t('detail_not_imported') }}</span>
          </el-option>
        </el-option-group>
        <el-option-group v-if="books.length > 39" :label="t('detail_new_testament')">
          <el-option
            v-for="idx in (books.length - 39)"
            :key="idx + 38"
            :label="books[idx + 38]?.name || books[idx + 38]?.title || BIBLE_BOOK_NAMES[idx + 38] || `Book ${idx + 39}`"
            :value="idx + 38"
          >
            <span :style="{ color: isBookFilled(books[idx + 38]) ? '' : '#ccc' }">
              {{ books[idx + 38]?.name || books[idx + 38]?.title || BIBLE_BOOK_NAMES[idx + 38] || `Book ${idx + 39}` }}
            </span>
            <span v-if="isBookFilled(books[idx + 38])" style="float: right; color: #5a8a6e; font-size: 12px;">✓</span>
            <span v-else style="float: right; color: #ccc; font-size: 11px;">{{ t('detail_not_imported') }}</span>
          </el-option>
        </el-option-group>
      </el-select>
      <el-select :model-value="displayChapterIndex" @update:model-value="val => currentChapterIndex = val" style="width: 110px; font-weight: bold;">
        <el-option
          v-for="(ch, idx) in chapters"
          :key="idx"
          :label="`第${idx + 1}章`"
          :value="idx"
        />
      </el-select>
      <el-button size="small" @click="prevChapter"
        :disabled="currentBookIndex === 0 && currentChapterIndex === 0">
        上一章
      </el-button>
      <el-button type="primary" size="small" @click="nextChapter"
        :disabled="currentBookIndex === books.length - 1 && currentChapterIndex === chapters.length - 1">
        下一章
      </el-button>
      <div class="control-spacer" />
        <!-- 显示模式切换 -->
        <el-dropdown trigger="click" @command="(val) => displayMode = val">
          <el-button size="small">
            <el-icon><View /></el-icon>
            {{ displayModes.find(m => m.value === displayMode)?.label }}
            <el-icon class="el-icon--right"><ArrowDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item
                v-for="mode in displayModes"
                :key="mode.value"
                :command="mode.value"
                :class="{ 'is-active': displayMode === mode.value }"
              >
                <div>
                  <div style="font-weight: 500;">{{ mode.label }}</div>
                  <div style="font-size: 12px; color: #999;">{{ mode.desc }}</div>
                </div>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      <el-button size="small" @click="router.push({ path: `/bible/edit/${resourceId}`, query: { book: currentBookIndex, chapter: displayChapterIndex } })">修改</el-button>
    </div>

    <div class="read-content" :class="{ 'compare-layout': compareMode }" :style="fontStyleVars">
      <!-- 左侧：主译本经文 -->
      <div ref="verseAreaRef" class="verse-area" :class="['mode-' + displayMode, { 'compare-half': compareMode }]" @scroll="onVerseAreaScroll">
        <div v-if="compareMode" class="verse-area-label">
          <el-select v-model="leftResourceId" style="width: 200px;">
            <el-option
              v-for="b in allBibleList"
              :key="b.id"
              :label="b.title"
              :value="b.id"
            />
          </el-select>
        </div>
        <template v-if="loadedChaptersData.length > 0">
          <!-- 经典模式：每节一行 -->
          <div v-if="displayMode === 'classic'" class="verse-classic">
            <template v-for="chData in loadedChaptersData" :key="'ch-' + chData.chapterIndex">
              <div class="chapter-divider" :class="{ 'chapter-divider-first': chData.chapterIndex === loadedStartIndex }">
                <span>第{{ chData.chapterNum }}章</span>
              </div>
              <template v-for="(v, idx) in chData.verses" :key="chData.chapterIndex + '-' + idx">
                <div v-if="chData.sectionHeadings[v.number]" class="section-heading">{{ chData.sectionHeadings[v.number] }}</div>
                <div class="verse-line">
                  <span class="verse-num">{{ v.number }}</span>
                  <span v-if="v.markedText" class="verse-text" v-html="v.markedText"></span>
                  <span v-else class="verse-text">{{ v.text }}</span>
                </div>
              </template>
            </template>
          </div>

          <!-- 段落模式：按段落排列 -->
          <div v-else-if="displayMode === 'paragraph'" class="verse-paragraph">
            <template v-for="chData in loadedChaptersData" :key="'ch-' + chData.chapterIndex">
              <div class="chapter-divider" :class="{ 'chapter-divider-first': chData.chapterIndex === loadedStartIndex }">
                <span>第{{ chData.chapterNum }}章</span>
              </div>
              <p v-for="(group, gi) in chData.paragraphs" :key="chData.chapterIndex + '-p-' + gi" class="paragraph-block">
                <template v-for="(v, vi) in group" :key="vi">
                  <br v-if="chData.sectionHeadings[v.number]" /><strong v-if="chData.sectionHeadings[v.number]" class="section-heading-inline">{{ chData.sectionHeadings[v.number] }}</strong><br v-if="chData.sectionHeadings[v.number]" />
                  <sup class="verse-num-inline">{{ v.number }}</sup><span v-if="v.markedText" v-html="v.markedText"></span><template v-else>{{ v.text }}</template>
                </template>
              </p>
            </template>
          </div>

          <!-- 大字模式 -->
          <div v-else-if="displayMode === 'large'" class="verse-large">
            <template v-for="chData in loadedChaptersData" :key="'ch-' + chData.chapterIndex">
              <div class="chapter-divider chapter-divider-large" :class="{ 'chapter-divider-first': chData.chapterIndex === loadedStartIndex }">
                <span>第{{ chData.chapterNum }}章</span>
              </div>
              <template v-for="(v, idx) in chData.verses" :key="chData.chapterIndex + '-' + idx">
                <div v-if="chData.sectionHeadings[v.number]" class="section-heading section-heading-large">{{ chData.sectionHeadings[v.number] }}</div>
                <div class="verse-line-large">
                  <span class="verse-num-large">{{ v.number }}</span>
                  <span v-if="v.markedText" class="verse-text" v-html="v.markedText"></span>
                  <span v-else class="verse-text">{{ v.text }}</span>
                </div>
              </template>
            </template>
          </div>

        </template>
        <el-empty v-else description="暂无经文内容" />
      </div>

      <!-- 右侧：对照译本（对照模式时显示） -->
      <div v-if="compareMode" ref="compareAreaRef" class="verse-area compare-half" :class="['mode-' + displayMode]" @scroll="onCompareAreaScroll">
        <div class="verse-area-label">
          <el-select v-model="compareResourceId" placeholder="选择对照译本" style="width: 200px;" clearable>
            <el-option
              v-for="b in bibleList"
              :key="b.id"
              :label="b.title"
              :value="b.id"
            />
          </el-select>
        </div>
        <div v-if="compareLoading" style="text-align: center; padding: 40px;">
          <el-icon class="is-loading" :size="24"><Loading /></el-icon>
        </div>
        <template v-else-if="compareResourceId && compareLoadedChaptersData.length > 0">
          <!-- 经典模式 -->
          <div v-if="displayMode === 'classic'" class="verse-classic">
            <template v-for="chData in compareLoadedChaptersData" :key="'cmp-ch-' + chData.chapterIndex">
              <div class="chapter-divider" :class="{ 'chapter-divider-first': chData.chapterIndex === loadedStartIndex }">
                <span>第{{ chData.chapterNum }}章</span>
              </div>
              <div v-for="(v, idx) in chData.verses" :key="chData.chapterIndex + '-' + idx" class="verse-line">
                <span class="verse-num">{{ v.number }}</span>
                <span class="verse-text">{{ v.text }}</span>
              </div>
            </template>
          </div>
          <!-- 段落模式 -->
          <div v-else-if="displayMode === 'paragraph'" class="verse-paragraph">
            <template v-for="chData in compareLoadedChaptersData" :key="'cmp-ch-' + chData.chapterIndex">
              <div class="chapter-divider" :class="{ 'chapter-divider-first': chData.chapterIndex === loadedStartIndex }">
                <span>第{{ chData.chapterNum }}章</span>
              </div>
              <p v-for="(group, gi) in chData.paragraphs" :key="chData.chapterIndex + '-p-' + gi" class="paragraph-block">
                <template v-for="(v, vi) in group" :key="vi">
                  <sup class="verse-num-inline">{{ v.number }}</sup>{{ v.text }}
                </template>
              </p>
            </template>
          </div>
          <!-- 大字模式 -->
          <div v-else-if="displayMode === 'large'" class="verse-large">
            <template v-for="chData in compareLoadedChaptersData" :key="'cmp-ch-' + chData.chapterIndex">
              <div class="chapter-divider chapter-divider-large" :class="{ 'chapter-divider-first': chData.chapterIndex === loadedStartIndex }">
                <span>第{{ chData.chapterNum }}章</span>
              </div>
              <div v-for="(v, idx) in chData.verses" :key="chData.chapterIndex + '-' + idx" class="verse-line-large">
                <span class="verse-num-large">{{ v.number }}</span>
                <span class="verse-text">{{ v.text }}</span>
              </div>
            </template>
          </div>
        </template>
        <el-empty v-else-if="compareResourceId" description="该章节无经文" />
        <el-empty v-else description="请选择对照译本" />
      </div>

    </div>
  </div>
</template>

<style scoped>
.bible-read {
  max-width: 1000px;
  margin: 0 auto;
  padding: 24px 20px;
}

.control-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  font-size: 14px;
  background: #fff;
  border: 1px solid var(--church-border, #e0d8cf);
  border-radius: 4px;
  padding: 10px 16px;
}

.control-bar :deep(.el-select .el-input__inner) {
  font-weight: bold;
  color: #333;
}

.control-spacer {
  flex: 1;
}

.read-content {
  display: flex;
  gap: 0;
}

.verse-area {
  flex: 1;
  background: #fff;
  border: 1px solid var(--church-border, #e0d8cf);
  border-radius: 4px;
  padding: 24px;
  min-height: 500px;
  max-height: 75vh;
  overflow-y: auto;
  overflow-anchor: none;
}

/* ===== 经典模式（使用 CSS 变量支持字体自定义） ===== */
.verse-classic .verse-line {
  display: flex;
  align-items: flex-start;
  font-family: var(--read-font-family, inherit);
  font-size: var(--read-font-size, 15px);
  line-height: var(--read-line-height, 2);
  color: var(--read-font-color, #333);
  margin-bottom: 2px;
  padding: 0 8px;
}

.verse-num {
  flex-shrink: 0;
  margin-right: 2px;
  color: var(--read-verse-num-color, #409eff);
  font-size: 0.85em;
  font-weight: 700;
  line-height: inherit;
}

.verse-text {
  flex: 1;
}

/* 人名标注样式（黑色下划线） */
.verse-text :deep(.person-name) {
  text-decoration: underline;
  text-decoration-color: #333;
  text-underline-offset: 3px;
  color: inherit;
}

/* 地名标注样式（蓝色波浪线） */
.verse-text :deep(.place-name) {
  text-decoration: underline wavy;
  text-decoration-color: var(--church-navy, #3d5a80);
  text-underline-offset: 3px;
  color: inherit;
}

/* 高置信度标注 */
.verse-text :deep(.confidence-high) {
  opacity: 1;
}

/* 中置信度标注（虚线） */
.verse-text :deep(.confidence-medium) {
  opacity: 0.85;
  text-decoration-style: dashed !important;
}

/* 低置信度标注（点线、淡化） */
.verse-text :deep(.confidence-low) {
  opacity: 0.6;
  text-decoration-style: dotted !important;
}

/* 段落标题（如 "制定安息日"） */
.section-heading {
  font-weight: 600;
  color: #555;
  font-size: var(--read-font-size, 15px);
  margin: 18px 0 6px;
  padding-left: 0;
}

.section-heading-large {
  font-size: calc(var(--read-font-size, 16px) + 2px);
}

.section-heading-inline {
  font-weight: 600;
  color: #555;
  font-size: 0.95em;
}

/* ===== 段落模式 ===== */
.verse-paragraph .paragraph-block {
  font-family: var(--read-font-family, inherit);
  font-size: var(--read-font-size, 15px);
  line-height: var(--read-line-height, 1.9);
  color: var(--read-font-color, #333);
  text-indent: 2em;
  margin-bottom: 16px;
}

.verse-num-inline {
  color: var(--read-verse-num-color, #409eff);
  font-size: 0.65em;
  font-weight: 700;
  margin: 0 2px;
  vertical-align: super;
}

/* ===== 大字模式（字号在自定义基础上放大） ===== */
.mode-large {
  padding: 32px 40px;
}

.verse-large .verse-line-large {
  display: flex;
  align-items: flex-start;
  font-family: var(--read-font-family, inherit);
  font-size: calc(var(--read-font-size, 16px) + 4px);
  line-height: calc(var(--read-line-height, 2) + 0.2);
  color: var(--read-font-color, #222);
  margin-bottom: 6px;
}

.verse-num-large {
  flex-shrink: 0;
  margin-right: 2px;
  color: var(--read-verse-num-color, #409eff);
  font-size: 0.75em;
  font-weight: 700;
  line-height: inherit;
}

/* ===== 章节分隔符（连续滑动阅读） ===== */
.chapter-divider {
  text-align: center;
  margin: 28px 0 16px;
  padding: 8px 0;
  border-top: 1px solid #e8e8e8;
  color: var(--church-navy, #3d5a80);
  font-size: 15px;
  font-weight: 600;
}

.chapter-divider-first {
  border-top: none;
  margin-top: 0;
}

.chapter-divider-large {
  font-size: 18px;
  margin: 36px 0 20px;
}

/* 加载提示 */
.load-more-hint {
  text-align: center;
  padding: 20px 0;
  color: #999;
  font-size: 13px;
}

.load-prev-hint {
  padding: 12px 0 20px;
}


/* ===== 对照模式 ===== */
.compare-layout {
  display: flex;
  gap: 0;
}

.compare-half {
  flex: 1;
  border-radius: 0;
}

.compare-half:first-child {
  border-right: none;
  border-radius: 6px 0 0 6px;
}

.compare-half:nth-child(2) {
  border-radius: 0 6px 6px 0;
  border-left: 2px solid #e8e8e8;
}

.verse-area-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--church-navy, #3d5a80);
  padding: 0 0 12px;
  border-bottom: 1px solid #f0f0f0;
  margin-bottom: 12px;
}

.compare-label {
  color: var(--church-navy, #3d5a80);
}

/* 活跃的下拉项 */
:deep(.is-active) {
  color: var(--church-navy, #3d5a80);
  background-color: #ecf5ff;
}

/* ===== 字体设置面板 ===== */
.font-settings-panel {
  padding: 4px 0;
}

.font-settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.font-settings-title {
  font-size: 15px;
  font-weight: 600;
  color: #333;
}

.font-setting-item {
  margin-bottom: 14px;
}

.font-setting-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: #666;
  margin-bottom: 6px;
}

.font-setting-value {
  font-size: 12px;
  color: var(--church-navy, #3d5a80);
  font-weight: 600;
}

.color-picker-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.color-dot {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid transparent;
  transition: border-color 0.2s, transform 0.15s;
}

.color-dot:hover {
  transform: scale(1.15);
}

.color-dot.active {
  border-color: var(--church-navy, #3d5a80);
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.3);
}

.font-preview {
  background: #f8f9fa;
  border-radius: 6px;
  padding: 12px;
  margin-top: 4px;
  border: 1px solid #eee;
}
</style>
