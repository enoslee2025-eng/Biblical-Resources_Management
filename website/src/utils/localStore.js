/**
 * 本地存储工具
 * 后端不可用时，将资源数据保存到浏览器 localStorage
 * 后端恢复后，本地数据仍可用于查看
 */

const PREFIX = 'bd_local_'

/**
 * 获取某类型的本地资源列表
 * @param {string} type bible / dictionary / commentary / material
 */
export function getLocalList(type) {
  try {
    return JSON.parse(localStorage.getItem(PREFIX + type) || '[]')
  } catch {
    return []
  }
}

/**
 * 保存资源到本地（新建或更新）
 * @param {string} type 资源类型
 * @param {Object} data 资源数据（含 title, metaJson, contentJson 等）
 * @returns {Object} 带有本地 ID 的资源对象
 */
export function saveLocal(type, data) {
  const items = getLocalList(type)

  if (data.id && String(data.id).startsWith('local_')) {
    // 更新已有本地记录
    const idx = items.findIndex(i => i.id === data.id)
    const updated = { ...items[idx], ...data, updatedAt: new Date().toISOString() }
    if (idx >= 0) items[idx] = updated
    else items.push(updated)
    localStorage.setItem(PREFIX + type, JSON.stringify(items))
    return updated
  } else {
    // 新建：生成本地 ID
    const newItem = {
      ...data,
      id: 'local_' + Date.now(),
      type,
      isLocal: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    items.unshift(newItem)
    localStorage.setItem(PREFIX + type, JSON.stringify(items))
    return newItem
  }
}

/**
 * 更新本地资源的部分字段
 * @param {string} type 资源类型
 * @param {string} id 本地资源 ID
 * @param {Object} patch 要更新的字段
 */
export function updateLocal(type, id, patch) {
  const items = getLocalList(type)
  const idx = items.findIndex(i => i.id === id)
  if (idx >= 0) {
    items[idx] = { ...items[idx], ...patch, updatedAt: new Date().toISOString() }
    localStorage.setItem(PREFIX + type, JSON.stringify(items))
    return items[idx]
  }
  return null
}

/**
 * 获取单个本地资源
 * @param {string} type 资源类型
 * @param {string} id 本地资源 ID
 */
export function getLocalItem(type, id) {
  return getLocalList(type).find(i => String(i.id) === String(id)) || null
}

/**
 * 删除本地资源
 * @param {string} type 资源类型
 * @param {string} id 本地资源 ID
 */
export function deleteLocal(type, id) {
  const items = getLocalList(type).filter(i => String(i.id) !== String(id))
  localStorage.setItem(PREFIX + type, JSON.stringify(items))
}

/**
 * 判断 ID 是否为本地资源 ID
 */
export function isLocalId(id) {
  return id && String(id).startsWith('local_')
}
