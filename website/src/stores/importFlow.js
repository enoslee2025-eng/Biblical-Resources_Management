/**
 * 导入流程状态管理
 * 管理从文件导入 → AI解析 → 保存数据库的完整流程
 *
 * 数据结构：
 *   parsedData: {
 *     book: "创世记",
 *     chapters: [
 *       { chapter: 1, verses: [{ verse: 1, text: "..." }, ...] },
 *       { chapter: 2, verses: [...] }
 *     ]
 *   }
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useImportFlowStore = defineStore('importFlow', () => {
  /** 当前步骤：1=选择导入 2=AI解析预览 3=保存数据 */
  const step = ref(1)

  /** 导入方式：ocr / pdf / word */
  const importType = ref('')

  /** 原始提取的文本 */
  const rawText = ref('')

  /** 结构化解析结果 { book, chapters: [{ chapter, verses: [{verse, text}] }] } */
  const parsedData = ref({ book: '', chapters: [] })

  /** 导入的文件名 */
  const fileName = ref('')

  /** 是否有数据 */
  const hasData = computed(() => rawText.value.trim().length > 0)

  /** 是否已解析 */
  const hasParsed = computed(() => parsedData.value.chapters.length > 0)

  /** 总经文节数 */
  const totalVerseCount = computed(() => {
    let count = 0
    for (const ch of parsedData.value.chapters) {
      count += ch.verses.length
    }
    return count
  })

  /**
   * 设置原始文本（步骤1完成后调用）
   */
  function setRawText(text, type, file) {
    rawText.value = text
    importType.value = type
    fileName.value = file || ''
    step.value = 2
  }

  /**
   * 设置解析后的结构化数据（步骤2完成后调用）
   */
  function setParsedData(data) {
    parsedData.value = data
    step.value = 3
  }

  /**
   * 返回上一步
   */
  function goBack() {
    if (step.value > 1) step.value--
  }

  /**
   * 重置所有状态
   */
  function reset() {
    step.value = 1
    importType.value = ''
    rawText.value = ''
    parsedData.value = { book: '', chapters: [] }
    fileName.value = ''
  }

  return {
    step,
    importType,
    rawText,
    parsedData,
    fileName,
    hasData,
    hasParsed,
    totalVerseCount,
    setRawText,
    setParsedData,
    goBack,
    reset
  }
})
