/**
 * 文件导入工具
 * 支持 TXT、PDF、Word (.docx) 文件的文本提取
 * 支持单文件和文件夹批量导入
 */

import * as pdfjsLib from 'pdfjs-dist'
import mammoth from 'mammoth'

/* 初始化 PDF.js worker */
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

/** 支持的文件扩展名 */
const SUPPORTED_EXTENSIONS = ['.txt', '.pdf', '.docx', '.json']

/**
 * 判断文件是否为支持的类型
 * @param {File} file 文件对象
 * @returns {boolean}
 */
export function isSupportedFile(file) {
  const name = file.name.toLowerCase()
  return SUPPORTED_EXTENSIONS.some(ext => name.endsWith(ext))
}

/**
 * 获取文件扩展名
 * @param {File} file
 * @returns {string} 小写扩展名，如 '.txt'
 */
function getExtension(file) {
  const name = file.name.toLowerCase()
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot) : ''
}

/**
 * 检测文本是否包含乱码（用于判断编码是否正确）
 * 当出现大量连续的 "�"（U+FFFD 替换字符）时，认为编码不正确
 * @param {string} text
 * @returns {boolean} true 表示可能是乱码
 */
function hasGarbledText(text) {
  const replacementCount = (text.match(/\uFFFD/g) || []).length
  return replacementCount > text.length * 0.05
}

/**
 * 读取 TXT 文件内容（自动检测编码：先尝试 UTF-8，乱码则尝试 GBK）
 * @param {File} file
 * @returns {Promise<string>}
 */
function readTxtFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target.result
      /* 检测 UTF-8 读取是否有乱码 */
      if (hasGarbledText(text)) {
        /* 尝试用 GBK 编码重新读取 */
        const reader2 = new FileReader()
        reader2.onload = (e2) => resolve(e2.target.result)
        reader2.onerror = () => resolve(text) /* GBK 也失败则返回原始结果 */
        reader2.readAsText(file, 'GBK')
      } else {
        resolve(text)
      }
    }
    reader.onerror = () => reject(new Error('TXT_READ_ERROR'))
    reader.readAsText(file, 'UTF-8')
  })
}

/**
 * 读取 PDF 文件并提取文本（保留行结构）
 * 通过检测文本项的 Y 坐标变化来判断换行
 * @param {File} file
 * @returns {Promise<string>}
 */
async function readPdfFile(file) {
  try {
    const arrayBuffer = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
    const textParts = []

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()

      /* 按 Y 坐标分组，检测换行 */
      const lines = []
      let currentLine = ''
      let lastY = null

      for (const item of content.items) {
        const y = Math.round(item.transform[5]) /* 取 Y 坐标，四舍五入避免浮点误差 */
        if (lastY !== null && Math.abs(y - lastY) > 2) {
          /* Y 坐标变化超过阈值，认为换行 */
          lines.push(currentLine)
          currentLine = item.str
        } else {
          currentLine += item.str
        }
        lastY = y
      }
      if (currentLine) lines.push(currentLine)

      textParts.push(lines.join('\n'))
    }

    return textParts.join('\n')
  } catch (e) {
    throw new Error('PDF_READ_ERROR')
  }
}

/**
 * 读取 Word (.docx) 文件并提取文本
 * @param {File} file
 * @returns {Promise<string>}
 */
async function readDocxFile(file) {
  try {
    const arrayBuffer = await file.arrayBuffer()
    const result = await mammoth.extractRawText({ arrayBuffer })
    return result.value
  } catch (e) {
    throw new Error('DOCX_READ_ERROR')
  }
}

/**
 * 读取单个文件内容（自动识别类型）
 * @param {File} file 文件对象
 * @returns {Promise<{ text: string, fileName: string }>} 提取的文本和文件名
 * @throws {Error} 不支持的文件类型或读取失败
 */
export async function readFileContent(file) {
  const ext = getExtension(file)
  let text = ''

  switch (ext) {
    case '.txt':
      text = await readTxtFile(file)
      break
    case '.pdf':
      text = await readPdfFile(file)
      break
    case '.docx':
      text = await readDocxFile(file)
      break
    case '.json':
      text = await readTxtFile(file) /* JSON 按文本读取，后续由调用方解析 */
      break
    default:
      throw new Error('UNSUPPORTED_FORMAT')
  }

  return { text, fileName: file.name }
}

/**
 * 自然排序比较器（按文件名中的数字正确排序）
 * 例如：ch1.txt, ch2.txt, ch10.txt（而非 ch1, ch10, ch2）
 * @param {File} a
 * @param {File} b
 * @returns {number}
 */
function naturalSortCompare(a, b) {
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
}

/**
 * 批量读取多个文件（用于文件夹导入）
 * 自动按文件名自然排序，跳过不支持的文件
 * @param {FileList} fileList 文件列表
 * @param {Function} [onProgress] 进度回调 (current, total, fileName) => void
 * @returns {Promise<{ results: Array<{ text: string, fileName: string }>, errors: Array<{ fileName: string, error: string }> }>}
 */
export async function readMultipleFiles(fileList, onProgress) {
  const results = []
  const errors = []
  /* 过滤后按文件名自然排序，确保章节顺序正确 */
  const supported = Array.from(fileList)
    .filter(f => isSupportedFile(f))
    .sort(naturalSortCompare)
  const total = supported.length

  for (let i = 0; i < supported.length; i++) {
    const file = supported[i]
    if (onProgress) onProgress(i + 1, total, file.name)

    try {
      const result = await readFileContent(file)
      results.push(result)
    } catch (e) {
      errors.push({ fileName: file.name, error: e.message })
    }
  }

  return { results, errors }
}

/**
 * 合并多个文件的文本内容
 * 使用特殊分隔符避免与条目分隔（空行）冲突
 * @param {Array<{ text: string, fileName: string }>} results readMultipleFiles 的结果
 * @returns {string} 合并后的文本
 */
export function mergeTexts(results) {
  return results.map(r => r.text.trim()).filter(t => t).join('\n\n---\n\n')
}

/**
 * 圣经书卷名称映射表（名称 → 书卷索引 0-65）
 * 包含中文全称、简称，英文全称、缩写等常见形式
 */
