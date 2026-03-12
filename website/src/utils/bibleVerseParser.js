/**
 * BibleVerseParser — Scripture Structural Parsing Pipeline v2
 *
 * 核心原则：
 *   1. 不修改原始导入文本
 *   2. 不在 text 字段存储节号
 *   3. verse number 只存在结构字段
 *   4. parser 支持 inline verse detection
 *   5. fallback 不能生成假 verse
 *   6. 非经文内容必须被过滤
 *
 * 处理流程（10 步）：
 *   Step 1:  Source Text Acquisition       — 获取原始文本
 *   Step 2:  Text Normalization            — 标准化文本
 *   Step 3:  Verse Candidate Detection     — 识别节号候选
 *   Step 4:  Inline Verse Segmentation     — 内联节号切分
 *   Step 5:  Continuation Line Assignment  — 续行归并
 *   Step 6:  Non-Scripture Filtering       — 非经文过滤
 *   Step 7:  Punctuation Restoration       — 标点修复
 *   Step 8:  Speech Pattern Detection      — 对话结构检测
 *   Step 9:  Structural Validation         — 结构校验
 *   Step 10: Canonical Verse Structure     — 输出标准数据
 *
 * 输出格式：
 *   {
 *     book: string,
 *     chapters: [{ chapter: number, verses: [{ verse: number, text: string }] }],
 *     needsManualReview: boolean
 *   }
 *
 * Canonical Data Structure:
 *   { verse: 3, text: "神说："要有光。"" }
 *   禁止: { verse: 3, text: "3神说..." }
 */

/* ================================================================
 *  66 卷书名 + 别名
 * ================================================================ */

const BOOK_NAMES = [
  '创世记', '出埃及记', '利未记', '民数记', '申命记',
  '约书亚记', '士师记', '路得记', '撒母耳记上', '撒母耳记下',
  '列王纪上', '列王纪下', '历代志上', '历代志下', '以斯拉记',
  '尼希米记', '以斯帖记', '约伯记', '诗篇', '箴言',
  '传道书', '雅歌', '以赛亚书', '耶利米书', '耶利米哀歌',
  '以西结书', '但以理书', '何西阿书', '约珥书', '阿摩司书',
  '俄巴底亚书', '约拿书', '弥迦书', '那鸿书', '哈巴谷书',
  '西番雅书', '哈该书', '撒迦利亚书', '玛拉基书',
  '马太福音', '马可福音', '路加福音', '约翰福音', '使徒行传',
  '罗马书', '哥林多前书', '哥林多后书', '加拉太书', '以弗所书',
  '腓立比书', '歌罗西书', '帖撒罗尼迦前书', '帖撒罗尼迦后书',
  '提摩太前书', '提摩太后书', '提多书', '腓利门书', '希伯来书',
  '雅各书', '彼得前书', '彼得后书', '约翰一书', '约翰二书',
  '约翰三书', '犹大书', '启示录'
]

const BOOK_ALIASES = {
  '创': '创世记', '创世纪': '创世记',
  '出': '出埃及记', '出埃及': '出埃及记',
  '利': '利未记', '利未': '利未记',
  '民': '民数记', '民数': '民数记',
  '申': '申命记', '申命': '申命记',
  '书': '约书亚记', '约书亚': '约书亚记',
  '士': '士师记', '士师': '士师记',
  '得': '路得记', '路得': '路得记',
  '撒上': '撒母耳记上', '撒下': '撒母耳记下',
  '王上': '列王纪上', '王下': '列王纪下',
  '代上': '历代志上', '代下': '历代志下',
  '拉': '以斯拉记', '尼': '尼希米记', '斯': '以斯帖记',
  '伯': '约伯记', '诗': '诗篇', '箴': '箴言',
  '传': '传道书', '歌': '雅歌',
  '赛': '以赛亚书', '耶': '耶利米书', '哀': '耶利米哀歌',
  '结': '以西结书', '但': '但以理书',
  '何': '何西阿书', '珥': '约珥书', '摩': '阿摩司书',
  '俄': '俄巴底亚书', '拿': '约拿书', '弥': '弥迦书',
  '鸿': '那鸿书', '哈': '哈巴谷书', '番': '西番雅书',
  '该': '哈该书', '亚': '撒迦利亚书', '玛': '玛拉基书',
  '太': '马太福音', '可': '马可福音', '路': '路加福音',
  '约': '约翰福音', '徒': '使徒行传',
  '罗': '罗马书', '林前': '哥林多前书', '林后': '哥林多后书',
  '加': '加拉太书', '弗': '以弗所书', '腓': '腓立比书',
  '西': '歌罗西书', '帖前': '帖撒罗尼迦前书', '帖后': '帖撒罗尼迦后书',
  '提前': '提摩太前书', '提后': '提摩太后书',
  '多': '提多书', '门': '腓利门书', '来': '希伯来书',
  '雅': '雅各书', '彼前': '彼得前书', '彼后': '彼得后书',
  '约壹': '约翰一书', '约贰': '约翰二书', '约叁': '约翰三书',
  '犹': '犹大书', '启': '启示录', '启示': '启示录',
  'Genesis': '创世记', 'Gen': '创世记',
  'Exodus': '出埃及记', 'Exod': '出埃及记',
  'Psalms': '诗篇', 'Psalm': '诗篇',
  'Revelation': '启示录', 'Rev': '启示录'
}

