/**
 * bibleVerseParser 单元测试
 * 使用 Genesis 1（创世记第一章）作为测试案例
 */
import { describe, it, expect } from 'vitest'
import { parseBibleText, flattenVerses, getParseStats } from '../bibleVerseParser.js'

/* ================================================================
 *  Genesis 1 测试数据
 * ================================================================ */

/** 行首节号格式（每行一节，节号在行首） */
const GENESIS_1_LINE_PER_VERSE = `1起初，　神创造天地。
2地是空虚混沌，渊面黑暗；　神的灵运行在水面上。
3　神说："要有光。"就有了光。
4　神看光是好的，就把光暗分开了。
5　神称光为"昼"，称暗为"夜"。有晚上，有早晨，这是头一日。`

/** 行中节号格式（多节在一行，节号内嵌） */
const GENESIS_1_INLINE = `1起初，　神创造天地。2地是空虚混沌，渊面黑暗；　神的灵运行在水面上。3　神说："要有光。"就有了光。4　神看光是好的，就把光暗分开了。5　神称光为"昼"，称暗为"夜"。有晚上，有早晨，这是头一日。`

/** 节号独占一行格式（PDF 常见） */
const GENESIS_1_STANDALONE_NUMS = `1
起初，　神创造天地。
2
地是空虚混沌，渊面黑暗；　神的灵运行在水面上。
3
　神说："要有光。"就有了光。`

/** 包含非经文内容的文本 */
const GENESIS_1_WITH_NOISE = `创世记
1起初，　神创造天地。
创世记 1:1 xxiv 创世记 1:16
2地是空虚混沌，渊面黑暗；　神的灵运行在水面上。
*
3　神说："要有光。"就有了光。`

/** 无节号纯文本 */
const GENESIS_1_NO_NUMBERS = `起初，　神创造天地。
地是空虚混沌，渊面黑暗；　神的灵运行在水面上。
　神说："要有光。"就有了光。`

/** 节范围格式（如 "1-2"） */
const GENESIS_1_RANGE = `1-2起初，　神创造天地。地是空虚混沌。
3　神说："要有光。"就有了光。`

/* ================================================================
 *  核心原则测试
 * ================================================================ */

