<script setup>
/**
 * 词典详情页
 * 显示词典资源的概览信息 + 按字母/拼音浏览词条
 * 支持搜索和快速定位
 */
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { getResourceDetail, deleteResource } from '@/api/resource'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Notebook, ArrowRight, Plus, Edit, Search } from '@element-plus/icons-vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

/** 资源 ID */
const resourceId = route.params.id

/** 资源数据 */
const resource = ref(null)

/** 元数据 */
const meta = ref({})

/** 词条列表（原始） */
const entries = ref([])

/** 加载状态 */
const loading = ref(false)

/** 搜索关键字 */
const searchKeyword = ref('')

/** 当前选中的字母分组 */
const activeLetterIndex = ref('')

/**
 * 按首字母/首字分组的词条数据
 * 支持中文（取拼音首字母）和英文（取首字母大写）
 */
const letterGroups = computed(() => {
  const groups = {}
  entries.value.forEach(entry => {
    const word = (entry.word || entry.title || '').trim()
    if (!word) return
    const firstChar = word[0].toUpperCase()
    /* 英文字母直接分组 */
    const key = /[A-Z]/.test(firstChar) ? firstChar : firstChar
    if (!groups[key]) {
      groups[key] = { letter: key, words: [] }
    }
    groups[key].words.push(entry)
  })
  /* 按字母排序 */
  return Object.values(groups).sort((a, b) => a.letter.localeCompare(b.letter))
})

/** 筛选后的分组（搜索） */
const filteredGroups = computed(() => {
  if (!searchKeyword.value.trim()) return letterGroups.value
  const kw = searchKeyword.value.trim().toLowerCase()
  return letterGroups.value
    .map(g => ({
      ...g,
      words: g.words.filter(w =>
        (w.word || w.title || '').toLowerCase().includes(kw) ||
        (w.definition || w.content || '').toLowerCase().includes(kw)
      )
    }))
    .filter(g => g.words.length > 0)
})

/** 所有字母索引 */
const allLetters = computed(() => letterGroups.value.map(g => g.letter))

/** 总词条数 */
const totalEntries = computed(() => entries.value.length)

/** 分组数 */
const totalGroups = computed(() => letterGroups.value.length)

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
    console.error('加载词典详情失败:', e)
  } finally {
    loading.value = false
  }
}

/** 解析 JSON */
function tryParseJson(str) {
  try { return JSON.parse(str) } catch { return null }
}

/** 删除词典 */
async function handleDelete() {
  try {
    await ElMessageBox.confirm(t('dict_detail_delete_confirm'), t('detail_delete_title'), {
      type: 'warning',
      confirmButtonText: t('confirm'),
      cancelButtonText: t('cancel')
    })
    await deleteResource(resourceId)
    ElMessage.success(t('detail_delete_success'))
    router.push('/dictionary')
  } catch (e) {
    if (e !== 'cancel' && e !== 'close') {
      ElMessage.error(t('detail_delete_fail'))
    }
  }
}

/** 跳转到编辑页 */
function handleEdit() {
  router.push(`/dictionary/edit/${resourceId}`)
}

