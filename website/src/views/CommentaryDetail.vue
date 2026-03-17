<script setup>
/**
 * 注释详情页
 * 显示注释资源的概览信息 + 按书卷浏览注释覆盖情况
 * 支持逐节查看和编辑注释
 */
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { getResourceDetail, deleteResource } from '@/api/resource'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Document, ArrowRight, ArrowDown, Plus, Edit, Upload } from '@element-plus/icons-vue'
import { BIBLE_BOOK_NAMES, BOOK_CHAPTER_COUNTS, BIBLE_VERSE_COUNTS } from '@/utils/fileImport'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

/** 资源 ID */
const resourceId = route.params.id

/** 资源数据 */
const resource = ref(null)

/** 元数据 */
const meta = ref({})

/** 注释条目列表（原始） */
const entries = ref([])

/** 加载状态 */
const loading = ref(false)

/** 旧约/新约展开状态 */
const oldTestamentOpen = ref(true)
const newTestamentOpen = ref(false)

/**
 * 解析经文引用，提取书卷索引
 * 支持格式：创1:1、创世记1:1、创世记 第1章:1 等
 */
function parseVerseRef(verseStr) {
  if (!verseStr) return null
  const s = verseStr.trim()

  /* 尝试匹配 "书名 章:节" 格式 */
  for (let i = 0; i < BIBLE_BOOK_NAMES.length; i++) {
    const name = BIBLE_BOOK_NAMES[i]
    if (s.startsWith(name)) {
      const rest = s.slice(name.length).trim()
      const m = rest.match(/第?(\d+)[章:]?\s*[:：]?\s*(\d+)?/)
      if (m) {
        return { bookIndex: i, chapter: parseInt(m[1]) - 1, verse: m[2] ? parseInt(m[2]) : null }
      }
      /* 如果只有书名没有章节号 */
      return { bookIndex: i, chapter: 0, verse: null }
    }
  }

  /* 尝试匹配缩写格式 "创1:1" */
  const shortMap = buildShortNameMap()
  for (const [abbr, idx] of Object.entries(shortMap)) {
    if (s.startsWith(abbr)) {
      const rest = s.slice(abbr.length).trim()
      const m = rest.match(/(\d+)\s*[:：]\s*(\d+)?/)
      if (m) {
        return { bookIndex: idx, chapter: parseInt(m[1]) - 1, verse: m[2] ? parseInt(m[2]) : null }
      }
    }
  }

  return null
}

/** 构建书卷缩写映射 */
function buildShortNameMap() {
  const map = {}
  BIBLE_BOOK_NAMES.forEach((name, idx) => {
    /* 取前一个字作为缩写 */
    if (name.length >= 1) map[name[0]] = idx
    /* 取前两个字 */
    if (name.length >= 2) map[name.slice(0, 2)] = idx
  })
  return map
}

/** 按书卷分组的注释数据 */
const bookStats = computed(() => {
  const stats = new Array(66).fill(null).map((_, i) => ({
    bookIndex: i,
    name: BIBLE_BOOK_NAMES[i],
    totalChapters: BOOK_CHAPTER_COUNTS[i],
    entryCount: 0,
    chaptersWithEntries: new Set()
  }))

  entries.value.forEach(entry => {
    const parsed = parseVerseRef(entry.verse)
    if (parsed && parsed.bookIndex >= 0 && parsed.bookIndex < 66) {
      stats[parsed.bookIndex].entryCount++
      stats[parsed.bookIndex].chaptersWithEntries.add(parsed.chapter)
    }
  })

  return stats
})

/** 旧约书卷统计（前39卷） */
const oldTestamentStats = computed(() => bookStats.value.slice(0, 39))

/** 新约书卷统计（第40-66卷） */
const newTestamentStats = computed(() => bookStats.value.slice(39))

/** 总注释条目数 */
const totalEntries = computed(() => entries.value.length)

/** 已覆盖书卷数 */
const coveredBooks = computed(() => bookStats.value.filter(b => b.entryCount > 0).length)

/** 已覆盖章数 */
const coveredChapters = computed(() => {
  let total = 0
  bookStats.value.forEach(b => { total += b.chaptersWithEntries.size })
  return total
})