const BOOK_NAME_MAP = {
  /* 旧约 */
  '创世记': 0, '创世纪': 0, '创': 0,
  '出埃及记': 1, '出': 1,
  '利未记': 2, '利': 2,
  '民数记': 3, '民': 3,
  '申命记': 4, '申': 4,
  '约书亚记': 5, '书': 5,
  '士师记': 6, '士': 6,
  '路得记': 7, '得': 7,
  '撒母耳记上': 8, '撒上': 8,
  '撒母耳记下': 9, '撒下': 9,
  '列王纪上': 10, '王上': 10,
  '列王纪下': 11, '王下': 11,
  '历代志上': 12, '代上': 12,
  '历代志下': 13, '代下': 13,
  '以斯拉记': 14, '拉': 14,
  '尼希米记': 15, '尼': 15,
  '以斯帖记': 16, '斯': 16,
  '约伯记': 17, '伯': 17,
  '诗篇': 18, '诗': 18,
  '箴言': 19, '箴': 19,
  '传道书': 20, '传': 20,
  '雅歌': 21, '歌': 21,
  '以赛亚书': 22, '赛': 22,
  '耶利米书': 23, '耶': 23,
  '耶利米哀歌': 24, '哀': 24,
  '以西结书': 25, '结': 25,
  '但以理书': 26, '但': 26,
  '何西阿书': 27, '何': 27,
  '约珥书': 28, '珥': 28,
  '阿摩司书': 29, '摩': 29,
  '俄巴底亚书': 30, '俄': 30,
  '约拿书': 31, '拿': 31,
  '弥迦书': 32, '弥': 32,
  '那鸿书': 33, '鸿': 33,
  '哈巴谷书': 34, '哈': 34,
  '西番雅书': 35, '番': 35,
  '哈该书': 36, '该': 36,
  '撒迦利亚书': 37, '亚': 37,
  '玛拉基书': 38, '玛': 38,
  /* 新约 */
  '马太福音': 39, '太': 39,
  '马可福音': 40, '可': 40,
  '路加福音': 41, '路': 41,
  '约翰福音': 42, '约': 42,
  '使徒行传': 43, '徒': 43,
  '罗马书': 44, '罗': 44,
  '哥林多前书': 45, '林前': 45,
  '哥林多后书': 46, '林后': 46,
  '加拉太书': 47, '加': 47,
  '以弗所书': 48, '弗': 48,
  '腓立比书': 49, '腓': 49,
  '歌罗西书': 50, '西': 50,
  '帖撒罗尼迦前书': 51, '帖前': 51,
  '帖撒罗尼迦后书': 52, '帖后': 52,
  '提摩太前书': 53, '提前': 53,
  '提摩太后书': 54, '提后': 54,
  '提多书': 55, '多': 55,
  '腓利门书': 56, '门': 56,
  '希伯来书': 57, '来': 57,
  '雅各书': 58, '雅': 58,
  '彼得前书': 59, '彼前': 59,
  '彼得后书': 60, '彼后': 60,
  '约翰一书': 61, '约壹': 61,
  '约翰二书': 62, '约贰': 62,
  '约翰三书': 63, '约叁': 63,
  '犹大书': 64, '犹': 64,
  '启示录': 65, '启': 65,
  /* English */
  'genesis': 0, 'gen': 0, 'exodus': 1, 'exo': 1, 'ex': 1,
  'leviticus': 2, 'lev': 2, 'numbers': 3, 'num': 3,
  'deuteronomy': 4, 'deu': 4, 'deut': 4,
  'joshua': 5, 'jos': 5, 'judges': 6, 'jdg': 6,
  'ruth': 7, 'rut': 7,
  '1samuel': 8, '1sam': 8, '2samuel': 9, '2sam': 9,
  '1kings': 10, '1ki': 10, '2kings': 11, '2ki': 11,
  '1chronicles': 12, '1chr': 12, '2chronicles': 13, '2chr': 13,
  'ezra': 14, 'ezr': 14, 'nehemiah': 15, 'neh': 15,
  'esther': 16, 'est': 16, 'job': 17,
  'psalms': 18, 'psalm': 18, 'psa': 18, 'ps': 18,
  'proverbs': 19, 'pro': 19, 'prov': 19,
  'ecclesiastes': 20, 'ecc': 20, 'songofsolomon': 21, 'song': 21,
  'isaiah': 22, 'isa': 22, 'jeremiah': 23, 'jer': 23,
  'lamentations': 24, 'lam': 24, 'ezekiel': 25, 'eze': 25,
  'daniel': 26, 'dan': 26, 'hosea': 27, 'hos': 27,
  'joel': 28, 'amos': 29, 'obadiah': 30, 'oba': 30,
  'jonah': 31, 'micah': 32, 'mic': 32,
  'nahum': 33, 'nah': 33, 'habakkuk': 34, 'hab': 34,
  'zephaniah': 35, 'zep': 35, 'haggai': 36, 'hag': 36,
  'zechariah': 37, 'zec': 37, 'malachi': 38, 'mal': 38,
  'matthew': 39, 'mat': 39, 'matt': 39, 'mark': 40, 'mk': 40,
  'luke': 41, 'luk': 41, 'john': 42, 'jn': 42,
  'acts': 43, 'act': 43, 'romans': 44, 'rom': 44,
  '1corinthians': 45, '1cor': 45, '2corinthians': 46, '2cor': 46,
  'galatians': 47, 'gal': 47, 'ephesians': 48, 'eph': 48,
  'philippians': 49, 'phil': 49, 'php': 49,
  'colossians': 50, 'col': 50,
  '1thessalonians': 51, '1thess': 51, '2thessalonians': 52, '2thess': 52,
  '1timothy': 53, '1tim': 53, '2timothy': 54, '2tim': 54,
  'titus': 55, 'tit': 55, 'philemon': 56, 'phm': 56,
  'hebrews': 57, 'heb': 57, 'james': 58, 'jas': 58,
  '1peter': 59, '1pet': 59, '2peter': 60, '2pet': 60,
  '1john': 61, '1jn': 61, '2john': 62, '2jn': 62,
  '3john': 63, '3jn': 63, 'jude': 64, 'revelation': 65, 'rev': 65
}

/**
 * 智能将一段文本按章节分割
 * 检测策略（按优先级）：
 *   1. 章:节 格式 — 如 "1:1 起初…", "2:1 耶和华…"
 *   2. 中文章节标题 — 如 "第一章"、"第 1 章"、"第1章"
 *   3. 英文章节标题 — 如 "Chapter 1"、"CHAPTER 1"
 *   4. 整段文本作为一章（兜底）
 * @param {string} text 整卷书的原始文本
 * @returns {string[]} 按章分割后的文本数组（每个元素是一章的经文）
 */
export function splitIntoChapters(text) {
  if (!text || !text.trim()) return []

  /* ===== 策略0：按 --- 分隔符分割（文件夹导入合并后的多章文本） ===== */
  const dashParts = text.split(/\n\s*---\s*\n/).filter(c => c.trim())
  if (dashParts.length > 1) return dashParts

  const lines = text.split('\n')

  /* ===== 策略1：检测 "章:节" 格式（如 1:1, 2:1, 1:1起初） ===== */
  /* 用 \s* 替代 \s，兼容无空格格式如 "1:1起初" */
  const cvPattern = /^\s*(\d{1,3})\s*[:：]\s*(\d{1,3})\s*/
  const cvLines = lines.filter(l => cvPattern.test(l) && l.trim().length > l.trim().match(cvPattern)?.[0]?.trim().length)
  if (cvLines.length >= 3) {
    /* 有足够多的 章:节 格式行，按章号分组 */
    const chapters = {}
    let currentChapter = null
    const chapterOrder = []
    for (const line of lines) {
      const m = line.match(cvPattern)
      if (m && line.trim().length > m[0].trim().length) {
        const chNum = parseInt(m[1])
        if (currentChapter !== chNum) {
          currentChapter = chNum
          if (!chapters[chNum]) {
            chapters[chNum] = []
            chapterOrder.push(chNum)
          }
        }
        /* 去掉章:节前缀，只保留经文文本 */
        const verseText = line.replace(cvPattern, '').trim()
        if (verseText) chapters[chNum].push(verseText)
      } else if (currentChapter !== null && line.trim()) {
        /* 非经文格式的非空行归入当前章（跳过首个经文前的书名等） */
        chapters[currentChapter].push(line.trim())
      }
    }
    if (chapterOrder.length > 0) {
      return chapterOrder.map(ch => chapters[ch].join('\n'))
    }
  }

  /* ===== 策略2：检测中文章节标题 ===== */
  const zhChapterPattern = /^\s*第\s*[\d一二三四五六七八九十百零〇]+\s*章/
  const zhMatches = lines.filter(l => zhChapterPattern.test(l))
  if (zhMatches.length >= 2) {
    const chapters = []
    let currentLines = []
    let seenFirstHeader = false
    for (const line of lines) {
      if (zhChapterPattern.test(line)) {
        /* 仅在已过首个标题后才收集，避免书名/简介被误当第0章 */
        if (seenFirstHeader && currentLines.length > 0) {
          chapters.push(currentLines.join('\n'))
        }
        seenFirstHeader = true
        currentLines = [] /* 标题行本身不放入经文 */
      } else if (seenFirstHeader && line.trim()) {
        currentLines.push(line)
      }
    }
    if (currentLines.length > 0) chapters.push(currentLines.join('\n'))
    if (chapters.length > 0) return chapters
  }

  /* ===== 策略3：检测英文章节标题 ===== */
  const enChapterPattern = /^\s*(?:chapter|psalm|ch\.?)\s+\d+/i
  const enMatches = lines.filter(l => enChapterPattern.test(l))
  if (enMatches.length >= 2) {
    const chapters = []
    let currentLines = []
    let seenFirstHeader = false
    for (const line of lines) {
      if (enChapterPattern.test(line)) {
        if (seenFirstHeader && currentLines.length > 0) {
          chapters.push(currentLines.join('\n'))
        }
        seenFirstHeader = true
        currentLines = []
      } else if (seenFirstHeader && line.trim()) {
        currentLines.push(line)
      }
    }
    if (currentLines.length > 0) chapters.push(currentLines.join('\n'))
    if (chapters.length > 0) return chapters
  }

  /* ===== 策略4：经文编号重启检测 ===== */
  /* 适用格式：行首数字（如 "1 起初…"）或独立行数字（如 "1\n起初…"），章节间编号从 1 重新开始 */
  const vnRegex = /^\s*(\d{1,3})(?:\s*$|(?=[^\d:：]))/
  const nonEmpty = lines.filter(l => l.trim())
  const vnLines = nonEmpty.filter(l => vnRegex.test(l))
  if (vnLines.length > nonEmpty.length * 0.25) {
    const chapters = []
    let currentLines = []
    let lastVerseNum = 0
    let seenFirst = false

    for (const line of lines) {
      const m = line.match(vnRegex)
      if (m) {
        const num = parseInt(m[1])
        if (!seenFirst) {
          /* 跳过第一个经文编号前的书名/简介等内容 */
          seenFirst = true
        } else if (num === 1 && lastVerseNum > 1 && currentLines.length > 0) {
          /* 经文编号从大数字回到 1，说明新章节开始 */
          /* 检查末尾是否混入了下一章的章编号和标题（如 "2\n制定安息日"） */
          const trailingHeading = _extractTrailingChapterMark(currentLines)
          chapters.push(currentLines.join('\n'))
          currentLines = []
          /* 把提取出的标题放到下一章开头 */
          if (trailingHeading) currentLines.push(trailingHeading)
        }
        currentLines.push(line.trimEnd())
        lastVerseNum = num
      } else if (seenFirst && line.trim()) {
        /* 非编号行（续行或注释），归入当前章 */
        currentLines.push(line.trimEnd())
      }
    }
    if (currentLines.length > 0) chapters.push(currentLines.join('\n'))
    /* 只有检测到多章时才使用此策略，单章则继续兜底 */
    if (chapters.length > 1) return chapters
  }

  /* ===== 策略5（兜底）：整段文本作为一章 ===== */
  return [text.trim()]
}

