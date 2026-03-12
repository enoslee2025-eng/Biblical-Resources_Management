/**
 * 圣经地名数据库
 * 用于自动地名标注功能
 * 包含旧约和新约主要地名的中文名称
 */

/** 旧约地名 */
const OT_PLACES = [
  /* 创世记 */
  '伊甸园', '伊甸', '巴别塔', '巴别', '亚拉腊', '迦南', '迦南地',
  '吾珥', '哈兰', '示剑', '伯特利', '艾城', '希伯仑', '别是巴',
  '所多玛', '蛾摩拉', '摩利亚', '基拉耳', '比珥拉海莱',
  '玛哈念', '毗努伊勒', '疏割', '多坍', '歌珊',
  /* 出埃及记-申命记 */
  '埃及', '红海', '西奈山', '西奈', '何烈山', '何烈',
  '加低斯巴尼亚', '加低斯', '摩押', '摩押平原',
  '约旦河', '约旦河东', '约旦河西',
  '尼波山', '毗斯迦',
  /* 约书亚记 */
  '耶利哥', '基遍', '亚雅仑谷', '示罗',
  /* 士师记-撒母耳记 */
  '基比亚', '拉玛', '米斯巴', '以便以谢', '基列雅比',
  '伯利恒', '犹大', '以色列',
  /* 列王纪 */
  '耶路撒冷', '锡安', '圣殿', '圣城', '大卫城',
  '撒玛利亚', '基立溪', '迦密山', '迦密',
  '亚述', '巴比伦', '波斯', '推罗', '西顿',
  '基色', '米吉多', '夏琐', '但', '吉甲',
  /* 以斯拉-尼希米 */
  '书珊', '书珊城',
  /* 先知书 */
  '他施', '尼尼微', '摩利沙', '亚实基伦', '迦萨'
]

/** 新约地名 */
const NT_PLACES = [
  /* 福音书 */
  '拿撒勒', '加利利', '加利利海', '迦百农', '毕士大',
  '伯赛大', '格拉森', '推雅推喇', '该撒利亚',
  '该撒利亚腓立比', '黑门山', '他泊山',
  '撒玛利亚', '叙加', '雅各井',
  '耶利哥', '伯大尼', '客西马尼', '各各他', '髑髅地',
  '圣殿', '毕哈大', '变像山',
  /* 使徒行传 */
  '安提阿', '大马士革', '大马色',
  '塞浦路斯', '彼西底', '以哥念', '路司得', '特庇',
  '特罗亚', '腓立比', '帖撒罗尼迦', '庇哩亚',
  '雅典', '哥林多', '以弗所', '米利都',
  '罗马', '马耳他', '革哩底',
  /* 启示录 */
  '拔摩岛', '士每拿', '别迦摩', '推雅推喇',
  '撒狄', '非拉铁非', '老底嘉', '新耶路撒冷'
]

/** 合并去重 */
const ALL_PLACES = [...new Set([...OT_PLACES, ...NT_PLACES])]

/* 按长度降序排列，优先匹配较长的名字 */
ALL_PLACES.sort((a, b) => b.length - a.length)

/**
 * 获取所有圣经地名列表
 */
export function getBiblePlaceNames() {
  return ALL_PLACES
}

/**
 * 对纯文本进行地名标注
 * @param {string} text - 纯经文文本
 * @returns {string} 带地名标注 span 的 HTML 文本
 */
export function markPlainTextPlaceNames(text) {
  if (!text || !text.trim()) return text
  const escaped = ALL_PLACES.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const re = new RegExp(`(${escaped.join('|')})`, 'g')
  if (!re.test(text)) return text
  re.lastIndex = 0
  return text.replace(re, '<span class="place-name">$1</span>')
}

/**
 * 在 HTML 中标注地名（用于编辑器富文本）
 * @param {string} html - 编辑器 HTML
 * @returns {string} 标注后的 HTML
 */
export function markPlaceNames(html) {
  if (!html) return html
  const tmp = document.createElement('div')
  tmp.innerHTML = html
  const paragraphs = tmp.querySelectorAll('p')
  paragraphs.forEach(p => {
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (node.parentElement?.tagName === 'STRONG') return NodeFilter.FILTER_REJECT
        if (node.parentElement?.classList?.contains('place-name')) return NodeFilter.FILTER_REJECT
        if (node.parentElement?.classList?.contains('person-name')) return NodeFilter.FILTER_REJECT
        return NodeFilter.FILTER_ACCEPT
      }
    })
    const textNodes = []
    let current
    while ((current = walker.nextNode())) textNodes.push(current)
    for (const textNode of textNodes) {
      const text = textNode.textContent
      if (!text || !text.trim()) continue
      const escaped = ALL_PLACES.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      const re = new RegExp(`(${escaped.join('|')})`, 'g')
      if (!re.test(text)) continue
      const fragment = document.createDocumentFragment()
      let lastIdx = 0
      re.lastIndex = 0
      let match
      while ((match = re.exec(text)) !== null) {
        if (match.index > lastIdx) {
          fragment.appendChild(document.createTextNode(text.slice(lastIdx, match.index)))
        }
        const span = document.createElement('span')
        span.className = 'place-name'
        span.textContent = match[0]
        fragment.appendChild(span)
        lastIdx = re.lastIndex
      }
      if (lastIdx < text.length) {
        fragment.appendChild(document.createTextNode(text.slice(lastIdx)))
      }
      textNode.parentNode.replaceChild(fragment, textNode)
    }
  })
  return tmp.innerHTML
}

/**
 * 移除地名标注
 * @param {string} html - 带标注的 HTML
 * @returns {string} 清理后的 HTML
 */
export function clearPlaceNameMarks(html) {
  if (!html) return html
  return html.replace(/<span class="place-name">(.*?)<\/span>/g, '$1')
}
