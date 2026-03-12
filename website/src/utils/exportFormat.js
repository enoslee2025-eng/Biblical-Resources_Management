/**
 * 导出格式转换器
 * 将平台内部数据结构转为主内圣经 APP 兼容的 JSON 格式
 *
 * 支持三种资源类型：
 *   - 圣经译本（convertBibleToAppFormat）
 *   - 圣经注释（convertCommentaryToAppFormat）
 *   - 词典（convertDictionaryToAppFormat）
 */

import { BIBLE_VERSE_COUNTS } from './fileImport'

/* ============================================================
 *  圣经标准书卷信息（66 卷）
 * ============================================================ */

/** 旧约书卷分类（摩西五经、历史书、诗歌书、大先知书、小先知书） */
const OLD_TESTAMENT_GROUPS = [
  { t: '摩西五经', i: [1, 2, 3, 4, 5] },
  { t: '历史书', i: [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17] },
  { t: '诗歌智慧书', i: [18, 19, 20, 21, 22] },
  { t: '大先知书', i: [23, 24, 25, 26, 27] },
  { t: '小先知书', i: [28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39] }
]

/** 新约书卷分类（福音书、历史书、保罗书信、普通书信、启示录） */
const NEW_TESTAMENT_GROUPS = [
  { t: '福音书', i: [40, 41, 42, 43] },
  { t: '历史书', i: [44] },
  { t: '保罗书信', i: [45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57] },
  { t: '普通书信', i: [58, 59, 60, 61, 62, 63, 64, 65] },
  { t: '启示录', i: [66] }
]

/** 66 卷书的标准缩写（中文） */
const BOOK_ABBRS = [
  '创', '出', '利', '民', '申', '书', '士', '得',
  '撒上', '撒下', '王上', '王下', '代上', '代下',
  '拉', '尼', '斯', '伯', '诗', '箴', '传', '歌',
  '赛', '耶', '哀', '结', '但',
  '何', '珥', '摩', '俄', '拿', '弥', '鸿', '哈', '番', '该', '亚', '玛',
  '太', '可', '路', '约', '徒',
  '罗', '林前', '林后', '加', '弗', '腓', '西',
  '帖前', '帖后', '提前', '提后', '多', '门',
  '来', '雅', '彼前', '彼后', '约壹', '约贰', '约叁', '犹', '启'
]

/* ============================================================
 *  圣经导出格式转换
 * ============================================================ */

/**
 * 将平台内部的圣经数据转为主内圣经 APP 导入格式
 *
 * @param {Object} meta 元数据 { title, abbr, iso, summary, tips, version, ttf, ... }
 * @param {Array} books 内部书卷数组 [{ name, abbr, chapters: [{ chapter, verses: [{ verse, text }] }] }]
 * @returns {Object} APP 兼容的 JSON 对象
 */