/**
 * 从文件名中智能匹配圣经书卷索引
 * 支持中文全称/简称、英文全称/缩写、数字编号等
 * @param {string} fileName 文件名（可含路径和扩展名）
 * @returns {number} 书卷索引（0-65），未匹配返回 -1
 */
export function matchBookFromFileName(fileName) {
  /* 去除路径和扩展名 */
  const baseName = fileName.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '')
  /* 去除常见数字前缀（如 01_创世记、01-Genesis） */
  const cleaned = baseName.replace(/^\d+[\s_\-\.]*/, '').trim()
  const lower = cleaned.toLowerCase().replace(/[\s_\-\.]/g, '')

  /* 精确匹配 */
  if (BOOK_NAME_MAP[cleaned] !== undefined) return BOOK_NAME_MAP[cleaned]
  if (BOOK_NAME_MAP[lower] !== undefined) return BOOK_NAME_MAP[lower]

  /* 前缀匹配（如 "创世记 第1章.txt"） */
  for (const [name, index] of Object.entries(BOOK_NAME_MAP)) {
    if (name.length >= 2 && (cleaned.startsWith(name) || lower.startsWith(name))) {
      return index
    }
  }

  /* 纯数字或数字前缀（01.txt → 第1卷） */
  const numMatch = baseName.match(/^(\d{1,2})(?:[\s_\-\.]|$)/)
  if (numMatch) {
    const num = parseInt(numMatch[1]) - 1
    if (num >= 0 && num < 66) return num
  }

  return -1
}

/**
 * 66 卷书的中文名（与 BibleEditor 中 bibleBooks 一致）
 * 用于 detectBookFromContent 返回书名
 */
