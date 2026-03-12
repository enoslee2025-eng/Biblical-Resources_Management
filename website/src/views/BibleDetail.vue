<script setup>
/**
 * 译本详情页
 * 显示译本基本信息 + 书卷目录列表
 * 风格与首页 DataCenter 保持一致
 */
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { getResourceDetail, deleteResource, updateResource } from '@/api/resource'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Reading, ArrowRight, ArrowDown, Plus } from '@element-plus/icons-vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

/** 资源 ID */
const resourceId = route.params.id

/** 资源数据 */
const resource = ref(null)

/** 元数据 */
const meta = ref({})

/** 书卷目录 */
const books = ref([])

/** 旧约书卷（前39卷） */
const oldTestamentBooks = computed(() => {
  return books.value.slice(0, 39).map((book, idx) => ({ book, idx }))
})

/** 新约书卷（第40-66卷） */
const newTestamentBooks = computed(() => {
  return books.value.slice(39).map((book, idx) => ({ book, idx: idx + 39 }))
})

/** 旧约/新约展开状态 */
const oldTestamentOpen = ref(true)
const newTestamentOpen = ref(false)

/** 加载状态 */
const loading = ref(false)

/** 加载资源详情 */
async function loadDetail() {
  loading.value = true
  try {
    const res = await getResourceDetail(resourceId)
    const detail = res.data
    resource.value = detail
    meta.value = tryParseJson(detail.metaJson) || {}
    const content = tryParseJson(detail.contentJson)
    if (content) {
      if (content.books) {
        books.value = content.books
      } else if (Array.isArray(content)) {
        books.value = content
      }
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

/** 删除译本 */
async function handleDelete() {
  try {
    await ElMessageBox.confirm(t('detail_delete_confirm'), t('detail_delete_title'), {
      type: 'warning',
      confirmButtonText: t('confirm'),
      cancelButtonText: t('cancel')
    })
    await deleteResource(resourceId)
    ElMessage.success(t('detail_delete_success'))
    router.push('/bible')
  } catch (e) {
    if (e !== 'cancel' && e !== 'close') {
      ElMessage.error(t('detail_delete_fail'))
    }
  }
}

/** 查看经文 */
function handleReadBook(book, bookIndex) {
  router.push(`/bible/read/${resourceId}?book=${bookIndex}`)
}

/** 获取书卷章数 */
function getChapterCount(book) {
  return book.chapters ? book.chapters.length : 0
}

/** 获取书卷已填写的章数 */
function getFilledChapterCount(book) {
  if (!book.chapters) return 0
  return book.chapters.filter(ch => ch.verses && ch.verses.length > 0).length
}

/** 获取书卷总经文数 */
function getVerseCount(book) {
  if (!book.chapters) return 0
  let count = 0
  book.chapters.forEach(ch => {
    if (ch.verses) count += ch.verses.length
  })
  return count
}

/** 获取所有章节总数 */
function getTotalChapters() {
  let total = 0
  books.value.forEach(b => {
    total += b.chapters ? b.chapters.length : 0
  })
  return total
}

/** 获取所有已填写的章节总数 */
function getTotalFilledChapters() {
  let total = 0
  books.value.forEach(b => {
    total += getFilledChapterCount(b)
  })
  return total
}

/** 获取书卷导入进度百分比 */
function getBookProgress(book) {
  const total = getChapterCount(book)
  if (total === 0) return 0
  return Math.round(getFilledChapterCount(book) / total * 100)
}

/** 获取总体导入进度百分比 */
function getTotalProgress() {
  const total = getTotalChapters()
  if (total === 0) return 0
  return Math.round(getTotalFilledChapters() / total * 100)
}

/** 获取总经文数 */
function getTotalVerses() {
  let total = 0
  books.value.forEach(b => {
    total += getVerseCount(b)
  })
  return total
}

/** 备注列表 */
const notes = computed(() => meta.value.notes || [])
const showNoteInput = ref(false)
const newNoteText = ref('')
const noteSaving = ref(false)

/** 保存 meta 到后端 */
async function saveMeta() {
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
      <!-- 译本信息卡片 -->
      <div class="info-card">
        <div class="card-header">
          <div class="card-header-left">
            <div class="card-icon">
              <el-icon :size="22"><Reading /></el-icon>
            </div>
            <div class="card-header-info">
              <h2 class="card-title">{{ resource.title }}</h2>
              <span class="card-subtitle">{{ meta.abbreviation || '' }} · {{ meta.language || '' }}</span>
            </div>
          </div>
          <div class="card-header-actions">
            <div class="action-pill" @click="router.push(`/bible/edit/${resourceId}`)">{{ t('edit') }}</div>
            <div class="action-pill action-pill-danger" @click="handleDelete">{{ t('delete') }}</div>
          </div>
        </div>

        <!-- 统计数据网格 -->
        <div class="stats-grid">
          <div class="stats-item">
            <span class="stats-value">{{ getTotalFilledChapters() }} / {{ getTotalChapters() }}</span>
            <span class="stats-label">{{ t('detail_filled_chapters') }}</span>
          </div>
          <div class="stats-item">
            <span class="stats-value">{{ getTotalVerses() }}</span>
            <span class="stats-label">{{ t('detail_verse_count') }}</span>
          </div>
          <div class="stats-item">
            <span class="stats-value">{{ getTotalChapters() }}</span>
            <span class="stats-label">{{ t('detail_chapter_count') }}</span>
          </div>
          <div class="stats-item">
            <div class="stats-progress">
              <el-progress :percentage="getTotalProgress()" :stroke-width="6" :show-text="false" color="#409eff" />
              <span class="stats-progress-text">{{ getTotalProgress() }}%</span>
            </div>
            <span class="stats-label">{{ t('detail_progress') }}</span>
          </div>
        </div>

        <div v-if="meta.description" class="info-desc">{{ meta.description }}</div>
      </div>

      <!-- 书卷目录 -->
      <div class="section-card">
        <div class="section-header">
          <h3 class="section-title">{{ t('detail_directory') }}</h3>
          <span class="section-count">{{ books.length }} {{ t('resource_book_unit') }}</span>
        </div>

        <!-- 旧约 -->
        <div v-if="oldTestamentBooks.length > 0" class="testament-group">
          <div class="testament-header" @click="oldTestamentOpen = !oldTestamentOpen">
            <div class="testament-header-left">
              <el-icon class="testament-arrow" :class="{ 'is-open': oldTestamentOpen }"><ArrowDown /></el-icon>
              <span class="testament-title">{{ t('detail_old_testament') }}</span>
            </div>
            <span class="testament-count">{{ oldTestamentBooks.length }} {{ t('resource_book_unit') }}</span>
          </div>
          <div v-show="oldTestamentOpen" class="book-list">
            <div v-for="item in oldTestamentBooks" :key="item.idx" class="book-item" @click="handleReadBook(item.book, item.idx)">
              <span class="book-index">{{ item.idx + 1 }}</span>
              <div class="book-info">
                <span class="book-name">{{ item.book.name || item.book.title || '' }}</span>
                <span class="book-meta">{{ item.book.abbr || item.book.abbreviation || '' }} · {{ getFilledChapterCount(item.book) }}/{{ getChapterCount(item.book) }} {{ t('detail_book_chapters_short') }} · {{ getVerseCount(item.book) }} {{ t('detail_book_verses_short') }}</span>
              </div>
              <div class="book-progress">
                <el-progress :percentage="getBookProgress(item.book)" :stroke-width="4" :show-text="false" :color="getBookProgress(item.book) === 100 ? '#67c23a' : '#409eff'" />
                <span class="book-progress-text">{{ getBookProgress(item.book) }}%</span>
              </div>
              <div class="book-actions">
                <span class="book-action-link" @click.stop="handleReadBook(item.book, item.idx)">{{ t('detail_view') }}</span>
                <span class="book-action-link" @click.stop="router.push(`/bible/edit/${resourceId}`)">{{ t('edit') }}</span>
              </div>
              <el-icon class="book-arrow"><ArrowRight /></el-icon>
            </div>
          </div>
        </div>

        <!-- 新约 -->
        <div v-if="newTestamentBooks.length > 0" class="testament-group">
          <div class="testament-header" @click="newTestamentOpen = !newTestamentOpen">
            <div class="testament-header-left">
              <el-icon class="testament-arrow" :class="{ 'is-open': newTestamentOpen }"><ArrowDown /></el-icon>
              <span class="testament-title">{{ t('detail_new_testament') }}</span>
            </div>
            <span class="testament-count">{{ newTestamentBooks.length }} {{ t('resource_book_unit') }}</span>
          </div>
          <div v-show="newTestamentOpen" class="book-list">
            <div v-for="item in newTestamentBooks" :key="item.idx" class="book-item" @click="handleReadBook(item.book, item.idx)">
              <span class="book-index">{{ item.idx + 1 }}</span>
              <div class="book-info">
                <span class="book-name">{{ item.book.name || item.book.title || '' }}</span>
                <span class="book-meta">{{ item.book.abbr || item.book.abbreviation || '' }} · {{ getFilledChapterCount(item.book) }}/{{ getChapterCount(item.book) }} {{ t('detail_book_chapters_short') }} · {{ getVerseCount(item.book) }} {{ t('detail_book_verses_short') }}</span>
              </div>
              <div class="book-progress">
                <el-progress :percentage="getBookProgress(item.book)" :stroke-width="4" :show-text="false" :color="getBookProgress(item.book) === 100 ? '#67c23a' : '#409eff'" />
                <span class="book-progress-text">{{ getBookProgress(item.book) }}%</span>
              </div>
              <div class="book-actions">
                <span class="book-action-link" @click.stop="handleReadBook(item.book, item.idx)">{{ t('detail_view') }}</span>
                <span class="book-action-link" @click.stop="router.push(`/bible/edit/${resourceId}`)">{{ t('edit') }}</span>
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
.card-icon { width: 48px; height: 48px; border-radius: 4px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; background: rgba(61,90,128,0.08); color: var(--church-navy, #3d5a80); }
.card-header-info { display: flex; flex-direction: column; }
.card-title { font-family: var(--font-heading); font-size: 20px; font-weight: 600; color: var(--church-charcoal, #3a3a3a); letter-spacing: 1px; margin: 0; line-height: 1.3; }
.card-subtitle { font-size: 13px; color: var(--church-warm-gray, #8a8178); margin-top: 4px; }

.card-header-actions { display: flex; align-items: center; gap: 8px; }
.action-pill { display: flex; align-items: center; gap: 4px; padding: 8px 18px; background: #fff; border: 1px solid var(--church-border, #e0d8cf); border-radius: 2px; font-size: 12px; color: var(--church-warm-gray, #8a8178); cursor: pointer; transition: all 0.3s; user-select: none; letter-spacing: 0.5px; }
.action-pill:hover { border-color: var(--church-navy, #3d5a80); color: var(--church-navy, #3d5a80); }
.action-pill-danger:hover { border-color: var(--app-danger, #c05050); color: var(--app-danger, #c05050); }

.stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; padding: 14px 0; border-top: 1px solid var(--church-border, #e0d8cf); border-bottom: 1px solid var(--church-border, #e0d8cf); }
.stats-item { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.stats-value { font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', 'Segoe UI', Roboto, sans-serif; font-size: 16px; font-weight: 600; color: var(--church-charcoal, #3a3a3a); }
.stats-label { font-size: 10px; color: var(--church-warm-gray, #8a8178); letter-spacing: 1px; text-transform: uppercase; }
.stats-progress { display: flex; align-items: center; gap: 6px; width: 100%; max-width: 80px; }
.stats-progress :deep(.el-progress) { flex: 1; }
.stats-progress-text { font-size: 13px; font-weight: 700; color: var(--church-navy, #3d5a80); white-space: nowrap; }
.info-desc { font-size: 13px; color: var(--app-text-secondary, #6b6560); line-height: 1.8; padding-top: 16px; }

.section-card { background: #fff; border: 1px solid var(--church-border, #e0d8cf); border-radius: 4px; padding: 24px; }
.section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
.section-title { font-family: var(--font-heading); font-size: 16px; font-weight: 600; color: var(--church-charcoal, #3a3a3a); letter-spacing: 2px; margin: 0; }
.section-count { font-size: 12px; color: var(--church-warm-gray, #8a8178); }

.testament-group { margin-top: 8px; }
.testament-group + .testament-group { margin-top: 24px; }
.testament-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 8px 6px; border-bottom: 2px solid var(--church-navy, #3d5a80); margin-bottom: 4px; cursor: pointer; user-select: none; transition: background 0.2s; }
.testament-header:hover { background: rgba(61,90,128,0.04); }
.testament-header-left { display: flex; align-items: center; gap: 6px; }
.testament-arrow { color: var(--church-navy, #3d5a80); font-size: 14px; transition: transform 0.3s; transform: rotate(-90deg); }
.testament-arrow.is-open { transform: rotate(0deg); }
.testament-title { font-family: var(--font-heading); font-size: 14px; font-weight: 600; color: var(--church-navy, #3d5a80); letter-spacing: 2px; }
.testament-count { font-size: 11px; color: var(--church-warm-gray, #8a8178); }

.book-list { display: flex; flex-direction: column; }
.book-item { display: flex; align-items: center; gap: 14px; padding: 14px 8px; border-radius: 4px; cursor: pointer; transition: background 0.2s; }
.book-item:hover { background: var(--church-cream, #f5f0eb); }
.book-item + .book-item { border-top: 1px solid var(--church-border, #e0d8cf); }
.book-index { width: 30px; height: 30px; border-radius: 4px; background: rgba(61,90,128,0.06); color: var(--church-navy, #3d5a80); font-size: 12px; font-weight: 600; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.book-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.book-name { font-size: 14px; font-weight: 500; color: var(--church-charcoal, #3a3a3a); }
.book-meta { font-size: 12px; color: var(--church-warm-gray, #8a8178); }
.book-progress { display: flex; align-items: center; gap: 6px; width: 100px; }
.book-progress :deep(.el-progress) { flex: 1; }
.book-progress-text { font-size: 11px; color: var(--church-warm-gray, #8a8178); white-space: nowrap; min-width: 32px; text-align: right; }
.book-actions { display: flex; gap: 12px; opacity: 0; transition: opacity 0.2s; }
.book-item:hover .book-actions { opacity: 1; }
.book-action-link { font-size: 12px; color: var(--church-navy, #3d5a80); cursor: pointer; white-space: nowrap; letter-spacing: 0.5px; }
.book-action-link:hover { color: var(--church-navy-dark, #2c4260); }
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