export function convertBibleToAppFormat(meta, books) {
  const result = {}

  /* ---- 基本元数据 ---- */
  result.id = meta.id || `bible_${(meta.abbr || 'custom').toLowerCase().replace(/\s+/g, '_')}`
  result.title = meta.title || ''
  result.abbr = meta.abbr || ''
  result.iso = meta.iso || 'CN'
  result.summary = meta.summary || ''
  result.tips = meta.tips || ''
  result.version = meta.version || 1
  result.ttf = meta.ttf || ''
  result.infos = meta.infos !== undefined ? Boolean(meta.infos) : false
  result.addis = meta.addis || 0
  result.page = meta.page !== undefined ? Boolean(meta.page) : false
  result.odir = meta.odir || 0
  result.ndir = meta.ndir || 0
  result.oldt = 39
  result.newt = 27

  /* ---- 书卷分类 ---- */
  result.oldtBooks = OLD_TESTAMENT_GROUPS
  result.newtBooks = NEW_TESTAMENT_GROUPS

  /* ---- 构建核心数据 ---- */
  const catalogs = []
  const booksDict = {}
  const bookIndex = {}
  const contentIndex = {}
  const content = {}

  let globalChapterKey = 0
  let totalChapters = 0
  let totalVerses = 0

  for (let bookIdx = 0; bookIdx < 66 && bookIdx < books.length; bookIdx++) {
    const book = books[bookIdx]
    const bookNum = bookIdx + 1
    const bookName = book.name || `书卷${bookNum}`
    const bookAbbr = book.abbr || BOOK_ABBRS[bookIdx] || bookName.substring(0, 2)
    const isOT = bookIdx < 39
    const verseCounts = BIBLE_VERSE_COUNTS[bookIdx] || []

    /* 是否包含简介章（简介作为 chapter 0） */
    const hasInfo = result.infos && book.chapters?.[0]?.chapter === 0
    const chapterOffset = hasInfo ? 0 : 1
    const standardChapterCount = verseCounts.length
    const totalBookChapters = standardChapterCount + (hasInfo ? 1 : 0)

    /* ---- books 字典 ---- */
    booksDict[`k${bookNum}`] = bookName
    booksDict[`km${bookNum}`] = bookAbbr
    booksDict[`kc${bookNum}`] = totalBookChapters
    booksDict[`ks${bookNum}`] = globalChapterKey

    /* ---- catalog 条目 ---- */
    const catalogEntry = {
      b: bookNum,
      t: isOT ? 0 : 1,
      bn: bookName,
      bm: bookAbbr,
      p: 0,
      c: totalBookChapters,
      i: globalChapterKey,
      cs: []
    }

    /* 简介章（如果有） */
    if (hasInfo) {
      const infoChapter = book.chapters[0]
      const infoVerses = infoChapter?.verses || []

      bookIndex[`k${globalChapterKey}`] = bookNum
      contentIndex[`b${bookNum}c0`] = globalChapterKey

      catalogEntry.cs.push({
        id: 0,
        vs: infoVerses.length,
        ts: []
      })

      content[`k${globalChapterKey}`] = _buildChapterContent(bookNum, 0, infoVerses, 0)
      globalChapterKey++
      totalChapters++
    }

    /* 正文章节 */
    for (let chIdx = 0; chIdx < standardChapterCount; chIdx++) {
      const chapterNum = chIdx + 1
      const dataChIdx = hasInfo ? chIdx + 1 : chIdx
      const chapter = book.chapters?.[dataChIdx]
      const verses = chapter?.verses || []

      bookIndex[`k${globalChapterKey}`] = bookNum
      contentIndex[`b${bookNum}c${chapterNum}`] = globalChapterKey

      catalogEntry.cs.push({
        id: chapterNum,
        vs: verses.length,
        ts: _extractTitles(verses)
      })

      content[`k${globalChapterKey}`] = _buildChapterContent(bookNum, chapterNum, verses, 0)
      totalVerses += verses.length
      globalChapterKey++
      totalChapters++
    }

    catalogs.push(catalogEntry)
  }

  result.chapters = totalChapters
  result.verses = totalVerses
  result.catalogs = catalogs
  result.books = booksDict
  result.bookIndex = bookIndex
  result.contentIndex = contentIndex
  result.content = content

  /* ---- 页码索引（按章生成） ---- */
  const pageIndex = _buildPageIndex(catalogs, contentIndex)
  result.oldtPage = pageIndex.oldtPage
  result.newtPage = pageIndex.newtPage

  /* ---- 附录 ---- */
  result.appendixCatalogs = meta.appendixCatalogs || []
  result.appendixMaps = meta.appendixMaps || {}
  result.appendixStyle = meta.appendixStyle || ''
  result.appendixScript = meta.appendixScript || ''

  return result
}

/**
 * 去除富文本标签，返回纯文本
 * 保留的标签: <u>人名</u> <r>地名</r> <m>备注</m> <i>原文补充</i> <l>经文链接</l>
 * t 字段需要纯文本（无标签），d.d 字段保留标签
 *
 * @private
 * @param {string} text 可能含标签的文本
 * @returns {string} 纯文本
 */