const BIBLE_BOOK_NAMES_INTERNAL = [
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

/**
 * 从经文内容中智能识别属于哪卷书
 * 分析文本的前 10 行，通过多种策略检测书卷名称
 *
 * 识别策略（按优先级）：
 * 1. 中文书卷全称匹配（如"马太福音"、"创世记"）
 * 2. 英文书名匹配（如 "Matthew"、"Genesis"、"The Gospel of Matthew"）
 * 3. 经文引用格式（如 "太1:1"、"Matt 1:1"）
 * 4. 章节标题中的书名（如 "马太福音 第一章"、"Matthew Chapter 1"）
 *
 * @param {string} text 待分析的经文文本
 * @returns {{ bookIndex: number, bookName: string } | null} 识别到的书卷，或 null
 */
export function detectBookFromContent(text) {
  if (!text || !text.trim()) return null

  /* 取前 10 行非空行用于分析 */
  const lines = text.split('\n').filter(l => l.trim()).slice(0, 10)
  if (lines.length === 0) return null

  /* 将 BOOK_NAME_MAP 按 key 长度降序排列，优先匹配长名（避免 "创" 提前匹配到 "创世记" 的内容） */
  const sortedEntries = Object.entries(BOOK_NAME_MAP)
    .sort((a, b) => b[0].length - a[0].length)

  /**
   * 策略 1：在前几行中查找中文书卷全称（≥2 个字的名称）
   * 优先匹配长名称，避免单字误匹配
   */
  for (const line of lines) {
    for (const [name, index] of sortedEntries) {
      /* 只匹配 ≥2 字符的中文名称，单字缩写容易误匹配普通文本 */
      if (name.length >= 2 && /[\u4e00-\u9fff]/.test(name) && line.includes(name)) {
        return { bookIndex: index, bookName: BIBLE_BOOK_NAMES_INTERNAL[index] }
      }
    }
  }

  /**
   * 策略 2：英文书名匹配
   * 支持 "The Book/Gospel/Epistle/Letter of X" 和 直接书名
   */
  const enBookPattern = /\b(?:the\s+(?:book|gospel|epistle|letter|first|second|third)\s+of\s+)?([a-z][a-z]+)\b/gi
  for (const line of lines) {
    let m
    while ((m = enBookPattern.exec(line)) !== null) {
      const word = m[1].toLowerCase()
      if (BOOK_NAME_MAP[word] !== undefined) {
        const idx = BOOK_NAME_MAP[word]
        return { bookIndex: idx, bookName: BIBLE_BOOK_NAMES_INTERNAL[idx] }
      }
    }
    /* 处理带数字前缀的书名如 "1 Corinthians"、"2 Kings" */
    const numBookPattern = /\b([123])\s*([a-z][a-z]+)\b/gi
    let nm
    while ((nm = numBookPattern.exec(line)) !== null) {
      const combined = (nm[1] + nm[2]).toLowerCase()
      if (BOOK_NAME_MAP[combined] !== undefined) {
        const idx = BOOK_NAME_MAP[combined]
        return { bookIndex: idx, bookName: BIBLE_BOOK_NAMES_INTERNAL[idx] }
      }
    }
  }

  /**
   * 策略 3：经文引用格式（"太1:1"、"Matt 1:1" 等）
   * 取前 5 行检测 "缩写+章:节" 模式
   */
  const refPattern = /^\s*([a-zA-Z\u4e00-\u9fff]+)\s*(\d{1,3})\s*[:：]/
  for (const line of lines.slice(0, 5)) {
    const rm = line.match(refPattern)
    if (rm) {
      const prefix = rm[1].trim().toLowerCase()
      if (BOOK_NAME_MAP[prefix] !== undefined) {
        const idx = BOOK_NAME_MAP[prefix]
        return { bookIndex: idx, bookName: BIBLE_BOOK_NAMES_INTERNAL[idx] }
      }
      /* 也尝试原始大小写（中文名） */
      const origPrefix = rm[1].trim()
      if (BOOK_NAME_MAP[origPrefix] !== undefined) {
        const idx = BOOK_NAME_MAP[origPrefix]
        return { bookIndex: idx, bookName: BIBLE_BOOK_NAMES_INTERNAL[idx] }
      }
    }
  }

  return null
}

/**
 * 66 卷书标准章数（与 BibleEditor 保持一致）
 */
export const BIBLE_BOOK_NAMES = BIBLE_BOOK_NAMES_INTERNAL

export const BOOK_CHAPTER_COUNTS = [
  50,40,27,36,34,24,21,4,31,24,22,25,29,36,10,
  13,10,42,150,31,12,8,66,52,5,48,12,14,3,9,
  1,4,7,3,3,3,2,14,4,
  28,16,24,21,28,16,16,13,6,6,4,4,5,3,6,4,3,1,13,5,5,3,5,1,1,1,22
]

/**
 * 圣经66卷书每章的经文节数（标准和合本）
 * BIBLE_VERSE_COUNTS[bookIndex][chapterIndex] = 该章的经文节数
 * 用于智能导入时按标准结构精准分割章节
 */
export const BIBLE_VERSE_COUNTS = [
  /* 创世记 */[31,25,24,26,32,22,24,22,29,32,32,20,18,24,21,16,27,33,38,18,34,24,20,67,34,35,46,22,35,43,55,32,20,31,29,43,36,30,23,23,57,38,34,34,28,34,31,22,33,26],
  /* 出埃及记 */[22,25,22,31,23,30,25,32,35,29,10,51,22,31,27,36,16,27,25,26,36,31,33,18,40,37,21,43,46,38,18,35,23,35,35,38,29,31,43,38],
  /* 利未记 */[17,16,17,35,19,30,38,36,24,20,47,8,59,57,33,34,16,30,37,27,24,33,44,23,55,46,34],
  /* 民数记 */[54,34,51,49,31,27,89,26,23,36,35,16,33,45,41,50,13,32,22,29,35,41,30,25,18,65,23,31,40,16,54,42,56,29,34,13],
  /* 申命记 */[46,37,29,49,33,25,26,20,29,22,32,32,18,29,23,22,20,22,21,20,23,30,25,22,19,19,26,68,29,20,30,52,29,12],
  /* 约书亚记 */[18,24,17,24,15,27,26,35,27,43,23,24,33,15,63,10,18,28,51,9,45,34,16,33],
  /* 士师记 */[36,23,31,24,31,40,25,35,57,18,40,15,25,20,20,31,13,31,30,48,25],
  /* 路得记 */[22,23,18,22],
  /* 撒母耳记上 */[28,36,21,22,12,21,17,22,27,27,15,25,23,52,35,23,58,30,24,43,15,23,28,23,44,25,12,25,11,31,13],
  /* 撒母耳记下 */[27,32,39,12,25,23,29,18,13,19,27,31,39,33,37,23,29,33,43,26,22,51,39,25],
  /* 列王纪上 */[53,46,28,34,18,38,51,66,28,29,43,33,34,31,34,34,24,46,21,43,29,53],
  /* 列王纪下 */[18,25,27,44,27,33,20,29,37,36,21,21,25,29,38,20,41,37,37,21,26,20,37,20,30],
  /* 历代志上 */[54,55,24,43,26,81,40,40,44,14,47,40,14,17,29,43,27,17,19,8,30,19,32,31,31,32,34,21,30],
  /* 历代志下 */[17,18,17,22,14,42,22,18,31,19,23,16,22,15,19,14,19,34,11,37,20,12,21,27,28,23,9,27,36,27,21,33,25,33,27,23],
  /* 以斯拉记 */[11,70,13,24,17,22,28,36,15,44],
  /* 尼希米记 */[11,20,32,23,19,19,73,18,38,39,36,47,31],
  /* 以斯帖记 */[22,23,15,17,14,14,10,17,32,3],
  /* 约伯记 */[22,13,26,21,27,30,21,22,35,22,20,25,28,22,35,22,16,21,29,29,34,30,17,25,6,14,23,28,25,31,40,22,33,37,16,33,24,41,30,24,34,17],
  /* 诗篇 */[6,12,8,8,12,10,17,9,20,18,7,8,6,7,5,11,15,50,14,9,13,31,6,10,22,12,14,9,11,12,24,11,22,22,28,12,40,22,13,17,13,11,5,26,17,11,9,14,20,23,19,9,6,7,23,13,11,11,17,12,8,12,11,10,13,20,7,35,36,5,24,20,28,23,10,12,20,72,13,19,16,8,18,12,13,17,7,18,52,17,16,15,5,23,11,13,12,9,9,5,8,28,22,35,45,48,43,13,31,7,10,10,9,8,18,19,2,29,176,7,8,9,4,8,5,6,5,6,8,8,3,18,3,3,21,26,9,8,24,13,10,7,12,15,21,10,20,14,9,6],
  /* 箴言 */[33,22,35,27,23,35,27,36,18,32,31,28,25,35,33,33,28,24,29,30,31,29,35,34,28,28,27,28,27,33,31],
  /* 传道书 */[18,26,22,16,20,12,29,17,18,20,10,14],
  /* 雅歌 */[17,17,11,16,16,13,13,14],
  /* 以赛亚书 */[31,22,26,6,30,13,25,22,21,34,16,6,22,32,9,14,14,7,25,6,17,25,18,23,12,21,13,29,24,33,9,20,24,17,10,22,38,22,8,31,29,25,28,28,25,13,15,22,26,11,23,15,12,17,13,12,21,14,21,22,11,12,19,12,25,24],
  /* 耶利米书 */[19,37,25,31,31,30,34,22,26,25,23,17,27,22,21,21,27,23,15,18,14,30,40,10,38,24,22,17,32,24,40,44,26,22,19,32,21,28,18,16,18,22,13,30,5,28,7,47,39,46,64,34],
  /* 耶利米哀歌 */[22,22,66,22,22],
  /* 以西结书 */[28,10,27,17,17,14,27,18,11,22,25,28,23,23,8,63,24,32,14,49,32,31,49,27,17,21,36,26,21,26,18,32,33,31,15,38,28,23,29,49,26,20,27,31,25,24,23,35],
  /* 但以理书 */[21,49,30,37,31,28,28,27,27,21,45,13],
  /* 何西阿书 */[11,23,5,19,15,11,16,14,17,15,12,14,16,9],
  /* 约珥书 */[20,32,21],
  /* 阿摩司书 */[15,16,15,13,27,14,17,14,15],
  /* 俄巴底亚书 */[21],
  /* 约拿书 */[17,10,10,11],
  /* 弥迦书 */[16,13,12,13,15,16,20],
  /* 那鸿书 */[15,13,19],
  /* 哈巴谷书 */[17,20,19],
  /* 西番雅书 */[18,15,20],
  /* 哈该书 */[15,23],
  /* 撒迦利亚书 */[21,13,10,14,11,15,14,23,17,12,17,14,9,21],
  /* 玛拉基书 */[14,17,18,6],
  /* 马太福音 */[25,23,17,25,48,34,29,34,38,42,30,50,58,36,39,28,27,35,30,34,46,46,39,51,46,75,66,20],
  /* 马可福音 */[45,28,35,41,43,56,37,38,50,52,33,44,37,72,47,20],
  /* 路加福音 */[80,52,38,44,39,49,50,56,62,42,54,59,35,35,32,31,37,43,48,47,38,71,56,53],
  /* 约翰福音 */[51,25,36,54,47,71,53,59,41,42,57,50,38,31,27,33,26,40,42,31,25],
  /* 使徒行传 */[26,47,26,37,42,15,60,40,43,48,30,25,52,28,41,40,34,28,41,38,40,30,35,27,27,32,44,31],
  /* 罗马书 */[32,29,31,25,21,23,25,39,33,21,36,21,14,23,33,27],
  /* 哥林多前书 */[31,16,23,21,13,20,40,13,27,33,34,31,13,40,58,24],
  /* 哥林多后书 */[24,17,18,18,21,18,16,24,15,18,33,21,14],
  /* 加拉太书 */[24,21,29,31,26,18],
  /* 以弗所书 */[23,22,21,32,33,24],
  /* 腓立比书 */[30,30,21,23],
  /* 歌罗西书 */[29,23,25,18],
  /* 帖撒罗尼迦前书 */[10,20,13,18,28],
  /* 帖撒罗尼迦后书 */[12,17,18],
  /* 提摩太前书 */[20,15,16,16,25,21],
  /* 提摩太后书 */[18,26,17,22],
  /* 提多书 */[16,15,15],
  /* 腓利门书 */[25],
  /* 希伯来书 */[14,18,19,16,14,20,28,13,28,39,40,29,25],
  /* 雅各书 */[27,26,18,17,20],
  /* 彼得前书 */[25,25,22,19,14],
  /* 彼得后书 */[21,22,18],
  /* 约翰一书 */[10,29,24,21,21],
  /* 约翰二书 */[13],
  /* 约翰三书 */[14],
  /* 犹大书 */[25],
  /* 启示录 */[20,29,22,11,14,17,17,13,21,11,19,17,18,20,8,21,18,24,21,15,27,21]
]

/**
 * 智能分割整卷书经文 — 根据圣经标准章节结构精准分割
 *
 * 核心逻辑：
 *   1. 先尝试常规章节分割（章标题、编号重启等）
 *   2. 如果分出的章数与标准章数匹配 → 直接用，对每章做经文解析
 *   3. 如果分章失败（如全部经文在一章内） → 提取所有经文，按标准每章节数分配
 *   4. 如果检测到 "章:节" 格式 → 按章号分组
 *
 * @param {string} text 整卷书的原始文本
 * @param {number} bookIndex 书卷索引（0-65）
 * @returns {Array<Array<{verse:number, text:string}>>} 每章的经文数组
 */
export function smartSplitBookChapters(text, bookIndex) {
  if (bookIndex < 0 || bookIndex >= 66 || !text || !text.trim()) return null

  const expectedChapters = BOOK_CHAPTER_COUNTS[bookIndex]
  const verseCounts = BIBLE_VERSE_COUNTS[bookIndex]
  const totalExpectedVerses = verseCounts.reduce((a, b) => a + b, 0)

  /* ===== 策略A：检测 章:节 格式（如 1:1, 2:1） ===== */
  const cvResult = _tryParseChapterVerseFormat(text, verseCounts)
  if (cvResult) return cvResult

  /* ===== 策略B：常规章节分割 ===== */
  const chapterTexts = splitIntoChapters(text)

  /* 如果分出的章数与标准章数接近（±20%），直接使用 */
  if (chapterTexts.length >= expectedChapters * 0.8 &&
      chapterTexts.length <= expectedChapters * 1.2) {
    const result = []
    for (let i = 0; i < Math.min(chapterTexts.length, expectedChapters); i++) {
      result.push(splitTextToVerses(chapterTexts[i]))
    }
    /* 不足的章留空 */
    while (result.length < expectedChapters) {
      result.push([])
    }
    return result
  }

  /* ===== 策略C：分章失败，提取所有经文后按标准结构分配 ===== */
  let allVerses = []
  if (chapterTexts.length <= 2) {
    /* 基本没分章 → 对全文做经文解析 */
    allVerses = splitTextToVerses(text)
  } else {
    /* 分了章但数量不对 → 合并所有章的经文 */
    for (const ch of chapterTexts) {
      allVerses.push(...splitTextToVerses(ch))
    }
  }

  /* 按标准每章经文节数分配 */
  if (allVerses.length >= totalExpectedVerses * 0.7) {
    return _distributeVersesByStructure(allVerses, verseCounts)
  }

  /* ===== 兜底：尽可能分配 ===== */
  if (allVerses.length > 0) {
    return _distributeVersesByStructure(allVerses, verseCounts)
  }

  return null
}

/**
 * 尝试解析 "章:节" 格式（如 "1:1 起初..." "2:1 天地..."）
 * 按章号分组，用标准节数验证
 */
function _tryParseChapterVerseFormat(text, verseCounts) {
  const lines = text.split('\n')
  const cvPattern = /^\s*(\d{1,3})\s*[:：]\s*(\d{1,3})\s*/
  const cvLines = lines.filter(l => cvPattern.test(l) && l.trim().length > (l.trim().match(cvPattern)?.[0]?.trim().length || 0))

  if (cvLines.length < 10) return null

  /* 按章号分组 */
  const chapterMap = new Map()
  let currentCh = null

  for (const line of lines) {
    const m = line.match(cvPattern)
    if (m && line.trim().length > m[0].trim().length) {
      const ch = parseInt(m[1])
      const verseText = line.replace(cvPattern, '').trim()
      if (!chapterMap.has(ch)) chapterMap.set(ch, [])
      if (verseText) chapterMap.get(ch).push(verseText)
      currentCh = ch
    } else if (currentCh !== null && line.trim()) {
      /* 非标准行归入当前章 */
      const arr = chapterMap.get(currentCh)
      if (arr && arr.length > 0) {
        arr[arr.length - 1] += line.trim()
      }
    }
  }

  /* 验证：检测到的章数应达到期望的 60% 以上 */
  if (chapterMap.size < verseCounts.length * 0.6) return null

  const result = []
  for (let ch = 0; ch < verseCounts.length; ch++) {
    const texts = chapterMap.get(ch + 1) || []
    result.push(texts.map((t, i) => ({ verse: i + 1, text: t })))
  }
  return result
}

/**
 * 将经文列表按标准每章节数分配到各章
 * @param {Array<{verse:number, text:string}>} allVerses 所有经文（平铺）
 * @param {number[]} verseCounts 每章应有的经文节数
 * @returns {Array<Array<{verse:number, text:string}>>}
 */
function _distributeVersesByStructure(allVerses, verseCounts) {
  const result = []
  let offset = 0

  for (let ch = 0; ch < verseCounts.length; ch++) {
    const expectedCount = verseCounts[ch]
    const chapterVerses = []

    for (let v = 0; v < expectedCount && offset < allVerses.length; v++) {
      chapterVerses.push({
        verse: v + 1,
        text: allVerses[offset].text
      })
      offset++
    }

    result.push(chapterVerses)
  }

  /* 如果还有剩余经文，追加到最后一章 */
  if (offset < allVerses.length) {
    const lastChapter = result[result.length - 1]
    while (offset < allVerses.length) {
      lastChapter.push({
        verse: lastChapter.length + 1,
        text: allVerses[offset].text
      })
      offset++
    }
  }

  return result
}

/**
 * 智能去除行首序号前缀（如 "1. "、"（2）"、"3、"）
 * @param {string[]} lines
 * @returns {string[]}
 */
export function stripLineNumbers(lines) {
  const pattern = /^\s*[\(（【]?\d{1,4}[\)）】]?\s*[\.。、:：\-\s]\s*/
  const matchCount = lines.filter(l => pattern.test(l)).length
  if (matchCount > lines.length / 2) {
    return lines.map(l => l.replace(pattern, '').trim())
  }
  return lines.map(l => l.trim())
}

/**
 * 将一章的文本分割为节经文数组
 * 优先按编号分节 → 按换行分节 → 按句号分节
 * @param {string} text 一章的原始文本
 * @returns {Array<{ verse: number, text: string }>}
 */
export function splitTextToVerses(text) {
  const rawLines = text.split('\n').filter(l => l.trim())
  /* 清理 PDF 常见的不可见字符（零宽空格、BOM 等） */
  const lines = rawLines.map(l => l.replace(/[\u200B-\u200D\uFEFF\u00A0]/g, ' ').trim()).filter(l => l)

  /* === 策略0：独立行经文编号（PDF 常见格式） ===
   * 编号单独占一行，后续行为经文正文（可跨多行）
   * 第一个编号前的短文本识别为段落标题（verse: 0）
   * 经文末尾紧跟的短文本也识别为段落标题 */
  const standaloneNumRe = /^(\d{1,3})$/
  const numLines = lines.filter(l => standaloneNumRe.test(l))
  if (numLines.length >= 3) {
    const nums = numLines.map(l => parseInt(l.match(standaloneNumRe)[1]))
    let ascending = true
    for (let i = 1; i < nums.length; i++) {
      if (nums[i] <= nums[i - 1]) { ascending = false; break }
    }
    if (ascending && nums[0] <= 2) {
      const verses = []
      let curNum = null
      let parts = []
      for (const line of lines) {
        const m = line.match(standaloneNumRe)
        if (m) {
          if (curNum !== null && parts.length > 0) {
            /* 保存当前节前，移除首尾混入的段落标题 */
            _stripLeadingHeadings(parts)
            _extractTrailingHeading(parts)
            verses.push({ verse: curNum, text: parts.join('') })
          }
          curNum = parseInt(m[1])
          parts = []
        } else if (curNum !== null) {
          parts.push(line)
        }
        /* 首个编号前的内容（标题等）直接跳过 */
      }
      if (curNum !== null && parts.length > 0) {
        _stripLeadingHeadings(parts)
        verses.push({ verse: curNum, text: parts.join('') })
      }
      if (verses.length > 0) return verses
    }
  }

  /* === 策略1：行首带编号前缀（如 "1. …" "2、…"） === */
  const numberedPattern = /^\d{1,3}\s*[\.。、:：\-)\s]/
  const numberedCount = lines.filter(l => numberedPattern.test(l)).length
  if (numberedCount > lines.length * 0.5) {
    const stripped = stripLineNumbers(lines)
    return _filterHeadingVerses(stripped.map((t, i) => ({ verse: i + 1, text: t })))
  }

  /* === 策略2：按行分节（短行文本） === */
  if (lines.length >= 3 && lines.every(l => l.length < 200)) {
    const raw = lines.map((l, i) => ({ verse: i + 1, text: l }))
    return _mergeStandaloneNumbers(raw)
  }

  /* === 策略3：按句号分节（兜底） === */
  const allText = lines.join('')
  const sentences = allText.split(/(?<=[。！？；])\s*/).filter(s => s.trim())
  return sentences.map((s, i) => ({ verse: i + 1, text: s }))
}

