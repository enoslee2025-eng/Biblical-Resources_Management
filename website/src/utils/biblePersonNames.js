/**
 * 圣经人名数据库
 * 用于自动人名标注功能
 * 包含旧约和新约主要人名的中文名称
 */

/** 旧约人名 */
const OT_NAMES = [
  /* 创世记 */
  '亚当', '夏娃', '该隐', '亚伯', '塞特', '以挪士', '以诺', '玛土撒拉', '拉麦', '挪亚',
  '闪', '含', '雅弗', '亚伯拉罕', '亚伯兰', '撒拉', '撒莱', '夏甲', '以实玛利',
  '以撒', '利百加', '以扫', '雅各', '以色列', '拉班', '利亚', '拉结',
  '流便', '西缅', '利未', '犹大', '但', '拿弗他利', '迦得', '亚设',
  '以萨迦', '西布伦', '约瑟', '便雅悯', '底拿',
  '他玛', '波提乏', '法老',
  /* 出埃及记-申命记 */
  '摩西', '亚伦', '米利暗', '叶忒罗', '西坡拉', '可拉', '巴兰', '巴勒',
  '约书亚', '迦勒', '非尼哈', '以利亚撒',
  /* 士师记-撒母耳记 */
  '底波拉', '基甸', '耶弗他', '参孙', '大利拉', '路得', '拿俄米', '波阿斯',
  '以利', '哈拿', '撒母耳', '扫罗', '大卫', '约拿单', '歌利亚',
  '拔示巴', '乌利亚', '押沙龙', '亚比该',
  /* 列王纪-历代志 */
  '所罗门', '示巴女王', '罗波安', '耶罗波安', '亚哈', '耶洗别',
  '以利亚', '以利沙', '乃缦', '希西家', '约西亚', '尼布甲尼撒',
  /* 以斯拉-以斯帖 */
  '以斯拉', '尼希米', '以斯帖', '末底改', '哈曼', '亚哈随鲁',
  /* 约伯记-雅歌 */
  '约伯',
  /* 先知书 */
  '以赛亚', '耶利米', '以西结', '但以理', '何西阿', '约珥', '阿摩司',
  '俄巴底亚', '约拿', '弥迦', '那鸿', '哈巴谷', '西番雅', '哈该',
  '撒迦利亚', '玛拉基'
]

/** 新约人名 */
const NT_NAMES = [
  /* 福音书 */
  '耶稣', '基督', '马利亚', '约瑟', '施洗约翰', '约翰',
  '彼得', '西门', '安得烈', '雅各', '腓力', '巴多罗买', '多马',
  '马太', '达太', '奋锐党的西门', '犹大', '加略人犹大',
  '马大', '拉撒路', '尼哥底母', '撒该',
  '该亚法', '彼拉多', '希律', '巴拉巴',
  /* 使徒行传 */
  '司提反', '腓利', '巴拿巴', '保罗', '扫罗', '西拉', '提摩太',
  '亚居拉', '百基拉', '亚波罗', '路加', '马可',
  '亚拿尼亚', '哥尼流', '吕底亚', '非斯都', '亚基帕',
  /* 书信 */
  '提多', '腓利门', '以巴弗', '阿尼西母',
  /* 神的称呼（耶和华不标注下划线） */
  '上帝'
]

/** 合并去重 */
const ALL_NAMES = [...new Set([...OT_NAMES, ...NT_NAMES])]

/* 按长度降序排列，优先匹配较长的名字（如「施洗约翰」先于「约翰」） */
ALL_NAMES.sort((a, b) => b.length - a.length)

/**
 * 获取所有圣经人名列表
 */
export function getBiblePersonNames() {
  return ALL_NAMES
}

/**
 * 在 HTML 文本中标注人名下划线
 * 对 <strong> 标签内的节号不做标注
 * @param {string} html - 编辑器 HTML 内容
 * @returns {string} 标注后的 HTML
 */
export function markPersonNames(html) {
  if (!html) return html

  /* 创建临时 DOM 解析 HTML */
  const tmp = document.createElement('div')
  tmp.innerHTML = html

  /* 遍历所有段落 */
  const paragraphs = tmp.querySelectorAll('p')
  paragraphs.forEach(p => {
    /* 遍历文本节点（跳过 <strong> 节号标签） */
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        /* 跳过 strong 标签内的文本（节号） */
        if (node.parentElement?.tagName === 'STRONG') return NodeFilter.FILTER_REJECT
        /* 跳过已标注的 span 内文本 */
        if (node.parentElement?.classList?.contains('person-name')) return NodeFilter.FILTER_REJECT
        return NodeFilter.FILTER_ACCEPT
      }
    })

    const textNodes = []
    let current
    while ((current = walker.nextNode())) {
      textNodes.push(current)
    }

    /* 对每个文本节点进行人名替换 */
    for (const textNode of textNodes) {
      const text = textNode.textContent
      if (!text || !text.trim()) continue

      /* 构建正则：匹配所有人名 */
      const escaped = ALL_NAMES.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      const re = new RegExp(`(${escaped.join('|')})`, 'g')

      if (!re.test(text)) continue

      /* 有匹配 → 替换为带标注的 HTML */
      const fragment = document.createDocumentFragment()
      let lastIdx = 0
      re.lastIndex = 0
      let match
      while ((match = re.exec(text)) !== null) {
        /* 匹配前的普通文本 */
        if (match.index > lastIdx) {
          fragment.appendChild(document.createTextNode(text.slice(lastIdx, match.index)))
        }
        /* 人名标注 span */
        const span = document.createElement('span')
        span.className = 'person-name'
        span.textContent = match[0]
        fragment.appendChild(span)
        lastIdx = re.lastIndex
      }
      /* 剩余文本 */
      if (lastIdx < text.length) {
        fragment.appendChild(document.createTextNode(text.slice(lastIdx)))
      }
      textNode.parentNode.replaceChild(fragment, textNode)
    }
  })

  return tmp.innerHTML
}

/**
 * 对纯文本进行人名标注（返回带 span 的 HTML）
 * 用于批量标注经文文本，不涉及 DOM 操作
 * @param {string} text - 纯经文文本
 * @returns {string} 带人名标注 span 的 HTML 文本
 */
export function markPlainTextPersonNames(text) {
  if (!text || !text.trim()) return text
  const escaped = ALL_NAMES.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const re = new RegExp(`(${escaped.join('|')})`, 'g')
  if (!re.test(text)) return text
  re.lastIndex = 0
  return text.replace(re, '<span class="person-name">$1</span>')
}

/**
 * 移除 HTML 中的人名标注（还原为普通文本）
 * @param {string} html - 带标注的 HTML
 * @returns {string} 清理后的 HTML
 */
export function clearPersonNameMarks(html) {
  if (!html) return html
  /* 将 <span class="person-name">人名</span> 替换为纯文本 */
  return html.replace(/<span class="person-name">(.*?)<\/span>/g, '$1')
}