/** 滚动到指定字母分组 */
function scrollToLetter(letter) {
  activeLetterIndex.value = letter
  const el = document.getElementById(`letter-${letter}`)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

/** 截取释义摘要 */
function getDefinitionPreview(entry) {
  const def = entry.definition || entry.content || ''
  /* 去除 HTML 标签 */
  const plain = def.replace(/<[^>]+>/g, '')
  return plain.length > 100 ? plain.slice(0, 100) + '...' : plain
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
      <!-- 词典信息卡片 -->
      <div class="info-card">
        <div class="card-header">
          <div class="card-header-left">
            <div class="card-icon">
              <el-icon :size="22"><Notebook /></el-icon>
            </div>
            <div class="card-header-info">
              <h2 class="card-title">{{ resource.title }}</h2>
              <span class="card-subtitle">{{ meta.iso || '' }} · {{ t('type_dictionary') }}</span>
            </div>
          </div>
          <div class="card-header-actions">
            <div class="action-pill" @click="handleEdit">
              <el-icon :size="12"><Edit /></el-icon>
              {{ t('dict_detail_edit_entries') }}
            </div>
            <div class="action-pill action-pill-danger" @click="handleDelete">{{ t('delete') }}</div>
          </div>
        </div>

        <!-- 统计数据网格 -->
        <div class="stats-grid">
          <div class="stats-item">
            <span class="stats-value">{{ totalEntries }}</span>
            <span class="stats-label">{{ t('dict_detail_stat_entries') }}</span>
          </div>
          <div class="stats-item">
            <span class="stats-value">{{ totalGroups }}</span>
            <span class="stats-label">{{ t('dict_detail_stat_groups') }}</span>
          </div>
          <div class="stats-item">
            <span class="stats-value">{{ meta.iso || '-' }}</span>
            <span class="stats-label">{{ t('dict_detail_stat_language') }}</span>
          </div>
          <div class="stats-item">
            <span class="stats-value">{{ meta.abbr || '-' }}</span>
            <span class="stats-label">{{ t('dict_detail_stat_abbr') }}</span>
          </div>
        </div>

        <div v-if="meta.summary" class="info-desc">{{ meta.summary }}</div>
      </div>

      <!-- 词条目录 -->
      <div class="section-card">
        <div class="section-header">
          <h3 class="section-title">{{ t('dict_detail_word_directory') }}</h3>
          <span class="section-count">{{ totalEntries }} {{ t('dict_detail_word_unit') }}</span>
        </div>

        <!-- 搜索框 -->
        <div class="search-bar">
          <el-input
            v-model="searchKeyword"
            :placeholder="t('dict_detail_search_ph')"
            clearable
            size="default"
            :prefix-icon="Search"
            style="max-width: 320px;"
          />
        </div>

        <!-- 字母索引 -->
        <div v-if="allLetters.length > 0" class="letter-index">
          <span
            v-for="letter in allLetters"
            :key="letter"
            class="letter-tag"
            :class="{ 'letter-tag-active': activeLetterIndex === letter }"
            @click="scrollToLetter(letter)"
          >{{ letter }}</span>
        </div>

        <!-- 词条分组列表 -->
        <div v-if="filteredGroups.length > 0" class="word-groups">
          <div v-for="group in filteredGroups" :key="group.letter" :id="'letter-' + group.letter" class="word-group">
            <div class="group-header">
              <span class="group-letter">{{ group.letter }}</span>
              <span class="group-count">{{ group.words.length }} {{ t('dict_detail_word_unit') }}</span>
            </div>
            <div class="word-list">
              <div v-for="(word, idx) in group.words" :key="idx" class="word-item" @click="handleEdit">
                <div class="word-info">
                  <span class="word-name">{{ word.word || word.title }}</span>
                  <span class="word-def">{{ getDefinitionPreview(word) }}</span>
                </div>
                <el-icon class="word-arrow"><ArrowRight /></el-icon>
              </div>
            </div>
          </div>
        </div>

        <!-- 空状态 -->
        <div v-if="filteredGroups.length === 0 && !loading" class="empty-hint">
          {{ searchKeyword ? t('dict_detail_no_results') : t('dict_detail_empty') }}
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
.card-icon { width: 48px; height: 48px; border-radius: 4px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; background: rgba(184,145,74,0.1); color: #b8914a; }
.card-header-info { display: flex; flex-direction: column; }
.card-title { font-family: var(--font-heading); font-size: 20px; font-weight: 600; color: var(--church-charcoal, #3a3a3a); letter-spacing: 1px; margin: 0; line-height: 1.3; }
.card-subtitle { font-size: 13px; color: var(--church-warm-gray, #8a8178); margin-top: 4px; }

.card-header-actions { display: flex; align-items: center; gap: 8px; }
.action-pill { display: flex; align-items: center; gap: 4px; padding: 8px 18px; background: #fff; border: 1px solid var(--church-border, #e0d8cf); border-radius: 2px; font-size: 12px; color: var(--church-warm-gray, #8a8178); cursor: pointer; transition: all 0.3s; user-select: none; letter-spacing: 0.5px; }
.action-pill:hover { border-color: #b8914a; color: #b8914a; }
.action-pill-danger:hover { border-color: var(--app-danger, #c05050); color: var(--app-danger, #c05050); }

.stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; padding: 14px 0; border-top: 1px solid var(--church-border, #e0d8cf); border-bottom: 1px solid var(--church-border, #e0d8cf); }
.stats-item { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.stats-value { font-size: 16px; font-weight: 600; color: var(--church-charcoal, #3a3a3a); }
.stats-label { font-size: 10px; color: var(--church-warm-gray, #8a8178); letter-spacing: 1px; text-transform: uppercase; }
.info-desc { font-size: 13px; color: var(--app-text-secondary, #6b6560); line-height: 1.8; padding-top: 16px; }

.section-card { background: #fff; border: 1px solid var(--church-border, #e0d8cf); border-radius: 4px; padding: 24px; }
.section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
.section-title { font-family: var(--font-heading); font-size: 16px; font-weight: 600; color: var(--church-charcoal, #3a3a3a); letter-spacing: 2px; margin: 0; }
.section-count { font-size: 12px; color: var(--church-warm-gray, #8a8178); }

.search-bar { margin-bottom: 16px; }

.letter-index { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid var(--church-border, #e0d8cf); }
.letter-tag { width: 30px; height: 30px; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; color: #b8914a; background: rgba(184,145,74,0.06); cursor: pointer; transition: all 0.2s; user-select: none; }
.letter-tag:hover { background: rgba(184,145,74,0.15); }
.letter-tag-active { background: #b8914a; color: #fff; }

.word-groups { display: flex; flex-direction: column; gap: 16px; }

.group-header { display: flex; align-items: center; justify-content: space-between; padding: 8px 8px 6px; border-bottom: 2px solid #b8914a; margin-bottom: 4px; }
.group-letter { font-family: var(--font-heading); font-size: 16px; font-weight: 700; color: #b8914a; letter-spacing: 2px; }
.group-count { font-size: 11px; color: var(--church-warm-gray, #8a8178); }

.word-list { display: flex; flex-direction: column; }
.word-item { display: flex; align-items: center; gap: 14px; padding: 12px 8px; border-radius: 4px; cursor: pointer; transition: background 0.2s; }
.word-item:hover { background: var(--church-cream, #f5f0eb); }
.word-item + .word-item { border-top: 1px solid var(--church-border, #e0d8cf); }
.word-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.word-name { font-size: 14px; font-weight: 500; color: var(--church-charcoal, #3a3a3a); }
.word-def { font-size: 12px; color: var(--church-warm-gray, #8a8178); line-height: 1.5; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.word-arrow { color: var(--app-text-tertiary, #9a948e); flex-shrink: 0; }

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