/**
 * 过滤掉被错误识别为经文的小标题
 * 特征：文本极短（≤10字）、无句尾标点、前后文都是正常经文
 */
function _filterHeadingVerses(verses) {
  if (verses.length < 3) return verses
  const filtered = verses.filter((v, i) => {
    const t = v.text.trim()
    /* 极短文本（≤10字）且无句尾标点 → 疑似标题 */
    if (t.length > 0 && t.length <= 10 && !/[。！？；」）\.]$/.test(t)) {
      /* 确认前后节是正常经文（有标点结尾） */
      const prev = verses[i - 1]?.text?.trim() || ''
      const next = verses[i + 1]?.text?.trim() || ''
      const prevOk = /[。！？；」）\.]$/.test(prev)
      const nextOk = next.length > 10
      if (prevOk || nextOk) return false
    }
    return true
  })
  /* 重新编号 */
  return filtered.map((v, i) => ({ ...v, verse: i + 1 }))
}

/**
 * 安全网：修复交替出现的 [独立数字, 正文, 独立数字, 正文, ...] 模式
 * PDF 导入时经文编号（1, 2, 3...）可能被当成独立节，
 * 此函数检测后将其合并为 { verse: 数字, text: 正文 }
 * 同时识别段落标题（短文本，无句尾标点）标记为 verse: 0
 */
function _mergeStandaloneNumbers(verses) {
  if (verses.length < 4) return verses

  /* 统计纯数字节的比例，超过 25% 才触发合并 */
  const numCount = verses.filter(v => /^\d{1,3}$/.test(v.text)).length
  if (numCount < verses.length * 0.25) return verses

  const fixed = []
  let i = 0
  while (i < verses.length) {
    if (/^\d{1,3}$/.test(verses[i].text)) {
      const num = parseInt(verses[i].text)
      /* 收集该编号后所有非数字行 */
      const textParts = []
      i++
      while (i < verses.length && !/^\d{1,3}$/.test(verses[i].text)) {
        textParts.push(verses[i].text)
        i++
      }
      if (textParts.length > 0) {
        _stripLeadingHeadings(textParts)
        _extractTrailingHeading(textParts)
        fixed.push({ verse: num, text: textParts.join('') })
      }
    } else {
      /* 数字前的非数字行（标题等）→ 直接跳过 */
      i++
    }
  }

  return fixed.length > 0 ? _filterHeadingVerses(fixed) : verses
}

