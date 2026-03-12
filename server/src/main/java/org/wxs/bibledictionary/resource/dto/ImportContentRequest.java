package org.wxs.bibledictionary.resource.dto;

/**
 * 导入内容请求
 * 前端本地解析文件后，把文字内容发过来保存
 */
public class ImportContentRequest {

    /** 资源类型：bible / commentary / dictionary / material */
    public String type;

    /** 标题（通常取文件名） */
    public String title;

    /** 原始文件格式：txt / docx / pdf / json */
    public String format;

    /** 解析后的文字内容 */
    public String content;

    /** 前端预处理好的 contentJson（如圣经译本的章节经文结构），优先使用 */
    public String contentJson;
}