/* ================================================================
 *  Step 2: Text Normalization
 * ================================================================ */

/**
 * 标准化文本：统一换行、清理乱码、统一标点
 * 不修改语义内容
 */
function normalizeText(text) {
  let s = text

  /* CRLF → LF */
  s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  /* 去掉常见乱码符号 */
  s = s.replace(/[□■◆◇○●△▽☆★]+/g, '')

  /* 去掉页码标记（如 -12- 或 [p.12]） */
  s = s.replace(/[ \t]*[-–—][ \t]*\d+[ \t]*[-–—][ \t]*/g, ' ')

  /* 全角英文标点 → 中文标点 */
  s = s.replace(/\uff0c/g, '，')
  s = s.replace(/\uff0e/g, '。')
  s = s.replace(/\uff1b/g, '；')
  s = s.replace(/\uff1a/g, '：')
  s = s.replace(/\uff1f/g, '？')
  s = s.replace(/\uff01/g, '！')

  /* 半角英文标点 → 中文标点（仅在中文语境中） */
  s = s.replace(/(?<=[\u4e00-\u9fff\u201d\u300d）》」』])[ \t]*,[ \t]*/g, '，')
  s = s.replace(/(?<=[\u4e00-\u9fff\u201d\u300d）》」』])[ \t]*\.[ \t]*/g, '。')
  s = s.replace(/(?<=[\u4e00-\u9fff\u201d\u300d）》」』])[ \t]*;[ \t]*/g, '；')
  s = s.replace(/(?<=[\u4e00-\u9fff\u201d\u300d）》」』])[ \t]*\?[ \t]*/g, '？')
  s = s.replace(/(?<=[\u4e00-\u9fff\u201d\u300d）》」』])[ \t]*![ \t]*/g, '！')
  s = s.replace(/,[ \t]*(?=[\u4e00-\u9fff\u201c\u300c（《「『])/g, '，')
  s = s.replace(/\.[ \t]*(?=[\u4e00-\u9fff\u201c\u300c（《「『])/g, '。')

  /* 半角冒号 → 中文冒号（排除 数字:数字 引用格式） */
  s = s.replace(/(?<!\d)[ \t]*:[ \t]*(?!\d)/g, '：')

  /* 英文双引号 → 中文双引号 */
  let qCount = 0
  s = s.replace(/"/g, () => {
    qCount++
    return qCount % 2 === 1 ? '\u201c' : '\u201d'
  })

  /* 连续重复标点修复 */
  s = s.replace(/。{2,}/g, '。')
  s = s.replace(/，{2,}/g, '，')

  /* 冗余标点组合修复（如 ：。 → ： ，。 → ，） */
  s = s.replace(/([：，；、])。/g, '$1')
  s = s.replace(/。([：，；、])/g, '$1')

  /* 连续空格压缩（保留全角空格 U+3000） */
  s = s.replace(/[ \t]{2,}/g, ' ')

  return s
}

/**
 * 清理单行文本：去掉 CJK 间多余半角空格（保留全角空格 U+3000）
 */
function cleanLine(text) {
  let s = text.replace(/^[ \t\n\r]+/, '').replace(/[ \t\n\r]+$/, '')

  /* CJK 字符之间的半角空格删除 */
  const cjk = '[\u4e00-\u9fff\u3001-\u303f\uff00-\uffef]'
  const re = new RegExp('(' + cjk + ')[ \\t]+(' + cjk + ')', 'g')
  let prev = ''
  while (prev !== s) {
    prev = s
    s = s.replace(re, '$1$2')
  }

  /* 标点前后半角空格删除 */
  s = s.replace(/[ \t]+([，。；：？！、）》」』\u201d])/g, '$1')
  s = s.replace(/([（《「『\u201c])[ \t]+/g, '$1')

  return s
}

/* ================================================================
 *  Step 6: Non-Scripture Filtering
 * ================================================================ */

/** 罗马数字正则 */
const ROMAN_NUMERAL_RE = /^[ivxlcdm]+$/i