/**
 * 从章节文本末尾提取下一章的章编号和标题
 * PDF 中章编号（如 "2"）和标题（如 "制定安息日"）可能混入上一章末尾
 * 检测模式：[...经文..., 小数字(章号), 标题文本]
 * 如果检测到，从 lines 中移除并返回标题文本；否则返回 null
 */
function _extractTrailingChapterMark(lines) {
  if (lines.length < 5) return null

  let cutPoint = lines.length
  const headings = []

  /* 从末尾往前扫：收集像标题的行 */
  while (cutPoint > 2) {
    const t = lines[cutPoint - 1].trim()
    if (t && _looksLikeHeading(t)) {
      headings.unshift(t)
      cutPoint--
    } else {
      break
    }
  }

  /* 检查标题前是否有独立章编号（数值远小于前面的经文编号） */
  if (cutPoint > 2 && /^\s*\d{1,3}\s*$/.test(lines[cutPoint - 1])) {
    const chapterNum = parseInt(lines[cutPoint - 1].trim())
    for (let j = cutPoint - 2; j >= Math.max(0, cutPoint - 6); j--) {
      const vm = lines[j].match(/^\s*(\d{1,3})\s*$/)
      if (vm) {
        const prevNum = parseInt(vm[1])
        if (chapterNum < prevNum * 0.5) {
          /* 章编号远小于前一个经文编号 → 确认是下一章的标记 */
          cutPoint--
          lines.splice(cutPoint, lines.length - cutPoint)
          return headings.length > 0 ? headings.join('\n') : null
        }
        break
      }
    }
  }

  return null
}

/**
 * 判断一行文本是否像段落标题（短文本、无句尾标点）
 */
function _looksLikeHeading(text) {
  return text.length > 0 && text.length < 30 && !/[。！？；」）\.]$/.test(text)
}

/**
 * 从经文 parts 开头移除段落标题
 * 如果第一行像标题（短、无句尾标点）且后面还有正文，则移除
 */
function _stripLeadingHeadings(parts) {
  while (parts.length > 1 && _looksLikeHeading(parts[0]) && parts[0].length <= 10) {
    parts.shift()
  }
}

/**
 * 从经文 parts 末尾提取段落标题
 * 如果最后一行像标题（短、无句尾标点）且前一行以句号结尾，则提取出来
 */
function _extractTrailingHeading(parts) {
  if (parts.length < 2) return null
  const last = parts[parts.length - 1]
  const prev = parts[parts.length - 2]
  if (_looksLikeHeading(last) && /[。！？；」）]$/.test(prev)) {
    parts.pop()
    return last
  }
  return null
}

/**
 * 初始化空的 66 卷圣经数据结构
 * @returns {Array} books 数组
 */
export function initEmptyBibleBooks() {
  return BIBLE_BOOK_NAMES_INTERNAL.map((name, index) => ({
    name,
    abbr: '',
    chapters: Array.from({ length: BOOK_CHAPTER_COUNTS[index] }, (_, i) => ({
      chapter: i + 1,
      verses: []
    }))
  }))
}

/**
 * 将解析好的章节经文填入圣经数据结构
 * @param {number} bookIndex 书卷索引（0-65）
 * @param {string[]} chapterTexts 每章的原始文本数组
 * @param {number} [startChapter=0] 起始章节索引（0开始）
 * @returns {Array} 完整的 66 卷 books 数组
 */
export function buildBibleContentJson(bookIndex, chapterTexts, startChapter = 0) {
  const books = initEmptyBibleBooks()
  if (bookIndex < 0 || bookIndex >= 66) return books

  const bookChapters = books[bookIndex].chapters
  chapterTexts.forEach((chText, i) => {
    const chIdx = startChapter + i
    if (chIdx < bookChapters.length) {
      bookChapters[chIdx].verses = splitTextToVerses(chText)
    }
  })

  return books
}

/**
 * 在文本中检测所有出现的书卷边界（用于整本圣经解析）
 * 只用 ≥3 字中文书卷名做边界，避免单字误匹配
 * @param {string} text 整本圣经原始文本
 * @returns {Array<{ bookIndex: number, name: string, position: number }>} 按位置排序
 */
export function detectAllBooks(text) {
  /* 只用中文长名（≥2字，优先3字以上），要求出现在行首 */
  const candidates = Object.entries(BOOK_NAME_MAP)
    .filter(([name]) => name.length >= 2 && /^[\u4e00-\u9fff]+$/.test(name))
    .sort((a, b) => b[0].length - a[0].length) /* 长名优先，防止"创"先匹配"创世记" */

  const found = new Map() /* bookIndex → first occurrence */

  for (const [name, bookIdx] of candidates) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    /* 策略1：书卷名独占一行（原有逻辑） */
    const pattern1 = new RegExp(`(?:^|\\n)\\s*${escaped}\\s*(?:\\n|$)`, 'g')
    let m
    while ((m = pattern1.exec(text)) !== null) {
      if (!found.has(bookIdx)) {
        found.set(bookIdx, { bookIndex: bookIdx, name, position: m.index })
      }
    }
    /* 策略2：书卷名在行首，后跟章节号或空白（PDF 提取时书名可能与内容同行） */
    if (!found.has(bookIdx) && name.length >= 3) {
      const pattern2 = new RegExp(`(?:^|\\n)\\s*${escaped}\\s*(?:第|\\d|$)`, 'gm')
      while ((m = pattern2.exec(text)) !== null) {
        if (!found.has(bookIdx)) {
          found.set(bookIdx, { bookIndex: bookIdx, name, position: m.index })
        }
      }
    }
  }

  return Array.from(found.values()).sort((a, b) => a.position - b.position)
}

/**
 * 解析整本圣经文本（多卷书）
 * 自动识别书卷边界 → 章节边界 → 经文
 * @param {string} text 整本圣经原始文本（PDF/TXT/DOCX 提取后）
 * @returns {{ books: Array, detectedCount: number }} 66卷结构 + 识别到的书卷数
 */
export function parseFullBibleText(text) {
  /* 先清理 PDF 页眉页脚（"创世记 2:1 2 创世记 3:7" 之类的翻页标记） */
  const cleanText = cleanBiblePageHeaders(text)

  const books = initEmptyBibleBooks()
  const detectedBooks = detectAllBooks(cleanText)

  if (detectedBooks.length < 1) {
    return { books, detectedCount: 0 }
  }

  for (let i = 0; i < detectedBooks.length; i++) {
    const current = detectedBooks[i]
    const nextPos = i + 1 < detectedBooks.length ? detectedBooks[i + 1].position : cleanText.length

    /* 跳过书名行本身，取书名之后的正文 */
    const nameLineEnd = cleanText.indexOf('\n', current.position + current.name.length)
    if (nameLineEnd < 0) continue
    const bookText = cleanText.slice(nameLineEnd + 1, nextPos).trim()
    if (!bookText) continue

    const chapterTexts = splitIntoChapters(bookText)
    const bookChapters = books[current.bookIndex].chapters

    chapterTexts.forEach((chText, chIdx) => {
      if (chIdx < bookChapters.length && chText.trim()) {
        bookChapters[chIdx].verses = splitTextToVerses(chText)
      }
    })
  }

  return { books, detectedCount: detectedBooks.length }
}

/**
 * 清理圣经 PDF 中的页眉页脚
 * 常见格式："书名 章:节"（如 "创世记 2:1"、"马太福音 5:3"）
 * 以及含多个引用的组合页眉（如 "创世记 2:1 2 创世记 3:7"）
 */
export function cleanBiblePageHeaders(text) {
  /* 匹配 "中文书名 章:节" 格式 */
  const bookRefRe = /[\u4e00-\u9fff]{2,}\s*\d{1,3}\s*[:：]\s*\d{1,3}/
  return text.split('\n').filter(line => {
    const t = line.trim()
    if (!t) return true

    /* 含 2 个以上 "书名 章:节" 引用的行 → 页眉 */
    const refs = t.match(new RegExp(bookRefRe.source, 'g'))
    if (refs && refs.length >= 2 && t.length < 60) return false

    /* 单个 "书名 章:节" 独占一行 → 页眉 */
    if (new RegExp('^' + bookRefRe.source + '\\s*$').test(t) && t.length < 30) return false

    return true
  }).join('\n')
}

/**
 * 判断 JSON 文本是否为圣经 APP 导出格式
 * 检测关键字段：content、catalogs、books
 * @param {string} jsonText JSON 文本
 * @returns {boolean}
 */
