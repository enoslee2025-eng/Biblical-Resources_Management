/**
 * 圣经智能标注引擎
 * 基于"词典匹配 + 上下文规则 + 置信度"三层机制
 * 首期支持人名标注和地名标注
 */

// 导入现有词典
import { getBiblePersonNames } from './biblePersonNames'
import { getBiblePlaceNames } from './biblePlaceNames'

/** 人名高频触发词（出现在前后文时提高人名置信度） */
const PERSON_TRIGGERS = [
  '说', '回答', '吩咐', '生', '娶', '去见', '起来', '哭', '祝福',
  '的儿子', '的妻子', '的父亲', '的母亲', '的女儿', '的兄弟', '的姐妹',
  '王', '先知', '祭司', '门徒', '使徒', '大祭司',
  '就', '对', '叫', '名叫', '称为'
]

/** 地名高频触发词 */
const PLACE_TRIGGERS = [
  '到', '往', '从', '在', '进入', '离开', '经过', '住在', '出了',
  '上到', '下到', '去到', '来到', '逃到', '回到', '走到',
  '城', '地', '山', '河', '海', '旷野', '境内', '四围', '口',
  '境', '乡', '省', '国'
]

/** 复合地名（不应拆分人名） */
const COMPOUND_PLACE_NAMES = [
  '大卫城', '以色列地', '以色列国', '以色列家', '以色列人', '以色列民',
  '犹大地', '犹大国', '犹大家', '犹大人', '犹大支派',
  '便雅悯地', '便雅悯支派',
  '摩押地', '摩押人', '摩押平原',
  '锡安山', '锡安城'
]

/** 不应标为人名的神圣称谓 */
const DIVINE_NAMES = [
  '耶和华', '神', '上帝', '主', '全能者', '至高者',
  '耶和华以勒', '耶和华尼西', '耶和华沙龙', '耶和华沙玛'
]

/** 集合称呼（不是具体人名） */
const GROUP_TERMS = [
  '众人', '门徒们', '百姓', '会众', '长老们', '祭司们',
  '法利赛人', '撒都该人', '文士'
]

/**
 * 歧义词消歧规则
 * 每个歧义词定义多种可能类型及判断规则
 */
const AMBIGUOUS_RULES = {
  '以色列': {
    candidates: [
      { type: 'person', subtype: 'patriarch', triggers: ['雅各', '改名', '生了', '的儿子们'] },
      { type: 'location', subtype: 'country', triggers: ['地', '国', '王', '境', '全'] },
      { type: 'group', subtype: 'people', triggers: ['人', '民', '家', '子孙', '众子', '十二支派'] }
    ],
    default: 'group'
  },
  '犹大': {
    candidates: [
      { type: 'person', subtype: 'patriarch', triggers: ['说', '回答', '的儿子', '生', '娶'] },
      { type: 'person', subtype: 'apostle', triggers: ['加略', '出卖', '银子'] },
      { type: 'location', subtype: 'region', triggers: ['地', '旷野', '山地', '城', '王'] },
      { type: 'group', subtype: 'tribe', triggers: ['支派', '家', '人'] }
    ],
    default: 'person'
  },
  '锡安': {
    candidates: [
      { type: 'location', subtype: 'mountain', triggers: ['山', '城', '在', '到', '从'] },
      { type: 'concept', subtype: 'spiritual', triggers: ['的女子', '啊', '欢呼', '歌唱', '居民'] }
    ],
    default: 'location'
  }
}

/** 置信度级别 */
const CONFIDENCE = { HIGH: 'high', MEDIUM: 'medium', LOW: 'low' }

/**
 * 智能标注结果对象
 * @typedef {Object} Annotation
 * @property {string} text - 原文
 * @property {string} normalizedName - 标准名称
 * @property {string} type - person / location
 * @property {string} subtype - king / prophet / city / mountain 等
 * @property {number} startOffset - 起始偏移
 * @property {number} endOffset - 结束偏移
 * @property {string} confidence - high / medium / low
 * @property {string} source - dictionary / context_rule / ambiguous
 */

/**
 * 检查文本前后是否包含触发词
 * @param {string} fullText - 完整经文文本
 * @param {number} matchStart - 匹配起始位置
 * @param {number} matchEnd - 匹配结束位置
 * @param {string[]} triggers - 触发词列表
 * @param {number} [windowSize=10] - 检查窗口大小（字符数）
 * @returns {boolean}
 */
