<script setup>
/**
 * 注释详情页
 * 显示注释资源的概览信息 + 段落/主题目录大纲
 * 注释模块采用段落/主题组织方式，非逐节模式
 */
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { getResourceDetail, deleteResource } from '@/api/resource'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Document, ArrowRight, Plus, Edit, Upload } from '@element-plus/icons-vue'
import { parseCommentaryText } from '@/utils/fileImport'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

/** 资源 ID */
const resourceId = route.params.id

/** 资源数据 */
const resource = ref(null)

/** 元数据 */
const meta = ref({})

/** 注释段落列表 [{title, content}] */
const sections = ref([])

/** 加载状态 */
const loading = ref(false)

/** 总段落数 */
const totalSections = computed(() => sections.value.length)

/** 总字数 */
const totalChars = computed(() => {
  return sections.value.reduce((sum, s) => sum + (s.content || '').length, 0)
})

/** 文档作者（从块类型中提取） */
const docAuthor = computed(() => {
  const authorBlock = sections.value.find(s => s.type === 'author')
  if (authorBlock) return authorBlock.title
  return meta.value.author || ''
})

/** 经文引用数量 */
const verseRefCount = computed(() => {
  return sections.value.filter(s => s.type === 'verse_ref').length
})

/**
 * 兼容旧数据格式
 * 旧格式 [{verse, content}] → 新格式 [{title, content}]
 */
function normalizeEntries(data) {
  if (!Array.isArray(data)) return []
  return data.map(item => {
    if (item.title !== undefined) return item
    /* 兼容旧 verse+content 格式 */
    return {
      title: item.verse || item.title || '',
      content: item.content || ''
    }
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
        sections.value = normalizeEntries(parsed)
      } else if (parsed && typeof parsed === 'object' && parsed.text) {
        /* 兼容旧格式 {"text":"...","format":"txt"} */
        sections.value = parseCommentaryText(parsed.text)
      } else {
        sections.value = []
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

/** 点击段落跳转到阅读页 */
function handleReadSection(index) {
  router.push(`/commentary/read/${resourceId}?section=${index}`)
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

        <!-- 作者信息 -->
        <div v-if="docAuthor" class="info-author">{{ t('block_type_author') }}: {{ docAuthor }}</div>

        <!-- 统计数据网格 -->
        <div class="stats-grid">
          <div class="stats-item">
            <span class="stats-value">{{ totalSections }}</span>
            <span class="stats-label">{{ t('commentary_stat_sections') }}</span>
          </div>
          <div class="stats-item">
            <span class="stats-value">{{ totalChars.toLocaleString() }}</span>
            <span class="stats-label">{{ t('commentary_stat_chars') }}</span>
          </div>
          <div v-if="verseRefCount > 0" class="stats-item">
            <span class="stats-value">{{ verseRefCount }}</span>
            <span class="stats-label">{{ t('commentary_stat_verse_refs') }}</span>
          </div>
        </div>

        <div v-if="meta.summary" class="info-desc">{{ meta.summary }}</div>
      </div>

      <!-- 段落目录 -->
      <div class="section-card">
        <div class="section-header">
          <h3 class="section-title">{{ t('commentary_section_directory') }}</h3>
          <span class="section-count">{{ totalSections }} {{ t('commentary_section_unit') }}</span>
        </div>

        <div v-if="sections.length > 0" class="section-list">
          <div
            v-for="(sec, idx) in sections"
            :key="idx"
            class="section-item"
            @click="handleReadSection(idx)"
          >
            <span class="section-index">{{ idx + 1 }}</span>
            <div class="section-info">
              <div class="section-name-row">
                <span v-if="sec.type && sec.type !== 'body'" class="section-type-badge" :class="'badge-' + sec.type">{{ getTypeLabel(sec.type) }}</span>
                <span class="section-name">{{ sec.title || t('commentary_untitled_section') }}</span>
              </div>
              <span class="section-preview">{{ (sec.content || '').slice(0, 60) }}{{ (sec.content || '').length > 60 ? '...' : '' }}</span>
            </div>
            <el-icon class="section-arrow"><ArrowRight /></el-icon>
          </div>
        </div>
        <div v-else class="empty-hint">{{ t('commentary_empty') }}</div>
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

.info-author { font-size: 13px; color: var(--church-warm-gray, #8a8178); padding: 8px 0 0; }

.stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 12px; padding: 14px 0; border-top: 1px solid var(--church-border, #e0d8cf); border-bottom: 1px solid var(--church-border, #e0d8cf); }
.stats-item { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.stats-value { font-size: 16px; font-weight: 600; color: var(--church-charcoal, #3a3a3a); }
.stats-label { font-size: 10px; color: var(--church-warm-gray, #8a8178); letter-spacing: 1px; text-transform: uppercase; }
.info-desc { font-size: 13px; color: var(--app-text-secondary, #6b6560); line-height: 1.8; padding-top: 16px; }

.section-card { background: #fff; border: 1px solid var(--church-border, #e0d8cf); border-radius: 4px; padding: 24px; }
.section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
.section-title { font-family: var(--font-heading); font-size: 16px; font-weight: 600; color: var(--church-charcoal, #3a3a3a); letter-spacing: 2px; margin: 0; }
.section-count { font-size: 12px; color: var(--church-warm-gray, #8a8178); }

.section-list { display: flex; flex-direction: column; }
.section-item { display: flex; align-items: center; gap: 14px; padding: 14px 8px; border-radius: 4px; cursor: pointer; transition: background 0.2s; }
.section-item:hover { background: var(--church-cream, #f5f0eb); }
.section-item + .section-item { border-top: 1px solid var(--church-border, #e0d8cf); }
.section-index { width: 30px; height: 30px; border-radius: 4px; background: rgba(90,138,110,0.06); color: #5a8a6e; font-size: 12px; font-weight: 600; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.section-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.section-name-row { display: flex; align-items: center; gap: 6px; }
.section-type-badge { font-size: 10px; padding: 1px 6px; border-radius: 3px; color: #fff; flex-shrink: 0; }
.badge-document_title { background: #5a8a6e; }
.badge-author { background: #8a8178; }
.badge-preface { background: #6b8da6; }
.badge-chapter_title { background: #7a6b8a; }
.badge-section_title { background: #8a7b6b; }
.badge-verse_ref { background: #8b6914; }
.section-name { font-size: 14px; font-weight: 500; color: var(--church-charcoal, #3a3a3a); }
.section-preview { font-size: 12px; color: var(--church-warm-gray, #8a8178); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.section-arrow { color: var(--app-text-tertiary, #9a948e); flex-shrink: 0; }

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
</style>
