package org.wxs.bibledictionary.resource.dto;

/**
 * 更新资源请求
 */
public class UpdateResourceRequest {

    /** 资源标题 */
    public String title;

    /** 资源元数据（JSON字符串） */
    public String metaJson;

    /** 资源内容（JSON字符串） */
    public String contentJson;

    /** 是否公开：0-私有，1-公开 */
    public Integer isPublic;
}