function hasTrigger(fullText, matchStart, matchEnd, triggers, windowSize = 10) {
  const before = fullText.substring(Math.max(0, matchStart - windowSize), matchStart)
  const after = fullText.substring(matchEnd, Math.min(fullText.length, matchEnd + windowSize))
  const context = before + after
  return triggers.some(t => context.includes(t))
}

/**
 * 检查是否属于复合词的一部分（防止拆分标注）
 * @param {string} fullText - 完整文本
 * @param {string} matchText - 匹配到的文本
 * @param {number} start - 起始位置
 * @returns {string|null} 如果属于复合词，返回复合词文本；否则返回 null
 */
function isPartOfCompound(fullText, matchText, start) {
  for (const compound of COMPOUND_PLACE_NAMES) {
    if (compound.includes(matchText) && compound !== matchText) {
      // 检查复合词是否出现在当前位置
      const compoundStart = start - (compound.indexOf(matchText))
      if (compoundStart >= 0 && compoundStart + compound.length <= fullText.length) {
        const slice = fullText.substring(compoundStart, compoundStart + compound.length)
        if (slice === compound) return compound
      }
    }
  }
  return null
}

/**
 * 对歧义词进行消歧
 * @param {string} word - 歧义词
 * @param {string} fullText - 完整经文文本
 * @param {number} start - 起始位置
 * @param {number} end - 结束位置
 * @returns {{ type: string, subtype: string, confidence: string }|null}
 */
function disambiguate(word, fullText, start, end) {
  const rules = AMBIGUOUS_RULES[word]
  if (!rules) return null

  // 检查每个候选类型的触发词
  for (const candidate of rules.candidates) {
    if (hasTrigger(fullText, start, end, candidate.triggers, 15)) {
      return {
        type: candidate.type,
        subtype: candidate.subtype,
        confidence: CONFIDENCE.HIGH
      }
    }
  }

  // 没有匹配的触发词，使用默认类型，置信度为中
  return {
    type: rules.default === 'person' ? 'person' : (rules.default === 'location' ? 'location' : 'group'),
    subtype: '',
    confidence: CONFIDENCE.MEDIUM
  }
}

/**
 * 对单段经文文本进行智能标注
 * @param {string} text - 经文文本（纯文本，不含 HTML）
 * @param {Object} [options] - 选项
 * @param {boolean} [options.person=true] - 是否标注人名
 * @param {boolean} [options.place=true] - 是否标注地名
 * @returns {Annotation[]} 标注结果数组
 */
export function annotateText(text, options = {}) {
  if (!text || !text.trim()) return []

  const { person = true, place = true } = options
  const annotations = []
  const personNames = person ? getBiblePersonNames() : []
  const placeNames = place ? getBiblePlaceNames() : []

  // 构建合并列表，按长度降序排列（优先匹配更长的词）
  const allEntries = []
  if (person) {
    personNames.forEach(name => {
      if (DIVINE_NAMES.includes(name)) return // 跳过神圣称谓
      if (GROUP_TERMS.includes(name)) return // 跳过集合称呼
      allEntries.push({ name, defaultType: 'person' })
    })
  }
  if (place) {
    placeNames.forEach(name => {
      allEntries.push({ name, defaultType: 'location' })
    })
  }

  // 优先添加复合地名（最高优先级）
  COMPOUND_PLACE_NAMES.forEach(name => {
    if (place) allEntries.push({ name, defaultType: 'location', isCompound: true })
  })

  // 按长度降序排列
  allEntries.sort((a, b) => b.name.length - a.name.length)

  // 记录已标注范围，防止重叠
  const annotatedRanges = []

  function isOverlapping(start, end) {
    return annotatedRanges.some(r => !(end <= r.start || start >= r.end))
  }

  // 处理每个词条
  for (const entry of allEntries) {
    const escaped = entry.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(escaped, 'g')
    let match

    while ((match = re.exec(text)) !== null) {
      const start = match.index
      const end = start + match[0].length

      // 跳过与已有标注重叠的匹配
      if (isOverlapping(start, end)) continue

      let type = entry.defaultType
      let subtype = ''
      let confidence = CONFIDENCE.HIGH
      let source = 'dictionary'

      // 检查歧义词
      if (AMBIGUOUS_RULES[match[0]]) {
        const result = disambiguate(match[0], text, start, end)
        if (result) {
          type = result.type
          subtype = result.subtype
          confidence = result.confidence
          source = 'ambiguous'
        }
      }
      // 非歧义词检查是否属于复合词的一部分
      else if (type === 'person' && !entry.isCompound) {
        const compound = isPartOfCompound(text, match[0], start)
        if (compound) {
          // 人名属于复合地名的一部分，跳过
          continue
        }
      }

      // 基于上下文调整置信度
      if (source !== 'ambiguous') {
        if (type === 'person') {
          if (hasTrigger(text, start, end, PERSON_TRIGGERS)) {
            confidence = CONFIDENCE.HIGH
            source = 'dictionary+context_rule'
          } else if (hasTrigger(text, start, end, PLACE_TRIGGERS)) {
            // 人名附近出现地名触发词，可能判断错误，降低置信度
            confidence = CONFIDENCE.LOW
          } else {
            confidence = CONFIDENCE.MEDIUM
          }
        } else if (type === 'location') {
          if (hasTrigger(text, start, end, PLACE_TRIGGERS)) {
            confidence = CONFIDENCE.HIGH
            source = 'dictionary+context_rule'
          } else if (hasTrigger(text, start, end, PERSON_TRIGGERS)) {
            confidence = CONFIDENCE.LOW
          } else {
            confidence = CONFIDENCE.MEDIUM
          }
        }
      }

      // 跳过非人名和非地名类型的标注（如 group、concept）
      if (type !== 'person' && type !== 'location') continue

      annotations.push({
        text: match[0],
        normalizedName: match[0],
        type,
        subtype,
        startOffset: start,
        endOffset: end,
        confidence,
        source
      })

      annotatedRanges.push({ start, end })
    }
  }

  // 按位置排序
  annotations.sort((a, b) => a.startOffset - b.startOffset)

  return annotations
}