describe('核心原则', () => {
  it('text 字段不包含节号', () => {
    const result = parseBibleText(GENESIS_1_LINE_PER_VERSE)
    const verses = result.chapters[0].verses

    for (const v of verses) {
      /* text 不以节号数字开头 */
      expect(v.text).not.toMatch(/^\d+/)
      /* text 不以节号+中文开头 */
      expect(v.text).not.toMatch(/^\d{1,3}[\u4e00-\u9fff\u201c\u300c"'\u3000]/)
    }
  })

  it('verse number 存在于结构字段', () => {
    const result = parseBibleText(GENESIS_1_LINE_PER_VERSE)
    const verses = result.chapters[0].verses

    expect(verses[0].verse).toBe(1)
    expect(verses[1].verse).toBe(2)
    expect(verses[2].verse).toBe(3)
  })

  it('输出包含 needsManualReview 字段', () => {
    const result = parseBibleText(GENESIS_1_LINE_PER_VERSE)
    expect(result).toHaveProperty('needsManualReview')
    expect(typeof result.needsManualReview).toBe('boolean')
  })

  it('空输入返回空结果', () => {
    const result = parseBibleText('')
    expect(result.chapters).toEqual([])
    expect(result.needsManualReview).toBe(false)
  })
})

/* ================================================================
 *  Step 3: Verse Candidate Detection
 * ================================================================ */

describe('Step 3: Verse Candidate Detection', () => {
  it('识别行首节号', () => {
    const result = parseBibleText(GENESIS_1_LINE_PER_VERSE)
    expect(result.chapters[0].verses.length).toBe(5)
  })

  it('排除 chapter:verse 引用格式', () => {
    const text = '1起初，　神创造天地。创世记 1:2 说明了混沌。\n2地是空虚混沌。'
    const result = parseBibleText(text)
    /* "1:2" 不应被识别为节号 2 */
    const verses = result.chapters[0].verses
    expect(verses.length).toBe(2)
    expect(verses[0].verse).toBe(1)
    expect(verses[1].verse).toBe(2)
  })
})

/* ================================================================
 *  Step 4: Inline Verse Segmentation
 * ================================================================ */

describe('Step 4: Inline Verse Segmentation', () => {
  it('行中节号切分（多节在一行）', () => {
    const result = parseBibleText(GENESIS_1_INLINE)
    const verses = result.chapters[0].verses

    expect(verses.length).toBe(5)
    expect(verses[0].verse).toBe(1)
    expect(verses[1].verse).toBe(2)
    expect(verses[2].verse).toBe(3)
    expect(verses[3].verse).toBe(4)
    expect(verses[4].verse).toBe(5)
  })

  it('紧贴节号切分（无空格分隔）', () => {
    const text = '1起初神创造天地2地是空虚混沌3神说要有光'
    const result = parseBibleText(text)
    const verses = result.chapters[0].verses

    expect(verses.length).toBe(3)
    expect(verses[0].verse).toBe(1)
    expect(verses[1].verse).toBe(2)
    expect(verses[2].verse).toBe(3)
  })

  it('句末标点后接节号', () => {
    const text = '1起初，　神创造天地。2地是空虚混沌。3　神说光。'
    const result = parseBibleText(text)
    expect(result.chapters[0].verses.length).toBe(3)
  })
})

/* ================================================================
 *  Step 5: Continuation Line Assignment
 * ================================================================ */

describe('Step 5: Continuation Line Assignment', () => {
  it('节号独占一行 + 续行合并', () => {
    const result = parseBibleText(GENESIS_1_STANDALONE_NUMS)
    const verses = result.chapters[0].verses

    expect(verses.length).toBe(3)
    expect(verses[0].verse).toBe(1)
    expect(verses[0].text).toContain('创造天地')
    expect(verses[1].verse).toBe(2)
    expect(verses[1].text).toContain('空虚混沌')
  })

  it('多行续行归入同一节', () => {
    const text = '1起初，　神创造天地，\n是很好的事情，万物都在其中。\n2地是空虚混沌，渊面黑暗。'
    const result = parseBibleText(text)
    const verses = result.chapters[0].verses

    expect(verses.length).toBe(2)
    expect(verses[0].text).toContain('创造天地')
    expect(verses[0].text).toContain('万物')
  })
})

/* ================================================================
 *  Step 6: Non-Scripture Filtering
 * ================================================================ */

describe('Step 6: Non-Scripture Filtering', () => {
  it('过滤交叉引用和脚注', () => {
    const result = parseBibleText(GENESIS_1_WITH_NOISE)
    const verses = result.chapters[0].verses

    expect(verses.length).toBe(3)

    /* 经文文本不应包含交叉引用 */
    for (const v of verses) {
      expect(v.text).not.toContain('xxiv')
    }
  })

  it('过滤罗马数字', () => {
    const text = '1起初，　神创造天地。\nxxiv\n2地是空虚混沌。'
    const result = parseBibleText(text)
    expect(result.chapters[0].verses.length).toBe(2)
  })
})

/* ================================================================
 *  Step 7: Punctuation Restoration
 * ================================================================ */

describe('Step 7: Punctuation Restoration', () => {
  it('句尾补句号', () => {
    const text = '1起初，　神创造天地'
    const result = parseBibleText(text)
    const verse = result.chapters[0].verses[0]

    /* 应以句号结尾 */
    expect(verse.text).toMatch(/。$/)
  })

  it('已有句尾标点不重复补', () => {
    const text = '1起初，　神创造天地。'
    const result = parseBibleText(text)
    const verse = result.chapters[0].verses[0]

    /* 不应出现双句号 */
    expect(verse.text).not.toContain('。。')
  })
})

/* ================================================================
 *  Step 9: Structural Validation
 * ================================================================ */

describe('Step 9: Structural Validation', () => {
  it('连续节号 → valid', () => {
    const result = parseBibleText(GENESIS_1_LINE_PER_VERSE)
    expect(result.needsManualReview).toBe(false)
  })

  it('经文内容不为空', () => {
    const result = parseBibleText(GENESIS_1_LINE_PER_VERSE)
    const verses = result.chapters[0].verses

    for (const v of verses) {
      expect(v.text.trim()).not.toBe('')
    }
  })
})

/* ================================================================
 *  Verse Range Expansion
 * ================================================================ */

describe('Verse Range Expansion', () => {
  it('节范围展开为多个 verse', () => {
    const result = parseBibleText(GENESIS_1_RANGE)
    const verses = result.chapters[0].verses

    expect(verses[0].verse).toBe(1)
    expect(verses[1].verse).toBe(2)
    expect(verses[2].verse).toBe(3)
  })
})

/* ================================================================
 *  Canonical Data Structure
 * ================================================================ */

describe('Canonical Data Structure', () => {
  it('verse 结构正确', () => {
    const result = parseBibleText(GENESIS_1_LINE_PER_VERSE)
    const verse = result.chapters[0].verses[0]

    expect(verse).toHaveProperty('verse')
    expect(verse).toHaveProperty('text')
    expect(typeof verse.verse).toBe('number')
    expect(typeof verse.text).toBe('string')
  })

  it('text 字段是干净经文（Genesis 1:1）', () => {
    const result = parseBibleText(GENESIS_1_LINE_PER_VERSE)
    const verse = result.chapters[0].verses[0]

    expect(verse.verse).toBe(1)
    /* text 应以中文开头，不以数字开头 */
    expect(verse.text).toMatch(/^[起\u3000]/)
    expect(verse.text).toContain('创造天地')
  })

  it('text 字段是干净经文（Genesis 1:3 对话格式）', () => {
    const result = parseBibleText(GENESIS_1_LINE_PER_VERSE)
    const verse = result.chapters[0].verses[2]

    expect(verse.verse).toBe(3)
    expect(verse.text).toContain('神说')
    expect(verse.text).toContain('要有光')
    /* text 不以 "3" 开头 */
    expect(verse.text).not.toMatch(/^3/)
  })
})

/* ================================================================
 *  辅助函数测试
 * ================================================================ */

describe('辅助函数', () => {
  it('flattenVerses 扁平化', () => {
    const result = parseBibleText(GENESIS_1_LINE_PER_VERSE)
    const flat = flattenVerses(result)

    expect(flat.length).toBe(5)
    expect(flat[0]).toHaveProperty('chapter')
    expect(flat[0]).toHaveProperty('verse')
    expect(flat[0]).toHaveProperty('text')
  })

  it('getParseStats 统计', () => {
    const result = parseBibleText(GENESIS_1_LINE_PER_VERSE)
    const stats = getParseStats(result)

    expect(stats.chapterCount).toBe(1)
    expect(stats.verseCount).toBe(5)
  })
})

/* ================================================================
 *  无节号 fallback 测试
 * ================================================================ */

describe('无节号文本', () => {
  it('不生成假 verse（无节号则按行分配）', () => {
    const result = parseBibleText(GENESIS_1_NO_NUMBERS)
    /* 无节号文本应该以续行方式处理，不应生成假的 verse number */
    const chapters = result.chapters
    if (chapters.length > 0) {
      for (const v of chapters[0].verses) {
        /* text 不包含节号 */
        expect(v.text).not.toMatch(/^\d{1,3}[\u4e00-\u9fff]/)
      }
    }
  })
})
