package org.wxs.bibledictionary.resource.resource;

import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import org.jboss.resteasy.reactive.RestForm;
import org.jboss.resteasy.reactive.multipart.FileUpload;
import org.wxs.bibledictionary.common.response.Result;
import org.apache.poi.hwpf.HWPFDocument;
import org.apache.poi.hwpf.extractor.WordExtractor;

import java.io.FileInputStream;
import java.util.Map;

/**
 * DOC 文件解析接口
 * 接收上传的 .doc 文件，使用 Apache POI 提取纯文本后返回
 * 用于前端无法在浏览器端解析旧版 .doc (OLE2) 格式的场景
 */
@Path("/private/api/resource")
public class DocParseResource {

    /**
     * 解析 .doc 文件，提取纯文本
     * @param file 上传的 .doc 文件
     * @return 提取的纯文本内容
     */
    @POST
    @Path("/parse-doc")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @Produces(MediaType.APPLICATION_JSON)
    public Result<Map<String, String>> parseDoc(@RestForm("file") FileUpload file) {
        if (file == null || file.filePath() == null) {
            return Result.fail(400, "请上传 .doc 文件");
        }

        String fileName = file.fileName() != null ? file.fileName().toLowerCase() : "";
        if (!fileName.endsWith(".doc")) {
            return Result.fail(400, "仅支持 .doc 格式文件");
        }

        try (FileInputStream fis = new FileInputStream(file.filePath().toFile());
             HWPFDocument doc = new HWPFDocument(fis);
             WordExtractor extractor = new WordExtractor(doc)) {

            String text = extractor.getText();
            /* 清理多余空白，保留段落结构 */
            text = text.replaceAll("\\r\\n", "\n")
                       .replaceAll("\\r", "\n")
                       .replaceAll("\n{3,}", "\n\n")
                       .trim();

            return Result.ok(Map.of("text", text));
        } catch (Exception e) {
            return Result.fail(500, "解析 .doc 文件失败：" + e.getMessage());
        }
    }
}