function isRomanNumeral(s) {
  return ROMAN_NUMERAL_RE.test(s) && s.length <= 8
}

/** 交叉引用正则：书卷名 + 章:节 格式 */
const CROSS_REF_RE = /[\u4e00-\u9fff]{2,6}\s*\d+:\d+(?:[-–]\d+)?/

/**
 * 判断一行是否为非经文内容
 */
function isNonScriptureContent(line) {
  const t = line.trim()
  if (!t) return true

  /* 纯罗马数字 */
  if (isRomanNumeral(t)) return true

  /* 纯脚注符号 */
  if (/^[*†‡※＊]+$/.test(t)) return true
  if (/^\[?\d+\]$/.test(t)) return true
  if (/^〔\d+〕$/.test(t)) return true
  if (/^\(\d+\)$/.test(t)) return true

  /* Reference Header（多个引用） */
  const crossRefMatches = t.match(new RegExp(CROSS_REF_RE.source, 'g'))
  if (crossRefMatches && crossRefMatches.length >= 2) return true

  /* 纯交叉引用行 */
  if (CROSS_REF_RE.test(t)) {
    const stripped = t
      .replace(new RegExp(CROSS_REF_RE.source, 'g'), '')
      .replace(/[ivxlcdm]+/gi, '')
      .replace(/[\s\d:,，\-–]+/g, '')
      .trim()
    if (stripped.length < 4) return true
  }

  /* 交叉引用 + 罗马数字 */
  if (CROSS_REF_RE.test(t) && /[ivxlcdm]{2,}/i.test(t)) {
    const stripped = t
      .replace(new RegExp(CROSS_REF_RE.source, 'g'), '')
      .replace(/\b[ivxlcdm]+\b/gi, '')
      .replace(/[\s\d:,，\-–]+/g, '')
      .trim()
    if (stripped.length < 4) return true
  }

  return false
}

/** 引号字符集 */
const Q_OPEN = '[\u201c"\u300c]'
const Q_CLOSE = '[\u201d"\u300d]'
const Q_CONTENT = '[^\u201c\u201d"\u300c\u300d]'

/** 注释/词义解释关键词 */
const GLOSS_KEYWORDS = '(?:意思是|原意是|原意|意思为|即|解释为|就是|亦即|又名|或作|或译)'

const GLOSS_NOTE_FULL_RE = new RegExp(
  '\\d{1,3}:\\d{1,3}\\s*' + Q_OPEN + Q_CONTENT + '+' + Q_CLOSE +
  '\\s*' + GLOSS_KEYWORDS + '\\s*' +
  Q_OPEN + Q_CONTENT + '+' + Q_CLOSE + '[。，；、]?',
  'g'
)

const GLOSS_NOTE_SIMPLE_RE = new RegExp(
  '\\d{1,3}:\\d{1,3}\\s*' + Q_OPEN + Q_CONTENT + '+' + Q_CLOSE +
  '\\s*' + GLOSS_KEYWORDS + '[^。；！？]*[。；]?',
  'g'
)

const REF_EXPLAIN_RE = new RegExp(
  '\\d{1,3}:\\d{1,3}\\s*' + GLOSS_KEYWORDS + '\\s*' +
  Q_OPEN + Q_CONTENT + '+' + Q_CLOSE + '[。，；、]?',
  'g'
)

/** 检测注释行 */
function isAnnotationLine(line) {
  const t = line.trim()
  if (!t) return false

  const hasGloss = GLOSS_NOTE_FULL_RE.test(t) || GLOSS_NOTE_SIMPLE_RE.test(t) || REF_EXPLAIN_RE.test(t)
  GLOSS_NOTE_FULL_RE.lastIndex = 0
  GLOSS_NOTE_SIMPLE_RE.lastIndex = 0
  REF_EXPLAIN_RE.lastIndex = 0

  if (!hasGloss) return false

  const stripped = t
    .replace(GLOSS_NOTE_FULL_RE, '')
    .replace(GLOSS_NOTE_SIMPLE_RE, '')
    .replace(REF_EXPLAIN_RE, '')
    .replace(/[\s，。；：、]+/g, '')
    .trim()

  GLOSS_NOTE_FULL_RE.lastIndex = 0
  GLOSS_NOTE_SIMPLE_RE.lastIndex = 0
  REF_EXPLAIN_RE.lastIndex = 0

  return stripped.length < 4
}

