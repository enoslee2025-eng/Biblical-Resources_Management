package org.wxs.bibledictionary.resource.dto;

/**
 * 创建资源请求
 */
public class CreateResourceRequest {

    /** 资源类型：bible / commentary / dictionary */
    public String type;

    /** 资源标题 */
    public String title;

    /** 资源元数据（JSON字符串） */
    public String metaJson;
}