/**
 * 将标注结果应用到纯文本，生成带 HTML span 的标注文本
 * @param {string} text - 原始纯文本
 * @param {Annotation[]} annotations - 标注结果
 * @returns {string} 带标注 span 的 HTML
 */
export function applyAnnotations(text, annotations) {
  if (!annotations || annotations.length === 0) return text

  let result = ''
  let lastIdx = 0

  for (const ann of annotations) {
    // 添加标注前的普通文本
    if (ann.startOffset > lastIdx) {
      result += escapeHtml(text.substring(lastIdx, ann.startOffset))
    }

    // 根据类型和置信度构建 CSS 类名
    const typeClass = ann.type === 'person' ? 'person-name' : 'place-name'
    const confClass = `confidence-${ann.confidence}`

    // 构建 data 属性，用于信息卡片展示
    const dataAttrs = `data-entity-type="${ann.type}" data-entity-name="${ann.normalizedName}" data-confidence="${ann.confidence}" data-subtype="${ann.subtype || ''}" data-source="${ann.source}"`

    result += `<span class="${typeClass} ${confClass} smart-annotation" ${dataAttrs}>${escapeHtml(ann.text)}</span>`
    lastIdx = ann.endOffset
  }

  // 添加剩余文本
  if (lastIdx < text.length) {
    result += escapeHtml(text.substring(lastIdx))
  }

  return result
}

/** HTML 转义 */
function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * 对纯文本进行智能标注并返回带标注的 HTML
 * @param {string} text - 纯经文文本
 * @param {Object} [options] - 选项
 * @returns {string} 带标注的 HTML
 */
export function smartAnnotate(text, options = {}) {
  const annotations = annotateText(text, options)
  return applyAnnotations(text, annotations)
}

/**
 * 移除所有智能标注（还原为纯文本）
 * @param {string} html - 带标注的 HTML
 * @returns {string} 清理后的 HTML
 */
export function clearSmartAnnotations(html) {
  if (!html) return html
  return html
    .replace(/<span class="[^"]*smart-annotation[^"]*"[^>]*>(.*?)<\/span>/g, '$1')
}

/**
 * 获取标注统计信息
 * @param {Annotation[]} annotations
 * @returns {{ persons: number, places: number, highConf: number, medConf: number, lowConf: number }}
 */
export function getAnnotationStats(annotations) {
  const stats = { persons: 0, places: 0, highConf: 0, medConf: 0, lowConf: 0 }
  for (const a of annotations) {
    if (a.type === 'person') stats.persons++
    if (a.type === 'location') stats.places++
    if (a.confidence === 'high') stats.highConf++
    else if (a.confidence === 'medium') stats.medConf++
    else stats.lowConf++
  }
  return stats
}

/** 导出触发词和歧义规则，供外部使用 */
export { PERSON_TRIGGERS, PLACE_TRIGGERS, AMBIGUOUS_RULES, CONFIDENCE, DIVINE_NAMES }