export function isBibleJsonFormat(jsonText) {
  try {
    const data = JSON.parse(jsonText)
    return !!(data.content && data.catalogs && data.books)
  } catch {
    return false
  }
}

/**
 * 判断 JSON 文本是否为词典 APP 导出格式
 * 检测关键字段：content 数组且每项有 t 和 b 字段
 * @param {string} jsonText JSON 文本
 * @returns {boolean}
 */
export function isDictionaryJsonFormat(jsonText) {
  try {
    const data = JSON.parse(jsonText)
    return Array.isArray(data.content) && data.content.length > 0 && data.content[0].t !== undefined && data.content[0].b !== undefined
  } catch {
    return false
  }
}

/**
 * 判断 JSON 文本是否为注释 APP 导出格式
 * 检测关键字段：content 对象且有 b{n}c{n} 格式的键，以及 links 字段
 * @param {string} jsonText JSON 文本
 * @returns {boolean}
 */
export function isCommentaryJsonFormat(jsonText) {
  try {
    const data = JSON.parse(jsonText)
    if (!data.content || Array.isArray(data.content)) return false
    /* 检查是否有 b{n}c{n} 格式的键 */
    const keys = Object.keys(data.content).filter(k => !k.startsWith('_'))
    return keys.some(k => /^b\d+c\d+$/.test(k))
  } catch {
    return false
  }
}

/**
 * 从圣经 APP JSON 富文本片段数组中提取纯文本
 * 过滤掉标题片段（f=2, f=4），只保留正文（f=0）
 * @param {Array} dArray 富文本片段数组（d 字段）
 * @returns {string} 纯文本
 */
function _extractVerseText(dArray) {
  if (!Array.isArray(dArray) || dArray.length === 0) return ''
  return dArray
    .filter(seg => seg.f === 0) /* 只保留正文片段 */
    .map(seg => {
      /* 清理 HTML 标签（<u>人名</u>、<r>地名</r> 等） */
      let text = seg.d || ''
      text = text.replace(/<[^>]+>/g, '')
      return text
    })
    .join('')
    .trim()
}

/**
 * 从圣经 APP JSON 富文本片段中提取段落标题
 * @param {Array} dArray 富文本片段数组
 * @returns {string|null} 标题文本，无标题返回 null
 */
function _extractVerseTitle(dArray) {
  if (!Array.isArray(dArray)) return null
  const titleSegs = dArray.filter(seg => seg.f === 2)
  if (titleSegs.length === 0) return null
  return titleSegs.map(seg => (seg.d || '').replace(/<[^>]+>/g, '')).join(' ').trim()
}

/**
 * 解析圣经 APP JSON 格式，转换为编辑器内部 books 结构
 *
 * APP JSON 格式关键结构：
 *   - catalogs[]: 每本书一项，含 b(书卷号1-66)、cs(章节数组)
 *   - content: { k{全局章序号}: { bid, cid, vs: [{v, t, d}] } }
 *   - contentIndex: { b{n}c{m}: 全局章序号 }
 *
 * @param {string} jsonText JSON 文本
 * @returns {{ books: Array, meta: Object, stats: { importedBooks: number, totalVerses: number } } | null}
 */
export function parseBibleJson(jsonText) {
  let data
  try {
    data = JSON.parse(jsonText)
  } catch {
    return null
  }

  if (!data.content || !data.catalogs) return null

  const booksData = initEmptyBibleBooks()
  let totalVerses = 0
  let importedBooks = 0

  for (const catalog of data.catalogs) {
    const bookNum = catalog.b /* 书卷编号 1-66 */
    const bookIndex = bookNum - 1
    if (bookIndex < 0 || bookIndex >= 66) continue

    const book = booksData[bookIndex]
    /* 设置书卷简称 */
    if (catalog.bm) book.abbr = catalog.bm
    let bookHasVerses = false

    /* 遍历该书的章节 */
    if (catalog.cs && Array.isArray(catalog.cs)) {
      for (const chInfo of catalog.cs) {
        const chId = chInfo.id /* 0=简介, 1=第1章... */
        if (chId === 0) continue /* 跳过简介章 */

        const chapterIndex = chId - 1
        if (chapterIndex < 0 || chapterIndex >= book.chapters.length) continue

        /* 通过 contentIndex 找到全局章序号 */
        const contentKey = data.contentIndex ? data.contentIndex[`b${bookNum}c${chId}`] : null
        let chapterContent = null

        if (contentKey !== null && contentKey !== undefined) {
          chapterContent = data.content[`k${contentKey}`]
        } else {
          /* 降级：尝试直接用 books 字段的偏移量计算 */
          const bookStart = data.books ? data.books[`ks${bookNum}`] : null
          if (bookStart !== null && bookStart !== undefined) {
            chapterContent = data.content[`k${bookStart + chId}`]
          }
        }

        if (!chapterContent || !chapterContent.vs) continue

        const verses = []
        for (const vs of chapterContent.vs) {
          const text = _extractVerseText(vs.d) || vs.t || ''
          if (!text) continue
          verses.push({
            verse: vs.v || verses.length + 1,
            text: text
          })
        }

        if (verses.length > 0) {
          book.chapters[chapterIndex].verses = verses
          totalVerses += verses.length
          bookHasVerses = true
        }
      }
    }

    if (bookHasVerses) importedBooks++
  }

  /* 提取元数据 */
  const meta = {
    title: data.title || '',
    abbr: data.abbr || '',
    iso: data.iso || '',
    summary: data.summary || '',
    version: data.version || 1,
    infos: data.infos ? 1 : 0,
    chapters: data.chapters || 0,
    ttf: data.ttf || '',
    odir: data.odir || 0,
    ndir: data.ndir || 0
  }

  return {
    books: booksData,
    meta,
    stats: { importedBooks, totalVerses }
  }
}

/**
 * 解析词典 APP JSON 格式
 * @param {string} jsonText JSON 文本
 * @returns {{ entries: Array<{id: string, title: string, content: string}>, meta: Object } | null}
 */
export function parseDictionaryJson(jsonText) {
  let data
  try {
    data = JSON.parse(jsonText)
  } catch {
    return null
  }

  if (!Array.isArray(data.content)) return null

  const entries = data.content.map(item => ({
    id: item.id || '',
    title: (item.t || '').replace(/<[^>]+>/g, ''),
    content: item.b || ''
  }))

  const meta = {
    title: data.title || '',
    abbr: data.abbr || '',
    iso: data.iso || '',
    summary: data.summary || '',
    version: data.version || 1
  }

  return { entries, meta }
}

/**
 * 解析注释 APP JSON 格式
 * @param {string} jsonText JSON 文本
 * @returns {{ chapters: Object, links: Object, meta: Object } | null}
 */
export function parseCommentaryJson(jsonText) {
  let data
  try {
    data = JSON.parse(jsonText)
  } catch {
    return null
  }

  if (!data.content || Array.isArray(data.content)) return null

  /* 提取章节注释（过滤掉 _ 前缀的描述字段） */
  const chapters = {}
  for (const [key, value] of Object.entries(data.content)) {
    if (key.startsWith('_')) continue
    if (/^b\d+c\d+$/.test(key)) {
      chapters[key] = Array.isArray(value) ? value : []
    }
  }

  const meta = {
    title: data.title || '',
    abbr: data.abbr || '',
    iso: data.iso || '',
    summary: data.summary || '',
    version: data.version || 1
  }

  return {
    chapters,
    links: data.links || {},
    meta,
    style: data.style || '',
    script: data.script || ''
  }
}

/**
 * 将注释 APP JSON 格式转换为扁平条目数组
 * b1c1 → 创世记1章，b39c1 → 马太福音1章
 * @param {Object} parsed parseCommentaryJson 的返回值
 * @returns {Array<{title: string, content: string}>}
 */
export function commentaryJsonToEntries(parsed) {
  if (!parsed || !parsed.chapters) return []
  const entries = []
  for (const [key, items] of Object.entries(parsed.chapters)) {
    const m = key.match(/^b(\d+)c(\d+)$/)
    if (!m) continue
    const bookIdx = parseInt(m[1]) - 1
    const chapter = parseInt(m[2])
    if (bookIdx < 0 || bookIdx >= 66) continue
    const bookName = BIBLE_BOOK_NAMES_INTERNAL[bookIdx]
    if (Array.isArray(items)) {
      items.forEach((item, idx) => {
        const title = item.v ? `${bookName} ${chapter}:${item.v}` : `${bookName} ${chapter}章 段落${idx + 1}`
        const content = typeof item === 'string' ? item : (item.t || item.text || item.content || JSON.stringify(item))
        entries.push({ title, content })
      })
    }
  }
  return entries
}

/**
 * 经文引用正则：匹配 "太5:1-12"、"马太福音 5:1-12"、"创1:1"、"诗篇 23篇"、"Matt 5:1-12" 等格式
 * 捕获组：(书卷名)(章号)(起始节?)(结束节?)
 */