/** 从经文文本中移除内嵌注释 */
function stripAnnotationContent(text) {
  let s = text
  s = s.replace(GLOSS_NOTE_FULL_RE, '')
  GLOSS_NOTE_FULL_RE.lastIndex = 0
  s = s.replace(GLOSS_NOTE_SIMPLE_RE, '')
  GLOSS_NOTE_SIMPLE_RE.lastIndex = 0
  s = s.replace(REF_EXPLAIN_RE, '')
  REF_EXPLAIN_RE.lastIndex = 0
  s = s.replace(/([。；！？\u201d])\s*\d{1,3}:\d{1,3}\s*$/g, '$1')
  return s
}

/** 清理经文文本中的非正文内容 */
function cleanVerseText(text) {
  let s = text
  s = stripAnnotationContent(s)
  s = s.replace(/\s*[*†‡※]\s*/g, '')
  s = s.replace(/\s*\[\d+\]\s*/g, '')
  s = s.replace(/\s*〔\d+〕\s*/g, '')
  s = s.replace(/\s+[ivxlcdm]{1,8}\s+/gi, (match) => {
    const trimmed = match.trim()
    if (isRomanNumeral(trimmed)) return ''
    return match
  })
  return s.replace(/^[ \t\n\r]+/, '').replace(/[ \t\n\r]+$/, '')
}

/* ================================================================
 *  Step 3: Verse Candidate Detection
 *
 *  识别文本中的节号候选，排除引用格式（1:2, 创15:6, xxiv）
 * ================================================================ */

/**
 * 判断给定位置的数字是否为 Verse Candidate
 *
 * 规则：
 *  - 数字 1-176 + 后接中文字符 / 引号 / 全角空格
 *  - 前面不是冒号（排除 章:节 引用）
 *  - 不是 reference pattern（创15:6）
 */
function isVerseCandidate(text, digitStart, digitEnd) {
  const numStr = text.slice(digitStart, digitEnd)
  const num = parseInt(numStr)
  if (isNaN(num) || num < 1 || num > 176) return false

  /* 排除：前面是冒号（章:节 格式） */
  if (digitStart > 0) {
    const prevChar = text[digitStart - 1]
    if (prevChar === ':' || prevChar === '：') return false
  }

  /* 后面必须是中文字符 / 引号 / 全角空格 */
  if (digitEnd < text.length) {
    const nextChar = text[digitEnd]
    /* 允许数字后跟可选空格再跟中文 */
    let checkPos = digitEnd
    while (checkPos < text.length && (text[checkPos] === ' ' || text[checkPos] === '\u3000')) {
      checkPos++
    }
    if (checkPos < text.length) {
      const ch = text[checkPos]
      if (/[\u4e00-\u9fff\u201c\u201d\u300c\u300d"'\uff08（《「『]/.test(ch)) {
        return true
      }
    }
    return false
  }

  return false
}

/* ================================================================
 *  Step 4: Inline Verse Segmentation
 *
 *  支持三种节号模式：
 *    1. 行首节号:  "1起初神创造天地"
 *    2. 行中节号:  "天地。2地是空虚混沌"
 *    3. 紧贴节号:  "天地2地是空虚混沌"
 * ================================================================ */

/**
 * 从一行文本中检测并切分所有内联节号
 *
 * 返回 segment 数组，每个 segment 为：
 *   { verse: number, text: string }  — 有节号
 *   { verse: null,   text: string }  — 无节号（续行文本）
 */
function segmentInlineVerses(line) {
  const segments = []
  const re = /(\d{1,3})/g
  let match
  const candidates = []

  /* 收集所有 verse candidate 位置 */
  while ((match = re.exec(line)) !== null) {
    const digitStart = match.index
    const digitEnd = digitStart + match[1].length
    if (isVerseCandidate(line, digitStart, digitEnd)) {
      candidates.push({ start: digitStart, end: digitEnd, num: parseInt(match[1]) })
    }
  }

  if (candidates.length === 0) {
    /* 无节号 → 整行为续行文本 */
    return [{ verse: null, text: line }]
  }

  /* 第一个候选之前的文本 → 续行 */
  if (candidates[0].start > 0) {
    const prefix = line.slice(0, candidates[0].start).trim()
    if (prefix) {
      segments.push({ verse: null, text: prefix })
    }
  }

  /* 按候选位置切分 */
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i]
    const textStart = c.end
    const textEnd = i + 1 < candidates.length ? candidates[i + 1].start : line.length
    /* 跳过数字后的空格 */
    let actualStart = textStart
    while (actualStart < textEnd && (line[actualStart] === ' ' || line[actualStart] === '\u3000')) {
      actualStart++
    }
    const text = line.slice(actualStart, textEnd).trim()
    segments.push({ verse: c.num, text })
  }

  return segments
}

/* ================================================================
 *  Book / Chapter / Section Detection
 * ================================================================ */