function _stripTags(text) {
  if (!text) return ''
  return text.replace(/<\/?[urimbl]>/g, '').replace(/<\/?[a-z]+>/gi, '')
}

/**
 * 检测文本是否为诗歌/引语格式
 * 规则：包含多行（\n 分隔）且行数 >= 2
 *
 * @private
 * @param {string} text 经文文本
 * @returns {boolean}
 */
function _isPoetry(text) {
  if (!text) return false
  const lines = text.split('\n').filter(l => l.trim())
  return lines.length >= 2
}

/**
 * 构建单章 content 对象
 * 根据导出规范，将经文解析为富文本片段数组
 *
 * 片段格式类型（f 字段）：
 *   0=正文, 1=诗句, 2=标题, 3=链接, 4=副标题
 *
 * 片段 t 字段 = 缩进级别（0=不缩进, 1=一级, 2=二级）
 * 片段 b 字段 = 该片段前的换行次数（0=不换行, 1=换一行, 2=空一行）
 *
 * 支持的特殊标签（保留在 d.d 文本中，t 字段为纯文本）：
 *   <u>人名</u> <r>地名</r> <m>备注</m> <i>原文补充</i>
 *   <l>{{[{"b":1,"c":1,"v":"1,3,5-7"}]}}经文链接{{}}</l>
 *
 * @private
 * @param {number} bookNum 书卷编号
 * @param {number} chapterNum 章号（0=简介）
 * @param {Array} verses 经节数组
 * @param {number} startPage 起始页码
 * @returns {Object} content 章对象
 */
function _buildChapterContent(bookNum, chapterNum, verses, startPage) {
  const isIntro = chapterNum === 0

  const vs = verses.map((v, idx) => {
    const isNewParagraph = idx === 0 ? 1 : 0
    const rawText = v.text || ''

    if (isIntro) {
      /* 简介章：纯文本按段落拆分，首段作为标题(f=2)，其余作为正文(f=0) */
      const fragments = []
      if (idx === 0) {
        fragments.push({ f: 2, t: 0, b: 1, d: rawText || '简介' })
      } else {
        fragments.push({ f: 0, t: 0, b: 2, d: rawText })
      }

      return {
        v: v.verse || idx + 1,
        g: 0,
        b: 0,
        p: startPage,
        lr: 0,
        t: '',
        d: fragments
      }
    }

    /* ---- 正文章节 ---- */
    const fragments = []
    let bodyText = rawText
    let titleText = ''

    /* 检测段落标题【...】 */
    const titleMatch = rawText.match(/^【(.+?)】\s*/)
    if (titleMatch) {
      titleText = titleMatch[1]
      bodyText = rawText.substring(titleMatch[0].length)
      /* 标题片段：f=2，新段落 b=1 */
      fragments.push({ f: 2, t: 0, b: 1, d: titleText })
    }

    /* 检测诗歌/引语格式（多行文本用 \n 分隔） */
    if (_isPoetry(bodyText)) {
      const lines = bodyText.split('\n').filter(l => l.trim())
      /* 第一行前面可能有散文引导 */
      const firstLine = lines[0].trim()
      /* 判断第一行是否是引语的引导部分（如"那人说："） */
      const quoteLeadMatch = firstLine.match(/^(.+?[：:""「])\s*$/)
      if (quoteLeadMatch) {
        /* 引导语作为正文 f=0 */
        fragments.push({ f: 0, t: 0, b: titleText ? 0 : isNewParagraph, d: firstLine })
        /* 后续行作为诗句 f=1，缩进 t=2 */
        for (let i = 1; i < lines.length; i++) {
          fragments.push({ f: 1, t: 2, b: 1, d: lines[i].trim() })
        }
      } else {
        /* 所有行作为诗句 f=1 */
        lines.forEach((line, i) => {
          const breakBefore = i === 0 ? (titleText ? 0 : isNewParagraph) : 1
          fragments.push({ f: 1, t: 2, b: breakBefore, d: line.trim() })
        })
      }
    } else if (bodyText) {
      /* 普通正文 f=0 */
      fragments.push({ f: 0, t: 0, b: titleText ? 0 : isNewParagraph, d: bodyText })
    }

    /* t 字段：纯文本（去除标签），标题+空格+正文 */
    const plainBody = _stripTags(bodyText)
    const combinedText = titleText ? `${titleText} ${plainBody}` : _stripTags(rawText)

    return {
      v: v.verse || idx + 1,
      g: 0,
      b: isNewParagraph,
      p: startPage,
      lr: 0,
      t: combinedText,
      d: fragments
    }
  })

  return {
    bid: bookNum,
    cid: chapterNum,
    p: startPage,
    vs
  }
}