/** 总章数 */
const totalChapters = computed(() => BOOK_CHAPTER_COUNTS.reduce((a, b) => a + b, 0))

/** 加载资源详情 */
async function loadDetail() {
  loading.value = true
  try {
    const res = await getResourceDetail(resourceId)
    const detail = res.data
    resource.value = detail
    meta.value = tryParseJson(detail.metaJson) || {}

    if (detail.contentJson) {
      entries.value = JSON.parse(detail.contentJson) || []
    }
  } catch (e) {
    console.error('加载详情失败:', e)
  } finally {
    loading.value = false
  }
}

/** 解析 JSON */
function tryParseJson(str) {
  try { return JSON.parse(str) } catch { return null }
}

/** 删除注释 */
async function handleDelete() {
  try {
    await ElMessageBox.confirm(t('detail_delete_confirm'), t('detail_delete_title'), {
      type: 'warning',
      confirmButtonText: t('confirm'),
      cancelButtonText: t('cancel')
    })
    await deleteResource(resourceId)
    ElMessage.success(t('detail_delete_success'))
    router.push('/commentary')
  } catch (e) {
    if (e !== 'cancel' && e !== 'close') {
      ElMessage.error(t('detail_delete_fail'))
    }
  }
}

/** 查看/编辑书卷注释 */
function handleReadBook(bookIndex) {
  router.push(`/commentary/read/${resourceId}?book=${bookIndex}`)
}

/** 备注列表 */
const notes = computed(() => meta.value.notes || [])
const showNoteInput = ref(false)
const newNoteText = ref('')
const noteSaving = ref(false)

/** 保存 meta */
async function saveMeta() {
  const { updateResource } = await import('@/api/resource')
  await updateResource(resourceId, { metaJson: JSON.stringify(meta.value) })
}

/** 添加备注 */
async function handleAddNote() {
  const text = newNoteText.value.trim()
  if (!text) { ElMessage.warning(t('detail_note_empty')); return }
  noteSaving.value = true
  try {
    if (!meta.value.notes) meta.value.notes = []
    meta.value.notes.unshift({ id: Date.now(), text, time: new Date().toLocaleString() })
    await saveMeta()
    newNoteText.value = ''
    showNoteInput.value = false
    ElMessage.success(t('detail_note_saved'))
  } catch (e) {
    console.error('保存备注失败:', e)
  } finally {
    noteSaving.value = false
  }
}

/** 删除备注 */
async function handleDeleteNote(noteId) {
  meta.value.notes = meta.value.notes.filter(n => n.id !== noteId)
  try { await saveMeta(); ElMessage.success(t('detail_note_deleted')) } catch (e) { console.error('删除备注失败:', e) }
}

onMounted(() => { loadDetail() })
</script>