/** 从文本前 20 行识别书卷名 */
function detectBook(lines) {
  const searchLines = lines.slice(0, Math.min(20, lines.length))

  for (const line of searchLines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    for (const name of BOOK_NAMES) {
      if (trimmed === name || trimmed.startsWith(name + ' ') || trimmed.startsWith(name + '\t')) {
        return name
      }
    }

    for (const [alias, name] of Object.entries(BOOK_ALIASES)) {
      if (trimmed === alias || trimmed.startsWith(alias + ' ')) {
        return name
      }
    }

    const headerMatch = trimmed.match(/^([\u4e00-\u9fff]{2,6})\s*\d+:\d+/)
    if (headerMatch) {
      const candidate = headerMatch[1]
      for (const name of BOOK_NAMES) {
        if (name.startsWith(candidate) || candidate === name) return name
      }
      for (const [alias, name] of Object.entries(BOOK_ALIASES)) {
        if (alias === candidate) return name
      }
    }
  }

  return ''
}

/** 判断 PDF 页头 */
function isPageHeader(line, book) {
  if (!line) return false
  const t = line.trim()
  if (/\d+:\d+/.test(t) && /[a-z]/i.test(t)) return true
  if (book && t.includes(book) && /\d+:\d+/.test(t)) return true
  const refs = t.match(new RegExp(CROSS_REF_RE.source, 'g'))
  if (refs && refs.length >= 2) return true
  return false
}

/** 段落标题检测 */
function isSectionTitle(line) {
  const t = line.trim()
  if (!t || t.length > 30) return false
  if (/^\d/.test(t)) return false
  if (/[，。；：？！]/.test(t)) return false
  if (/^[\u4e00-\u9fff\u3000-\u303f\s·]+$/.test(t)) return true
  return false
}

/** 判断书名行 */
function isBookLine(line, book) {
  const t = line.trim()
  if (!t) return false
  if (t === book) return true
  for (const name of BOOK_NAMES) {
    if (t === name) return true
  }
  for (const alias of Object.keys(BOOK_ALIASES)) {
    if (t === alias) return true
  }
  return false
}

/**
 * 章号检测：判断独立数字是否为章号
 */