/**
 * 从经文中提取段落标题
 * 约定：经文以 【标题】 开头时提取为该节的段落标题
 *
 * @private
 * @param {Array} verses 经节数组
 * @returns {Array} 标题数组 [{ i: 起始节数, t: 标题文本 }]
 */
function _extractTitles(verses) {
  const titles = []
  for (const v of verses) {
    if (!v.text) continue
    /* 检测 【...】 格式的段落标题 */
    const match = v.text.match(/^【(.+?)】/)
    if (match) {
      titles.push({ i: v.verse || 1, t: match[1] })
    }
  }
  return titles
}

/**
 * 生成页码索引
 * 按简单规则：每章占一页，旧约和新约分别编页
 *
 * @private
 * @param {Array} catalogs 书卷目录数组
 * @param {Object} contentIndex 内容索引 b{n}c{n} → 全局章键
 * @returns {{ oldtPage: Object, newtPage: Object }} 旧约/新约页码索引
 */
function _buildPageIndex(catalogs, contentIndex) {
  const oldtPage = {}
  const newtPage = {}
  let oldtPageNum = 1
  let newtPageNum = 1

  for (const cat of catalogs) {
    const isOT = cat.t === 0
    for (const ch of cat.cs) {
      const key = `b${cat.b}c${ch.id}`
      const globalKey = contentIndex[key]
      if (globalKey === undefined) continue

      if (isOT) {
        const pageKey = `p${oldtPageNum}`
        if (!oldtPage[pageKey]) oldtPage[pageKey] = []
        oldtPage[pageKey].push(globalKey)
        oldtPageNum++
      } else {
        const pageKey = `p${newtPageNum}`
        if (!newtPage[pageKey]) newtPage[pageKey] = []
        newtPage[pageKey].push(globalKey)
        newtPageNum++
      }
    }
  }

  return { oldtPage, newtPage }
}

/* ============================================================
 *  注释导出格式转换
 * ============================================================ */

/**
 * 将平台内部的注释数据转为主内圣经 APP 导入格式
 *
 * @param {Object} meta 元数据
 * @param {Array} entries 注释条目数组（内部格式）
 *   每个条目: { bookIndex, chapterIndex, verses: "1,2,3", content: "HTML", type: "direct"|"ref" }
 * @returns {Object} APP 兼容的 JSON 对象
 */