<template>
  <div class="detail-page" v-loading="loading">
    <template v-if="resource">
      <!-- 注释信息卡片 -->
      <div class="info-card">
        <div class="card-header">
          <div class="card-header-left">
            <div class="card-icon">
              <el-icon :size="22"><Document /></el-icon>
            </div>
            <div class="card-header-info">
              <h2 class="card-title">{{ resource.title }}</h2>
              <span class="card-subtitle">{{ meta.iso || '' }} · {{ t('type_commentary') }}</span>
            </div>
          </div>
          <div class="card-header-actions">
            <div class="action-pill" @click="router.push(`/commentary/import?id=${resourceId}`)">
              <el-icon :size="12"><Upload /></el-icon>
              {{ t('commentary_import_btn') }}
            </div>
            <div class="action-pill" @click="router.push(`/commentary/edit/${resourceId}`)">
              <el-icon :size="12"><Edit /></el-icon>
              {{ t('commentary_edit_entries') }}
            </div>
            <div class="action-pill" @click="router.push(`/commentary/read/${resourceId}`)">
              <el-icon :size="12"><Document /></el-icon>
              {{ t('commentary_read_btn') }}
            </div>
            <div class="action-pill action-pill-danger" @click="handleDelete">{{ t('delete') }}</div>
          </div>
        </div>

        <!-- 统计数据网格 -->
        <div class="stats-grid">
          <div class="stats-item">
            <span class="stats-value">{{ totalEntries }}</span>
            <span class="stats-label">{{ t('commentary_stat_entries') }}</span>
          </div>
          <div class="stats-item">
            <span class="stats-value">{{ coveredBooks }} / 66</span>
            <span class="stats-label">{{ t('commentary_stat_books') }}</span>
          </div>
          <div class="stats-item">
            <span class="stats-value">{{ coveredChapters }}</span>
            <span class="stats-label">{{ t('commentary_stat_chapters') }}</span>
          </div>
          <div class="stats-item">
            <div class="stats-progress">
              <el-progress :percentage="Math.round(coveredBooks / 66 * 100)" :stroke-width="6" :show-text="false" color="#5a8a6e" />
              <span class="stats-progress-text">{{ Math.round(coveredBooks / 66 * 100) }}%</span>
            </div>
            <span class="stats-label">{{ t('commentary_stat_coverage') }}</span>
          </div>
        </div>

        <div v-if="meta.summary" class="info-desc">{{ meta.summary }}</div>
      </div>

      <!-- 书卷目录 -->
      <div class="section-card">
        <div class="section-header">
          <h3 class="section-title">{{ t('commentary_book_directory') }}</h3>
          <span class="section-count">{{ coveredBooks }} / 66 {{ t('resource_book_unit') }}</span>
        </div>

        <!-- 旧约 -->
        <div class="testament-group">
          <div class="testament-header" @click="oldTestamentOpen = !oldTestamentOpen">
            <div class="testament-header-left">
              <el-icon class="testament-arrow" :class="{ 'is-open': oldTestamentOpen }"><ArrowDown /></el-icon>
              <span class="testament-title">{{ t('detail_old_testament') }}</span>
            </div>
            <span class="testament-count">{{ oldTestamentStats.filter(b => b.entryCount > 0).length }} / 39 {{ t('resource_book_unit') }}</span>
          </div>
          <div v-show="oldTestamentOpen" class="book-list">
            <div v-for="book in oldTestamentStats" :key="book.bookIndex" class="book-item" :class="{ 'book-item-empty': book.entryCount === 0 }" @click="handleReadBook(book.bookIndex)">
              <span class="book-index">{{ book.bookIndex + 1 }}</span>
              <div class="book-info">
                <span class="book-name">{{ book.name }}</span>
                <span class="book-meta">{{ book.chaptersWithEntries.size }}/{{ book.totalChapters }} {{ t('detail_book_chapters_short') }} · {{ book.entryCount }} {{ t('commentary_stat_notes_unit') }}</span>
              </div>
              <div class="book-progress" v-if="book.entryCount > 0">
                <el-progress :percentage="Math.round(book.chaptersWithEntries.size / book.totalChapters * 100)" :stroke-width="4" :show-text="false" :color="book.chaptersWithEntries.size === book.totalChapters ? '#67c23a' : '#5a8a6e'" />
                <span class="book-progress-text">{{ Math.round(book.chaptersWithEntries.size / book.totalChapters * 100) }}%</span>
              </div>
              <el-icon class="book-arrow"><ArrowRight /></el-icon>
            </div>
          </div>
        </div>

        <!-- 新约 -->
        <div class="testament-group">
          <div class="testament-header" @click="newTestamentOpen = !newTestamentOpen">
            <div class="testament-header-left">
              <el-icon class="testament-arrow" :class="{ 'is-open': newTestamentOpen }"><ArrowDown /></el-icon>
              <span class="testament-title">{{ t('detail_new_testament') }}</span>
            </div>
            <span class="testament-count">{{ newTestamentStats.filter(b => b.entryCount > 0).length }} / 27 {{ t('resource_book_unit') }}</span>
          </div>
          <div v-show="newTestamentOpen" class="book-list">
            <div v-for="book in newTestamentStats" :key="book.bookIndex" class="book-item" :class="{ 'book-item-empty': book.entryCount === 0 }" @click="handleReadBook(book.bookIndex)">
              <span class="book-index">{{ book.bookIndex + 1 }}</span>
              <div class="book-info">
                <span class="book-name">{{ book.name }}</span>
                <span class="book-meta">{{ book.chaptersWithEntries.size }}/{{ book.totalChapters }} {{ t('detail_book_chapters_short') }} · {{ book.entryCount }} {{ t('commentary_stat_notes_unit') }}</span>
              </div>
              <div class="book-progress" v-if="book.entryCount > 0">
                <el-progress :percentage="Math.round(book.chaptersWithEntries.size / book.totalChapters * 100)" :stroke-width="4" :show-text="false" :color="book.chaptersWithEntries.size === book.totalChapters ? '#67c23a' : '#5a8a6e'" />
                <span class="book-progress-text">{{ Math.round(book.chaptersWithEntries.size / book.totalChapters * 100) }}%</span>
              </div>
              <el-icon class="book-arrow"><ArrowRight /></el-icon>
            </div>
          </div>
        </div>
      </div>

      <!-- 备注 -->
      <div class="section-card">
        <div class="section-header">
          <h3 class="section-title">{{ t('detail_message_board') }}</h3>
          <div class="action-pill" @click="showNoteInput = !showNoteInput">
            <el-icon :size="12"><Plus /></el-icon>
            {{ t('detail_add_message') }}
          </div>
        </div>
        <div v-if="showNoteInput" class="note-input-area">
          <el-input v-model="newNoteText" type="textarea" :rows="3" :placeholder="t('detail_note_placeholder')" />
          <div class="note-input-actions">
            <el-button size="small" @click="showNoteInput = false; newNoteText = ''">{{ t('cancel') }}</el-button>
            <el-button type="primary" size="small" :loading="noteSaving" @click="handleAddNote">{{ t('confirm') }}</el-button>
          </div>
        </div>
        <div v-if="notes.length > 0" class="note-list">
          <div v-for="note in notes" :key="note.id" class="note-item">
            <div class="note-content">{{ note.text }}</div>
            <div class="note-footer">
              <span class="note-time">{{ note.time }}</span>
              <span class="note-delete" @click="handleDeleteNote(note.id)">{{ t('delete') }}</span>
            </div>
          </div>
        </div>
        <div v-if="notes.length === 0 && !showNoteInput" class="empty-hint">{{ t('detail_no_messages') }}</div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.detail-page {
  max-width: 1000px;
  margin: 0 auto;
  padding: 40px 32px;
  min-height: 400px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.info-card { background: #fff; border: 1px solid var(--church-border, #e0d8cf); border-radius: 4px; padding: 24px; }

.card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; flex-wrap: wrap; gap: 12px; }
.card-header-left { display: flex; align-items: center; gap: 14px; }
.card-icon { width: 48px; height: 48px; border-radius: 4px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; background: rgba(90,138,110,0.1); color: #5a8a6e; }
.card-header-info { display: flex; flex-direction: column; }
.card-title { font-family: var(--font-heading); font-size: 20px; font-weight: 600; color: var(--church-charcoal, #3a3a3a); letter-spacing: 1px; margin: 0; line-height: 1.3; }
.card-subtitle { font-size: 13px; color: var(--church-warm-gray, #8a8178); margin-top: 4px; }

.card-header-actions { display: flex; align-items: center; gap: 8px; }
.action-pill { display: flex; align-items: center; gap: 4px; padding: 8px 18px; background: #fff; border: 1px solid var(--church-border, #e0d8cf); border-radius: 2px; font-size: 12px; color: var(--church-warm-gray, #8a8178); cursor: pointer; transition: all 0.3s; user-select: none; letter-spacing: 0.5px; }
.action-pill:hover { border-color: #5a8a6e; color: #5a8a6e; }
.action-pill-danger:hover { border-color: var(--app-danger, #c05050); color: var(--app-danger, #c05050); }

.stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; padding: 14px 0; border-top: 1px solid var(--church-border, #e0d8cf); border-bottom: 1px solid var(--church-border, #e0d8cf); }
.stats-item { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.stats-value { font-size: 16px; font-weight: 600; color: var(--church-charcoal, #3a3a3a); }
.stats-label { font-size: 10px; color: var(--church-warm-gray, #8a8178); letter-spacing: 1px; text-transform: uppercase; }
.stats-progress { display: flex; align-items: center; gap: 6px; width: 100%; max-width: 80px; }
.stats-progress :deep(.el-progress) { flex: 1; }
.stats-progress-text { font-size: 13px; font-weight: 700; color: #5a8a6e; white-space: nowrap; }
.info-desc { font-size: 13px; color: var(--app-text-secondary, #6b6560); line-height: 1.8; padding-top: 16px; }

.section-card { background: #fff; border: 1px solid var(--church-border, #e0d8cf); border-radius: 4px; padding: 24px; }
.section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
.section-title { font-family: var(--font-heading); font-size: 16px; font-weight: 600; color: var(--church-charcoal, #3a3a3a); letter-spacing: 2px; margin: 0; }
.section-count { font-size: 12px; color: var(--church-warm-gray, #8a8178); }

.testament-group { margin-top: 8px; }
.testament-group + .testament-group { margin-top: 24px; }
.testament-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 8px 6px; border-bottom: 2px solid #5a8a6e; margin-bottom: 4px; cursor: pointer; user-select: none; transition: background 0.2s; }
.testament-header:hover { background: rgba(90,138,110,0.04); }
.testament-header-left { display: flex; align-items: center; gap: 6px; }
.testament-arrow { color: #5a8a6e; font-size: 14px; transition: transform 0.3s; transform: rotate(-90deg); }
.testament-arrow.is-open { transform: rotate(0deg); }
.testament-title { font-family: var(--font-heading); font-size: 14px; font-weight: 600; color: #5a8a6e; letter-spacing: 2px; }
.testament-count { font-size: 11px; color: var(--church-warm-gray, #8a8178); }

.book-list { display: flex; flex-direction: column; }
.book-item { display: flex; align-items: center; gap: 14px; padding: 14px 8px; border-radius: 4px; cursor: pointer; transition: background 0.2s; }
.book-item:hover { background: var(--church-cream, #f5f0eb); }
.book-item + .book-item { border-top: 1px solid var(--church-border, #e0d8cf); }
.book-item-empty { opacity: 0.5; }
.book-item-empty:hover { opacity: 0.8; }
.book-index { width: 30px; height: 30px; border-radius: 4px; background: rgba(90,138,110,0.06); color: #5a8a6e; font-size: 12px; font-weight: 600; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.book-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.book-name { font-size: 14px; font-weight: 500; color: var(--church-charcoal, #3a3a3a); }
.book-meta { font-size: 12px; color: var(--church-warm-gray, #8a8178); }
.book-progress { display: flex; align-items: center; gap: 6px; width: 100px; }
.book-progress :deep(.el-progress) { flex: 1; }
.book-progress-text { font-size: 11px; color: var(--church-warm-gray, #8a8178); white-space: nowrap; min-width: 32px; text-align: right; }
.book-arrow { color: var(--app-text-tertiary, #9a948e); flex-shrink: 0; }

.note-input-area { margin-bottom: 12px; }
.note-input-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
.note-list { display: flex; flex-direction: column; }
.note-item { padding: 14px 0; border-bottom: 1px solid var(--church-border, #e0d8cf); }
.note-item:last-child { border-bottom: none; }
.note-content { font-size: 13px; color: var(--church-charcoal, #3a3a3a); line-height: 1.8; white-space: pre-wrap; word-break: break-word; }
.note-footer { display: flex; align-items: center; justify-content: space-between; margin-top: 8px; }
.note-time { font-size: 12px; color: var(--church-warm-gray, #8a8178); }
.note-delete { font-size: 12px; color: var(--app-text-tertiary, #9a948e); cursor: pointer; transition: color 0.2s; }
.note-delete:hover { color: var(--app-danger, #c05050); }
.empty-hint { text-align: center; color: var(--app-text-tertiary, #9a948e); padding: 40px 0; font-size: 14px; }

@media (max-width: 680px) { .stats-grid { grid-template-columns: repeat(2, 1fr); } }
</style>