function isLikelyChapterNum(num, lastVerseNum, lines, startIdx, currentVersesCount) {
  if (currentVersesCount === 0 && lastVerseNum === 0) return false
  if (num === 1) return false

  for (let j = startIdx + 1; j < Math.min(startIdx + 8, lines.length); j++) {
    const next = lines[j].trim()
    if (!next) continue
    if (isSectionTitle(next)) continue
    if (isPageHeader(next, '')) continue
    if (isNonScriptureContent(next)) continue
    if (/^1[\s\u3000]*[\u4e00-\u9fff\u201c\u300c"'\uff08（《「『]/.test(next)) return true
    if (/^1\s*[-–—]\s*\d/.test(next)) return true
    if (next === '1') return true
    break
  }

  if (lastVerseNum > 0 && num < lastVerseNum - 2) return true

  return false
}

/* ================================================================
 *  Step 7: Punctuation Restoration
 * ================================================================ */

/**
 * 修复经文标点：
 *  - 句尾缺句号时补充
 *  - 检测连续中文无标点的长片段
 */
function restorePunctuation(text) {
  let s = text.trim()
  if (!s) return s

  /* 句尾补句号（如果不以标点结尾）
   * 合法结尾：所有中文标点、引号、括号等 */
  if (!/[。！？；：，、」』\u201d\u2019）》\u300d\u300f]$/.test(s)) {
    s += '。'
  }

  return s
}

/* ================================================================
 *  Step 8: Speech Pattern Detection
 * ================================================================ */

/**
 * 检测对话模式并补充引号
 *
 * 识别 "X说" / "X说：" 后面缺少引号的情况
 */
function detectSpeechPatterns(text) {
  let s = text

  /* "X说" + 无引号 → 补充引号
   * 匹配：说/说：后面紧跟中文但没有开引号 */
  s = s.replace(
    /((?:神|耶和华|主|他|她|我|你|他们|她们|我们|你们|摩西|耶稣|大卫|雅各|亚伯拉罕|以撒)说)(?:：)?(?!\u201c|「)([\u4e00-\u9fff])/g,
    (match, speaker, firstChar) => {
      return speaker + '：\u201c' + firstChar
    }
  )

  return s
}

/* ================================================================
 *  Steps 3-5 合并执行：解析文本行为结构化章节数据
 *
 *  核心流程：
 *    1. 逐行扫描
 *    2. 对每行做 Verse Candidate Detection
 *    3. 执行 Inline Verse Segmentation
 *    4. 无节号行归入上一节（Continuation Line Assignment）
 *    5. 过滤非经文内容
 * ================================================================ */

function parseStructuredChapters(lines, book) {
  const chapters = []
  let currentVerses = []
  let currentChapter = 0
  let currentTitle = ''
  let lastVerseNum = 0
  /** 段落标题集合：{ verseNum: "标题文字" }，key 为标题出现在哪节经文之前 */
  let currentSectionHeadings = {}
  /** 暂存的段落标题（等待下一节经文确定位置） */
  let pendingHeading = ''

  function saveCurrentChapter() {
    if (currentVerses.length > 0) {
      const ch = { chapter: currentChapter || chapters.length + 1, verses: currentVerses }
      if (currentTitle) ch.title = currentTitle
      if (Object.keys(currentSectionHeadings).length > 0) {
        ch.sectionHeadings = { ...currentSectionHeadings }
      }
      chapters.push(ch)
    }
    currentVerses = []
    currentTitle = ''
    currentSectionHeadings = {}
    pendingHeading = ''
    lastVerseNum = 0
  }

  function handleNewChapter(verseNum, explicitChapter) {
    if (verseNum === 1 && lastVerseNum > 0 && currentVerses.length > 0) {
      saveCurrentChapter()
    }
    if (explicitChapter) {
      currentChapter = explicitChapter
    } else if (verseNum === 1 && currentChapter === 0) {
      currentChapter = chapters.length + 1
    }
  }

  /** 将暂存的段落标题绑定到即将添加的经文节号 */
  function flushPendingHeading(verseNum) {
    if (pendingHeading) {
      currentSectionHeadings[verseNum] = pendingHeading
      pendingHeading = ''
    }
  }

  /** 追加文本到当前最后一节 */
  function appendToLastVerse(text) {
    if (currentVerses.length > 0 && text) {
      currentVerses[currentVerses.length - 1].text += text
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    /* 跳过 PDF 页头 */
    if (isPageHeader(line, book)) continue

    /* 跳过书名行 */
    if (isBookLine(line, book)) continue

    /* Step 6: 非经文内容过滤 */
    if (isNonScriptureContent(line)) continue

    /* 注释行过滤 */
    if (isAnnotationLine(line)) continue

    /* 段落标题：保存到 sectionHeadings，等待下一节经文确定位置 */
    if (isSectionTitle(line)) {
      if (!currentTitle && currentVerses.length === 0) {
        currentTitle = line
      }
      /* 暂存标题，等下一节经文出现时确定位置 */
      pendingHeading = pendingHeading ? (pendingHeading + '\n' + line) : line
      continue
    }

    /* 纯数字行：检测是章号还是节号 */
    const pureNumMatch = line.match(/^(\d{1,3})$/)
    if (pureNumMatch) {
      const num = parseInt(pureNumMatch[1])

      if (isLikelyChapterNum(num, lastVerseNum, lines, i, currentVerses.length)) {
        saveCurrentChapter()
        currentChapter = num
        continue
      }

      handleNewChapter(num, 0)

      /* 向后查找经文内容（节号独占一行的格式） */
      let verseText = ''
      while (i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim()
        if (!nextLine) { i++; continue }
        if (/^\d{1,3}$/.test(nextLine)) break
        if (/^\d{1,3}\s*[-–—]\s*\d{1,3}/.test(nextLine)) break
        if (/^\d{1,3}[\s\u3000]*[\u4e00-\u9fff\u201c\u300c"'\uff08（《「『]/.test(nextLine)) break
        if (isPageHeader(nextLine, book)) break
        if (isBookLine(nextLine, book)) break
        if (isNonScriptureContent(nextLine)) { i++; continue }
        if (isSectionTitle(nextLine)) { i++; continue }
        verseText += cleanLine(nextLine)
        i++
      }

      if (verseText) {
        flushPendingHeading(num)
        currentVerses.push({ verse: num, text: cleanVerseText(verseText) })
        lastVerseNum = num
      }
      continue
    }

    /* 节范围行（如 "1-2" 或 "3–5"） */
    const rangeMatch = line.match(/^(\d{1,3})\s*[-–—]\s*(\d{1,3})$/)
    if (rangeMatch) {
      const startVerse = parseInt(rangeMatch[1])
      const endVerse = parseInt(rangeMatch[2])
      handleNewChapter(startVerse, 0)

      let verseText = ''
      while (i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim()
        if (!nextLine) { i++; continue }
        if (/^\d{1,3}$/.test(nextLine)) break
        if (/^\d{1,3}\s*[-–—]\s*\d{1,3}/.test(nextLine)) break
        if (/^\d{1,3}[\s\u3000]*[\u4e00-\u9fff\u201c\u300c"'\uff08（《「『]/.test(nextLine)) break
        if (isPageHeader(nextLine, book)) break
        if (isBookLine(nextLine, book)) break
        if (isNonScriptureContent(nextLine)) { i++; continue }
        if (isSectionTitle(nextLine)) { i++; continue }
        verseText += cleanLine(nextLine)
        i++
      }

      if (verseText) {
        const cleaned = cleanVerseText(verseText)
        flushPendingHeading(startVerse)
        for (let v = startVerse; v <= endVerse; v++) {
          currentVerses.push({ verse: v, text: cleaned })
        }
        lastVerseNum = endVerse
      }
      continue
    }

    /* 组合节范围+内容（如 "1-2那时..."） */
    const comboMatch = line.match(/^(\d{1,3})[-–—](\d{1,3})[\s\u3000]*([\u4e00-\u9fff\u201c\u300c"'\uff08（《「『].+)$/)
    if (comboMatch) {
      const startVerse = parseInt(comboMatch[1])
      const endVerse = parseInt(comboMatch[2])
      const text = cleanLine(comboMatch[3])
      const cleaned = cleanVerseText(text)
      handleNewChapter(startVerse, 0)
      flushPendingHeading(startVerse)
      for (let v = startVerse; v <= endVerse; v++) {
        currentVerses.push({ verse: v, text: cleaned })
      }
      lastVerseNum = endVerse
      continue
    }

    /* ======= Step 4: Inline Verse Segmentation =======
     * 对当前行做内联节号检测与切分 */
    const cleaned = cleanLine(line)
    const segments = segmentInlineVerses(cleaned)

    for (const seg of segments) {
      if (seg.verse !== null) {
        /* 有节号的 segment → 新建 verse */
        handleNewChapter(seg.verse, 0)
        flushPendingHeading(seg.verse)
        const text = cleanVerseText(seg.text)
        currentVerses.push({ verse: seg.verse, text })
        lastVerseNum = seg.verse
      } else {
        /* Step 5: Continuation Line Assignment — 无节号 → 追加到上一节 */
        const text = cleanVerseText(seg.text)
        if (text) {
          appendToLastVerse(text)
        }
      }
    }
  }

  /* 保存最后一个章节 */
  if (currentVerses.length > 0) {
    const ch = { chapter: currentChapter || chapters.length + 1, verses: currentVerses }
    if (currentTitle) ch.title = currentTitle
    if (Object.keys(currentSectionHeadings).length > 0) {
      ch.sectionHeadings = { ...currentSectionHeadings }
    }
    chapters.push(ch)
  }

  return chapters
}

/* ================================================================
 *  Step 9: Structural Validation
 * ================================================================ */

/**
 * 校验解析结果的结构完整性
 *
 * 检测：
 *  1. verse number 连续性
 *  2. verse text 非空
 *  3. 是否有残留节号
 *  4. 是否有 cross reference 混入
 *
 * @returns {{ valid: boolean, warnings: string[] }}
 */
function validateStructure(chapters) {
  const warnings = []

  for (const ch of chapters) {
    let prevNum = 0
    for (let i = 0; i < ch.verses.length; i++) {
      const v = ch.verses[i]

      /* 检测空经文 */
      if (!v.text || !v.text.trim()) {
        warnings.push(`第${ch.chapter}章第${v.verse}节：经文为空`)
      }

      /* 检测节号连续性（允许范围节号导致的跳跃） */
      if (v.verse !== prevNum + 1 && prevNum > 0) {
        warnings.push(`第${ch.chapter}章：节号从${prevNum}跳到${v.verse}`)
      }
      prevNum = v.verse

      /* 检测残留节号（text 以数字+中文开头） */
      if (v.text) {
        const residual = v.text.match(/^(\d{1,3})[\u4e00-\u9fff\u201c\u300c"'\u3000]/)
        if (residual) {
          const num = parseInt(residual[1])
          if (num >= 1 && num <= 176) {
            warnings.push(`第${ch.chapter}章第${v.verse}节：text 开头疑似残留节号 "${num}"`)
          }
        }
      }

      /* 检测 cross reference 混入 */
      if (v.text && CROSS_REF_RE.test(v.text)) {
        warnings.push(`第${ch.chapter}章第${v.verse}节：text 中疑似含有交叉引用`)
      }
    }
  }

  return {
    valid: warnings.length === 0,
    warnings
  }
}

/* ================================================================
 *  Step 10: Structured Output (主函数)
 * ================================================================ */

/**
 * 主函数：Scripture Structural Parsing Pipeline
 *
 * @param {string} rawText - 原始文本
 * @returns {{
 *   book: string,
 *   chapters: Array<{ chapter: number, title?: string, verses: Array<{ verse: number, text: string }> }>,
 *   needsManualReview: boolean
 * }}
 */
export function parseBibleText(rawText) {
  if (!rawText || !rawText.trim()) {
    return { book: '', chapters: [], needsManualReview: false }
  }

  /* Step 2: Text Normalization */
  const normalized = normalizeText(rawText)
  const allLines = normalized.split('\n')

  /* Book Detection */
  const book = detectBook(allLines)

  /* Step 6: Non-Scripture Filtering（行级别） */
  const filteredLines = allLines.filter(line => !isNonScriptureContent(line) && !isAnnotationLine(line))

  /* Steps 3-5: Verse Detection + Segmentation + Continuation */
  const chapters = parseStructuredChapters(filteredLines, book)

  /* Step 7: Punctuation Restoration */
  for (const ch of chapters) {
    for (const v of ch.verses) {
      v.text = restorePunctuation(v.text)
    }
  }

  /* Step 8: Speech Pattern Detection（预留，不主动修改） */
  /* 对话模式检测作为辅助信息，不自动修改文本，避免误修改 */

  /* Step 9: Structural Validation */
  const validation = validateStructure(chapters)

  return {
    book,
    chapters,
    needsManualReview: !validation.valid
  }
}

/**
 * 按句子边界拆分合并的经文
 *
 * 当解析结果的节数远少于预期时（如一条 verse 包含了多节经文的文本），
 * 按中文句号/感叹号/问号拆分长文本，重新分配节号。
 *
 * @param {Array<{ verse: number, text: string }>} verses - 解析后的经文
 * @param {number} expectedCount - 该章预期的经文节数
 * @returns {Array<{ verse: number, text: string }>} 拆分后的经文
 */
export function splitMergedVerses(verses, expectedCount) {
  if (!verses || verses.length === 0 || expectedCount <= 0) return verses
  /* 如果已解析节数 >= 预期的 80%，不做拆分 */
  if (verses.length >= expectedCount * 0.8) return verses

  /* 收集所有句子 */
  const rawSentences = []
  for (const v of verses) {
    const text = (v.text || '').trim()
    if (!text) continue
    /* 按句尾标点拆分（保留标点及紧随的闭合引号在句子末尾） */
    const parts = text.match(/[^。！？]+[。！？]+["\u201d\u300d\u300f）》]*/g)
    const remainder = parts ? text.slice(parts.join('').length).trim() : null
    if (parts && parts.length > 1) {
      for (const p of parts) {
        const s = p.trim()
        if (s) rawSentences.push(s)
      }
      /* 末尾无句尾标点的剩余文本 */
      if (remainder) rawSentences.push(remainder)
    } else {
      rawSentences.push(text)
    }
  }

  /* 合并纯标点片段（如孤立的引号 " " 等）到相邻句子 */
  const allSentences = []
  for (const s of rawSentences) {
    if (/^[\s""''「」『』（）《》…—]+$/.test(s) && allSentences.length > 0) {
      /* 纯标点 → 合并到前一个句子末尾 */
      allSentences[allSentences.length - 1] += s
    } else {
      allSentences.push(s)
    }
  }

  if (allSentences.length <= verses.length) return verses

  /* 将句子分配到 expectedCount 个 verse 中 */
  const targetCount = Math.min(expectedCount, allSentences.length)
  const result = []

  if (allSentences.length <= targetCount) {
    /* 句子数 <= 预期节数：每句一节 */
    for (let i = 0; i < allSentences.length; i++) {
      result.push({ verse: i + 1, text: allSentences[i] })
    }
  } else {
    /* 句子数 > 预期节数：均匀分配句子到各节 */
    const sentencesPerVerse = allSentences.length / targetCount
    for (let i = 0; i < targetCount; i++) {
      const startIdx = Math.round(i * sentencesPerVerse)
      const endIdx = Math.round((i + 1) * sentencesPerVerse)
      const text = allSentences.slice(startIdx, endIdx).join('')
      result.push({ verse: i + 1, text })
    }
  }

  return result
}

/**
 * 将解析结果转为扁平 Verse 数组
 */
export function flattenVerses(parsed) {
  const result = []
  for (const ch of parsed.chapters) {
    for (const v of ch.verses) {
      result.push({
        book: parsed.book,
        chapter: ch.chapter,
        verse: v.verse,
        text: v.text
      })
    }
  }
  return result
}

/**
 * 获取解析统计信息
 */
export function getParseStats(parsed) {
  let totalVerses = 0
  for (const ch of parsed.chapters) {
    totalVerses += ch.verses.length
  }
  return {
    book: parsed.book,
    chapterCount: parsed.chapters.length,
    verseCount: totalVerses
  }
}