export function convertCommentaryToAppFormat(meta, entries) {
  const result = {}

  /* ---- 基本元数据 ---- */
  result.id = meta.id || `comment_${(meta.abbr || 'custom').toLowerCase().replace(/\s+/g, '_')}`
  result.title = meta.title || ''
  result.abbr = meta.abbr || ''
  result.version = meta.version || 0
  result.iso = meta.iso || 'CN'
  result.summary = meta.summary || ''
  result.tips = meta.tips || ''

  /* ---- 按章节分组 ---- */
  const contentMap = {}
  const linksMap = {}
  let linkCounter = 0

  if (Array.isArray(entries)) {
    for (const entry of entries) {
      const bookNum = (entry.bookIndex || 0) + 1
      const chapterNum = entry.chapterIndex || 0
      const key = `b${bookNum}c${chapterNum}`

      if (!contentMap[key]) contentMap[key] = []

      /* 构建经节关联字符串 */
      let verseStr = ''
      if (entry.verses) {
        const verseNums = String(entry.verses).split(',').map(s => s.trim()).filter(Boolean)
        verseStr = verseNums.map(n => `#${n};`).join('')
      }

      const item = {
        v: verseStr,
        r: 0,
        c: entry.content || '',
        ls: []
      }

      /* 如果有脚注或链接，添加到 links */
      if (entry.links && Array.isArray(entry.links)) {
        for (const link of entry.links) {
          linkCounter++
          const linkKey = `n-${bookNum}-${chapterNum}-${linkCounter}`
          linksMap[linkKey] = { c: link.content || '', ls: [] }
          item.ls.push(linkKey)
        }
      }

      contentMap[key].push(item)
    }
  }

  result.content = contentMap
  result.links = linksMap
  result.style = meta.style || '<style>* { max-width:100%; }</style>'
  result.script = meta.script || ''
  result.linksTemplate = ''

  return result
}

/* ============================================================
 *  词典导出格式转换
 * ============================================================ */

/**
 * 将平台内部的词典数据转为主内圣经 APP 导入格式
 *
 * @param {Object} meta 元数据
 * @param {Array} entries 词条数组（内部格式）
 *   每个条目: { word, definition } 或 { title, content }
 * @returns {Object} APP 兼容的 JSON 对象
 */
export function convertDictionaryToAppFormat(meta, entries) {
  const result = {}

  /* ---- 基本元数据 ---- */
  result.id = meta.id || `dict_${(meta.abbr || 'custom').toLowerCase().replace(/\s+/g, '_')}`
  result.title = meta.title || ''
  result.abbr = meta.abbr || ''
  result.version = meta.version || 1
  result.iso = meta.iso || 'CN'
  result.summary = meta.summary || ''
  result.tips = meta.tips || ''

  /* ---- 词条内容 ---- */
  const contentArr = []

  if (Array.isArray(entries)) {
    entries.forEach((entry, idx) => {
      const title = entry.word || entry.title || entry.t || `词条${idx + 1}`
      const body = entry.definition || entry.content || entry.b || ''

      /* 如果 body 不是 HTML，包装为 HTML */
      const htmlBody = body.startsWith('<') ? body : `<h3 style="text-align:center">${title}</h3><p>${body}</p>`

      contentArr.push({
        id: `k${idx + 1}`,
        t: title,
        b: htmlBody
      })
    })
  }

  result.content = contentArr
  result.style = meta.style || '<style>* { max-width:100%; }</style>'
  result.script = meta.script || ''

  return result
}

/* ============================================================
 *  导入二维码 URL 生成
 * ============================================================ */

/**
 * 生成资源导入二维码的 URL 内容
 *
 * @param {string} type 资源类型：bible | commentary | dictionary
 * @param {number|string} resourceId 资源 ID
 * @param {string} apiBaseUrl API 基础地址（如 https://example.com）
 * @returns {string} 二维码 URL
 */
export function buildImportQrUrl(type, resourceId, apiBaseUrl) {
  /* type 映射：0=圣经, 1=注释, 2=词典 */
  const typeMap = { bible: 0, commentary: 1, dictionary: 2 }
  const typeNum = typeMap[type] ?? 0

  /* 构建 get 参数：获取资源元数据和下载地址（AuidA 是用户 ID 占位符） */
  const getUrl = `${apiBaseUrl}/public/api/resource/download-info/${resourceId}?uid=AuidA`

  return `https://zhuneiqr.com/index.html?page=open-import-resource-end&type=${typeNum}&get=${encodeURIComponent(getUrl)}`
}
