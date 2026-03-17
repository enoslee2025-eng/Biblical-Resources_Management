/**
 * 圣经经文排版引擎
 * 将混乱的经文文本解析为手机圣经App阅读格式
 *
 * 目标格式：
 *   1起初　神创造天地。
 *   2地是空虚混沌，渊面黑暗；　神的灵运行在水面上。
 *   3神说："要有光！"就有了光。
 */

/**
 * 引语动词（用于引号修复）
 */
const SPEECH_VERBS = '说|吩咐|呼叫|回答|宣告|问道|问|喊着说|喊|命令|祝福|起誓|警告|应许|预言|劝|告诉|嘱咐|呼喊|叫|答|喊叫'

/* ========== 步骤1：清理空格 ========== */

/**
 * 删除汉字之间的无意义半角空格，保留全角空格（U+3000）
 */
function cleanSpaces(text) {
  let s = text

  /* 统一换行符 */
  s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  /* 去掉常见乱码 */
  s = s.replace(/[□■◆◇○●△▽☆★※＊]+/g, '')
  s = s.replace(/[#@$%^&=|\\~`]+/g, '')

  /* 去掉页码标记 */
  s = s.replace(/[ \t]*[-–—][ \t]*\d+[ \t]*[-–—][ \t]*/g, ' ')
  s = s.replace(/[ \t]*\[?\(?\s*[pP]\.?\s*\d+\s*\)?\]?[ \t]*/g, ' ')

  /*
   * 汉字/中文标点之间的半角空格全部删除（多次替换处理重叠）
   * ⚠️ 只删半角空格和 Tab，保留全角空格 U+3000
   *    因为"　神"前的全角空格是和合本尊称格式，不能删
   */
  const cjk = '[\u4e00-\u9fff\u3001-\u303f\uff00-\uffef]'
  const cjkSpaceRe = new RegExp('(' + cjk + ')[ \\t]+(' + cjk + ')', 'g')
  let prev = ''
  while (prev !== s) {
    prev = s
    s = s.replace(cjkSpaceRe, '$1$2')
  }

  /* 标点前后的半角空格删除（保留全角空格） */
  s = s.replace(/[ \t]+([，。；：？！、）》」』\u201d])/g, '$1')
  s = s.replace(/([（《「『\u201c])[ \t]+/g, '$1')

  /* 数字和中文之间的半角空格删除（节号场景，保留全角空格如"1　神"） */
  s = s.replace(/(\d)[ \t]+(?=[\u4e00-\u9fff\u201c\u300c"'])/g, '$1')

  return s
}

/* ========== 步骤2：统一标点 ========== */

/**
 * 英文标点 → 中文标点（包括全角英文标点）
 */
function fixPunctuation(text) {
  let s = text

  /* 全角英文标点先统一为半角，再转中文 */
  s = s.replace(/\uff0c/g, '，')  /* ， (fullwidth comma) → 中文逗号 */
  s = s.replace(/\uff0e/g, '。')  /* ． (fullwidth period) → 中文句号 */
  s = s.replace(/\uff1b/g, '；')  /* ； (fullwidth semicolon) → 中文分号 */
  s = s.replace(/\uff1a/g, '：')  /* ： (fullwidth colon) → 中文冒号 */
  s = s.replace(/\uff1f/g, '？')  /* ？ (fullwidth question) → 中文问号 */
  s = s.replace(/\uff01/g, '！')  /* ！ (fullwidth exclamation) → 中文感叹号 */

  /* 半角英文标点 → 中文标点 */
  /* 逗号 */
  s = s.replace(/\s*,\s*/g, '，')
  /* 句号（排除小数点：数字.数字） */
  s = s.replace(/(?<=[\u4e00-\u9fff\u201d\u300d）》」』])\s*\.\s*/g, '。')
  s = s.replace(/\.\s*(?=[\u4e00-\u9fff\u201c\u300c（《「『])/g, '。')
  s = s.replace(/\.\s*$/g, '。')
  /* 分号 */
  s = s.replace(/\s*;\s*/g, '；')
  /* 冒号（排除经文引用格式如 3:16） */
  s = s.replace(/\s*:\s*(?!\d)/g, '：')
  /* 问号 */
  s = s.replace(/\s*\?\s*/g, '？')
  /* 感叹号 */
  s = s.replace(/\s*!\s*/g, '！')

  /* 连续重复标点修复 */
  s = s.replace(/。{2,}/g, '。')
  s = s.replace(/，{2,}/g, '，')
  s = s.replace(/；{2,}/g, '；')

  return s
}

/* ========== 步骤3：修复引号 ========== */

/**
 * 统一引号为中文双引号 \u201c \u201d，修复未闭合引号
 */
function fixQuotes(text) {
  let s = text

  /* 英文双引号 → 中文双引号（奇数左，偶数右） */
  let count = 0
  s = s.replace(/"/g, () => {
    count++
    return count % 2 === 1 ? '\u201c' : '\u201d'
  })

  /* 英文单引号在中文语境中也可能是引号，但不强制替换避免误伤 */

  /* 修复未闭合的左引号 */
  const leftCount = (s.match(/\u201c/g) || []).length
  const rightCount = (s.match(/\u201d/g) || []).length
  if (leftCount > rightCount) {
    /* 尝试在句末标点前补右引号 */
    s = s.replace(/(\u201c[^\u201d]+)([。！？])(\s*)$/, '$1$2\u201d$3')
    const newRight = (s.match(/\u201d/g) || []).length
    if (leftCount > newRight) {
      s += '\u201d'
    }
  }

  return s
}

/* ========== 步骤4 & 5：识别节号并拆分经文 ========== */

/**
 * 判断某个位置是否在引号内
 * 扫描 pos 之前的文本，统计未闭合的左引号数量
 */
function isInsideQuote(text, pos) {
  let depth = 0
  for (let i = 0; i < pos; i++) {
    if (text[i] === '\u201c' || text[i] === '\u300c') depth++
    if (text[i] === '\u201d' || text[i] === '\u300d') depth = Math.max(0, depth - 1)
  }
  return depth > 0
}

/**
 * 判断某个位置是否紧跟在右引号后（引号内容的延续部分）
 * 例如："要有光！"2就有了光 → "2"不是节号，是引号后的延续文本
 * 规则：如果数字前面紧接着右引号（可能中间有标点），则不是节号
 */
function isAfterClosingQuote(text, pos) {
  /* 从 pos 往前找，跳过标点符号，看是否遇到右引号 */
  let i = pos - 1
  while (i >= 0) {
    const ch = text[i]
    /* 如果遇到右引号，说明这个数字是引号后的延续 */
    if (ch === '\u201d' || ch === '\u300d') return true
    /* 如果遇到句末标点（在引号外），说明上一句已结束，这个数字可以是节号 */
    if (ch === '。' || ch === '！' || ch === '？') return false
    /* 如果遇到中文字符，说明不是紧跟引号 */
    if (/[\u4e00-\u9fff]/.test(ch)) return false
    /* 跳过其他标点继续往前看 */
    i--
  }
  return false
}

/**
 * 从文本中识别所有候选节号，过滤掉引号内和引号后的数字
 */
function findVerseNumbers(text) {
  /* 候选节号：1-3位数字，后面跟中文字符、引号或全角空格 */
  const pattern = /(\d{1,3})(?=[\u4e00-\u9fff\u201c\u300c\uff08"'\u3000])/g
  let match
  const candidates = []

  while ((match = pattern.exec(text)) !== null) {
    const pos = match.index
    const num = parseInt(match[1])
    const numStr = match[1]

    /* 节号保护：跳过引号内的数字 */
    if (isInsideQuote(text, pos)) continue

    /* 节号保护：跳过紧跟在右引号后的数字（引语延续） */
    if (isAfterClosingQuote(text, pos)) continue

    candidates.push({
      index: pos,
      num,
      numStr,
      len: numStr.length
    })
  }

  return candidates
}

/**
 * 贪心法找最长递增节号序列（优先从1开始）
 */
function findBestSequence(candidates) {
  if (candidates.length === 0) return []

  let best = []
  /* 尝试从每个值为1的候选开始 */
  const starts = candidates.filter(c => c.num === 1)
  if (starts.length === 0) starts.push(candidates[0])

  for (const start of starts) {
    const seq = [start]
    let lastNum = start.num
    let lastIndex = start.index

    for (const c of candidates) {
      if (c.index <= lastIndex) continue
      /* 允许跳过一个节号（容错OCR漏节） */
      if (c.num === lastNum + 1 || (c.num === lastNum + 2 && c.num <= 200)) {
        seq.push(c)
        lastNum = c.num
        lastIndex = c.index
      }
    }
    if (seq.length > best.length) best = seq
  }
  return best
}

/**
 * 拆分经文为标题和节数组
 */
function splitVerses(text) {
  /* 合并多行为一整段 */
  let flat = text.replace(/\n{2,}/g, '\n').trim()

  /*
   * 预处理：节号单独占一行时（PDF 常见格式），合并节号行和下一行
   * 例如：\n1\n太初 → \n1太初
   */
  flat = flat.replace(/\n[ \t]*(\d{1,3})[ \t]*\n/g, '\n$1')

  /*
   * 检测标题/页头：跳过开头所有非经文行
   * PDF 常有多行页头如：创世记 1:1 i 创世记 1:16 / 创世记 / 上帝创造天地
   */
  let title = null
  const lines = flat.split('\n')
  let verseStart = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) { verseStart = i + 1; continue }
    /* 如果该行以节号+中文开头，说明经文开始了 */
    if (/^\d{1,3}[\u4e00-\u9fff\u201c\u300c"'\u3000]/.test(line)) {
      break
    }
    /* 非经文行，视为标题/页头 */
    if (line.length <= 30) {
      if (!title) title = line
    }
    verseStart = i + 1
  }
  if (verseStart > 0) {
    flat = lines.slice(verseStart).join('\n').trim()
  }

  /* 合为一整段 */
  flat = flat.replace(/\n/g, ' ')

  /* 清理合并换行后产生的 CJK 间半角空格（保留全角空格） */
  const cjkChar = '[\u4e00-\u9fff\u3001-\u303f\uff00-\uffef]'
  let prevFlat = ''
  while (prevFlat !== flat) {
    prevFlat = flat
    flat = flat.replace(new RegExp('(' + cjkChar + ')[ \\t]+(' + cjkChar + ')', 'g'), '$1$2')
  }
  /* 清理数字和中文之间的空格（节号合并） */
  flat = flat.replace(/(\d)[ \t]+(?=[\u4e00-\u9fff\u201c\u300c"'\u3000])/g, '$1')
  flat = flat.replace(/[ \t]{2,}/g, ' ').trim()

  /* 识别节号（已过滤引号内/引号后的数字） */
  const candidates = findVerseNumbers(flat)
  const bestSeq = findBestSequence(candidates)

  const verses = []

  if (bestSeq.length >= 2) {
    /* 第一个节号前若有文本，检查是否是标题 */
    if (bestSeq[0].index > 0 && !title) {
      const prefix = flat.slice(0, bestSeq[0].index).trim()
      if (prefix && prefix.length <= 20) {
        title = prefix
      }
    }

    for (let i = 0; i < bestSeq.length; i++) {
      const numStr = bestSeq[i].numStr
      const contentStart = bestSeq[i].index + bestSeq[i].len
      const contentEnd = i + 1 < bestSeq.length ? bestSeq[i + 1].index : flat.length
      const content = flat.slice(contentStart, contentEnd).trim()
      if (content) {
        verses.push({ num: numStr, text: content })
      }
    }
  } else {
    /* 无法识别节号，按句子拆分并编号 */
    const sentences = flat.split(/(?<=[。！？\u201d\u300d])\s*/).filter(s => s.trim())
    sentences.forEach((s, i) => {
      const cleaned = s.replace(/^\d+\s*/, '').trim()
      if (cleaned) {
        verses.push({ num: String(i + 1), text: cleaned })
      }
    })
  }

  return { title, verses }
}

/* ========== 步骤6：句子修复 ========== */

/**
 * 确保每节末尾有句末标点
 */
function ensureEndPunctuation(text) {
  if (!text) return text
  /* 已有合法结尾 */
  if (/[。！？\u201d\u300d]$/.test(text)) return text
  /* 逗号/分号结尾 → 改为句号 */
  if (/[，；]$/.test(text)) return text.slice(0, -1) + '。'
  /* 无标点 → 补句号 */
  return text + '。'
}

/**
 * 引语识别：识别"X说+内容"模式，自动添加冒号和引号
 * 例如：神说要有光 → 神说："要有光。"
 * 已有引号则跳过
 */
function fixSpeechQuotes(text) {
  if (/\u201c/.test(text) || /\u300c/.test(text)) return text

  const verbPattern = new RegExp(
    '(' + SPEECH_VERBS + ')(?!：?\u201c)([^\u201c\u201d]+)$'
  )
  const m = text.match(verbPattern)
  if (!m) return text

  const verb = m[1]
  let speech = m[2].trim()
  const beforeVerb = text.slice(0, m.index)

  speech = speech.replace(/^[：:]\s*/, '')
  if (!speech) return text

  if (!/[。！？]$/.test(speech)) speech += '。'

  return beforeVerb + verb + '：\u201c' + speech + '\u201d'
}

/* ========== 步骤7：生成阅读格式 ========== */

/**
 * 在合适位置插入全角空格提升阅读感
 * 规则：句号/分号后（同节内）加全角空格
 */
function insertReadingSpaces(text) {
  let s = text
  /* 在句号、分号后插入全角空格（如果后面还有内容且不是引号结尾） */
  s = s.replace(/([。；])(?=[^\u201d\u300d\s\n])/g, '$1\u3000')
  /* 避免连续全角空格 */
  s = s.replace(/\u3000{2,}/g, '\u3000')
  return s
}

/* ========== 主函数 ========== */

/**
 * 主函数：将混乱经文文本解析为手机圣经App阅读格式
 *
 * @param {string} text - 原始混乱经文字符串
 * @returns {string} 手机App阅读格式字符串
 *
 * 示例输入：
 *   "1 起初 ， 神 创造 天地 。2 地 是 空虚混沌 ; 渊面 黑暗 ， 神 的 灵 运 行 在 水 面 上 。3 神 说 : \"要有光\" , 就有了光 。"
 *
 * 示例输出：
 *   "1起初　神创造天地。\n2地是空虚混沌，渊面黑暗；　神的灵运行在水面上。\n3神说："要有光！"就有了光。"
 */
export function formatBibleText(text) {
  if (!text || !text.trim()) return ''

  let s = text

  /* 步骤1：清理空格 */
  s = cleanSpaces(s)

  /* 步骤2：统一标点 */
  s = fixPunctuation(s)

  /* 步骤3：修复引号 */
  s = fixQuotes(s)

  /* 步骤4 & 5：识别节号并拆分经文 */
  const { title, verses } = splitVerses(s)

  /* 步骤6 & 7：逐节精修并生成阅读格式 */
  const formatted = verses.map(v => {
    let content = v.text

    /* 引语识别 */
    content = fixSpeechQuotes(content)

    /* 确保句末有标点 */
    content = ensureEndPunctuation(content)

    /* 插入全角空格 */
    content = insertReadingSpaces(content)

    return v.num + content
  })

  /* 组装输出 */
  const lines = []
  if (title) lines.push(title)
  lines.push(...formatted)

  return lines.join('\n')
}

/* 保持旧函数名兼容 */
export const formatBibleForApp = formatBibleText

/* ========== 和合本尊称格式：「神」前加全角空格 ========== */

/**
 * 不需要加空格的含「神」复合词（非指向上帝的用法）
 */
const NON_DIVINE_SHEN = /[精鬼众假邪偶财灶门瘟雷风火水河海山战女天守护]神|神经|神话|神奇|神秘|神仙|神像|神庙|神殿|神坛|出神|凝神|费神|劳神|留神|提神|安神|伤神|怡神/

/**
 * 在「神」字前添加全角空格（和合本尊称格式）
 * 规则：
 *   - 「神」指向上帝时，前面加全角空格 U+3000
 *   - 已有全角空格则不重复添加
 *   - 复合词中的「神」不加（如精神、鬼神、神经等）
 *   - 经文开头的「神」也加空格
 *
 * @param {string} text - 经文文本（不含节号）
 * @returns {string} 处理后的文本
 */
export function addHonorificSpace(text) {
  if (!text || !text.includes('神')) return text

  let result = ''
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '神') {
      result += text[i]
      continue
    }

    /* 检查前后文是否构成非尊称复合词 */
    const contextStart = Math.max(0, i - 2)
    const contextEnd = Math.min(text.length, i + 3)
    const context = text.slice(contextStart, contextEnd)
    if (NON_DIVINE_SHEN.test(context)) {
      result += '神'
      continue
    }

    /* 前面已经有全角空格则跳过 */
    if (i > 0 && text[i - 1] === '\u3000') {
      result += '神'
      continue
    }

    /* 添加全角空格 */
    result += '\u3000神'
  }

  return result
}

/**
 * 批量处理：将整章经文数组格式化
 *
 * @param {Array<{verse: number, text: string}>} verses - 经文数组
 * @returns {Array<{verse: number, text: string}>} 格式化后的经文数组
 */
export function formatVersesForApp(verses) {
  if (!verses || verses.length === 0) return []

  /* 把所有经文拼成原始文本，去掉文本开头的重复节号 */
  const rawText = verses.map(v => {
    const num = v.verse || v.number || ''
    let text = (v.text || v.content || '').trim()
    /* 去掉文本开头已有的节号，避免 "1" + "1经文" = "11经文" */
    if (num) {
      text = text.replace(new RegExp('^' + num + '\\s*'), '')
    }
    return num + text
  }).join('')

  /* 用主函数整理 */
  const formatted = formatBibleText(rawText)

  /* 解析回数组 */
  const lines = formatted.split('\n').filter(l => l.trim())
  const result = []
  for (const line of lines) {
    const m = line.match(/^(\d+)(.+)$/)
    if (m) {
      /* Canonical Data: text 不包含节号 */
      result.push({ verse: parseInt(m[1]), text: m[2].trim() })
    }
    /* 标题行跳过（不以数字开头） */
  }

  return result
}