const _VERSE_REF_PATTERNS = [
  /* 中文：太5:1-12、太 5：1-12、马太福音5章1-12节 */
  /([一二三\u4e00-\u9fff]{1,8})\s*(\d{1,3})\s*[:：]\s*(\d{1,3})(?:\s*[-–—]\s*(\d{1,3}))?/,
  /* 中文章节格式：马太福音5章、诗篇23篇 */
  /([一二三\u4e00-\u9fff]{1,8})\s*(\d{1,3})\s*[章篇]/,
  /* 英文：Matt 5:1-12、Gen. 1:1、1Cor 3:16 */
  /([123]?\s*[A-Za-z]{2,15})\.?\s+(\d{1,3})\s*:\s*(\d{1,3})(?:\s*[-–—]\s*(\d{1,3}))?/
]

/**
 * 检测文本中是否包含经文引用
 * @param {string} text 待检测的文本
 * @returns {{ bookIndex: number, bookName: string, display: string } | null}
 */
export function detectScriptureRef(text) {
  if (!text) return null

  for (const pattern of _VERSE_REF_PATTERNS) {
    const m = text.match(pattern)
    if (!m) continue

    const bookPart = m[1].trim()
    /* 在 BOOK_NAME_MAP 中查找 */
    const lower = bookPart.toLowerCase().replace(/[\s.]/g, '')
    const idx = BOOK_NAME_MAP[bookPart] !== undefined ? BOOK_NAME_MAP[bookPart]
      : BOOK_NAME_MAP[lower] !== undefined ? BOOK_NAME_MAP[lower]
      : undefined
    if (idx === undefined) continue

    return {
      bookIndex: idx,
      bookName: BIBLE_BOOK_NAMES_INTERNAL[idx],
      display: m[0].trim()
    }
  }
  return null
}

/**
 * 在文本中查找所有经文引用并返回位置信息
 * 用于阅读页面高亮显示经文引用
 * @param {string} text
 * @returns {Array<{ start: number, end: number, display: string, bookName: string }>}
 */
export function findAllScriptureRefs(text) {
  if (!text) return []
  const refs = []

  /* 综合匹配经文引用的全局正则 */
  const globalPattern = /(?:([一二三\u4e00-\u9fff]{1,8})\s*(\d{1,3})\s*[:：]\s*(\d{1,3})(?:\s*[-–—]\s*(\d{1,3}))?)|(?:([一二三\u4e00-\u9fff]{1,8})\s*(\d{1,3})\s*[章篇](?:\s*(\d{1,3})\s*[-–—]\s*(\d{1,3})\s*节)?)|(?:([123]?\s*[A-Za-z]{2,15})\.?\s+(\d{1,3})\s*:\s*(\d{1,3})(?:\s*[-–—]\s*(\d{1,3}))?)/g

  let m
  while ((m = globalPattern.exec(text)) !== null) {
    /* 提取书卷名部分 */
    const bookPart = (m[1] || m[5] || m[9] || '').trim()
    if (!bookPart) continue

    const lower = bookPart.toLowerCase().replace(/[\s.]/g, '')
    const idx = BOOK_NAME_MAP[bookPart] !== undefined ? BOOK_NAME_MAP[bookPart]
      : BOOK_NAME_MAP[lower] !== undefined ? BOOK_NAME_MAP[lower]
      : undefined
    if (idx === undefined) continue

    refs.push({
      start: m.index,
      end: m.index + m[0].length,
      display: m[0].trim(),
      bookName: BIBLE_BOOK_NAMES_INTERNAL[idx]
    })
  }
  return refs
}

/**
 * 判断一行文本是否像作者信息
 * @param {string} line
 * @returns {boolean}
 */
function _isLikelyAuthor(line) {
  if (!line) return false
  /* 长度限制：作者行通常较短 */
  if (line.length > 30) return false
  /* 包含作者关键词 */
  if (/[著编译撰整理]|作者|译者|编者|by\s/i.test(line)) return true
  return false
}

/**
 * 判断一行文本是否像标题
 * @param {string} line
 * @returns {boolean}
 */
function _isLikelyTitle(line) {
  if (!line) return false
  /* 短行更可能是标题 */
  if (line.length <= 30) return true
  /* 常见标题模式 */
  if (/^第[\s\d一二三四五六七八九十百零〇]+[章节篇部]/.test(line)) return true
  if (/^[一二三四五六七八九十]+[、.]/.test(line)) return true
  if (/^\d+[、.\s]/.test(line)) return true
  if (/^(序言|前言|引言|简介|概论|总论|结语|附录|导论|绪论|全景|概述)/.test(line)) return true
  if (/^(chapter|part|section|introduction|conclusion|preface)\s/i.test(line)) return true
  if (/^[A-Z\s]{5,}$/.test(line)) return true /* 全大写短句 */
  return false
}

/**
 * 判断一行或一段文本是否以经文引用开头（如 "太5:1-12"）
 * @param {string} line
 * @returns {boolean}
 */
function _startsWithVerseRef(line) {
  if (!line) return false
  /* 中文经文引用开头 */
  if (/^\s*[\(（]?\s*[一二三\u4e00-\u9fff]{1,8}\s*\d{1,3}\s*[:：章篇]/.test(line)) return true
  /* 英文经文引用开头 */
  if (/^\s*[\(（]?\s*[123]?\s*[A-Za-z]{2,15}\.?\s+\d{1,3}\s*:/.test(line)) return true
  return false
}

/**
 * 解析纯文本为注释段落数组（按段落/主题智能分割）
 * 智能识别标题、作者、经文引用等块类型
 * @param {string} text 原始文本
 * @returns {Array<{type: string, title: string, content: string}>}
 *   type 可为: document_title, author, preface, chapter_title, verse_ref, body
 */
export function parseCommentaryText(text) {
  if (!text || !text.trim()) return []

  /* 按双换行分割为段落块 */
  const blocks = text.split(/\n\s*\n/).filter(p => p.trim())
  if (blocks.length === 0) return []

  const entries = []
  let hasDocTitle = false

  for (let bi = 0; bi < blocks.length; bi++) {
    const block = blocks[bi]
    const lines = block.split('\n').map(l => l.trim()).filter(l => l)
    if (lines.length === 0) continue

    const firstLine = lines[0]
    const isTitle = _isLikelyTitle(firstLine)

    /* === 块类型检测 === */
    let blockType = 'body'

    /* 文档标题：前2个块中的短文本 */
    if (!hasDocTitle && bi < 2 && isTitle && lines.length <= 2 && firstLine.length <= 40) {
      /* 检查是否像作者行 */
      if (_isLikelyAuthor(firstLine)) {
        blockType = 'author'
      } else {
        blockType = 'document_title'
        hasDocTitle = true
      }
    }
    /* 作者行：在标题之后的短行 */
    else if (bi < 4 && _isLikelyAuthor(firstLine) && lines.length <= 2) {
      blockType = 'author'
    }
    /* 经文引用开头的段落 */
    else if (_startsWithVerseRef(firstLine)) {
      blockType = 'verse_ref'
    }
    /* 章标题：第X章 */
    else if (/^第[\s\d一二三四五六七八九十百零〇]+[章篇部]/.test(firstLine) ||
             /^(chapter|part)\s+\d+/i.test(firstLine)) {
      blockType = 'chapter_title'
    }
    /* 前言/序言 */
    else if (/^(序言|前言|引言|简介|概论|导论|绪论|概述|preface|introduction)/i.test(firstLine)) {
      blockType = 'preface'
    }
    /* 带编号的小节标题 */
    else if (isTitle && (/^[一二三四五六七八九十]+[、.]/.test(firstLine) ||
             /^\d+[、.]/.test(firstLine) ||
             /^[（(]\s*\d+\s*[）)]/.test(firstLine))) {
      blockType = 'section_title'
    }

    /* === 构造条目 === */
    if (isTitle && lines.length > 1) {
      entries.push({
        type: blockType,
        title: firstLine,
        content: lines.slice(1).join('\n')
      })
    } else if (isTitle && lines.length === 1) {
      entries.push({
        type: blockType,
        title: firstLine,
        content: ''
      })
    } else {
      const autoTitle = firstLine.length > 20 ? firstLine.slice(0, 20) + '...' : firstLine
      entries.push({
        type: blockType,
        title: autoTitle,
        content: lines.join('\n')
      })
    }
  }

  /* 合并连续的空内容标题到下一个段落 */
  const merged = []
  for (let i = 0; i < entries.length; i++) {
    if (!entries[i].content && i + 1 < entries.length) {
      merged.push({
        type: entries[i].type,
        title: entries[i].title,
        content: entries[i + 1].content || entries[i + 1].title
      })
      i++
    } else {
      merged.push(entries[i])
    }
  }

  return merged.length > 0 ? merged : entries
}
