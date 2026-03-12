package org.wxs.bibledictionary.console.common.exception;

import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.ExceptionMapper;
import jakarta.ws.rs.ext.Provider;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.io.PrintWriter;
import java.io.StringWriter;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

/**
 * 全局异常处理器
 * 捕获所有未处理的异常，返回统一格式的错误响应
 * 开发环境返回完整堆栈信息，方便调试和复制给 Claude 修正
 */
@Provider
public class GlobalExceptionHandler implements ExceptionMapper<Exception> {

    /** 当前运行环境（dev/prod） */
    @ConfigProperty(name = "quarkus.profile", defaultValue = "prod")
    String profile;

    /**
     * 将异常转换为统一的 HTTP 响应
     * @param e 捕获的异常
     * @return HTTP 响应
     */
    @Override
    public Response toResponse(Exception e) {
        // 业务异常，返回自定义错误码
        if (e instanceof BusinessException bizEx) {
            Map<String, Object> error = new HashMap<>();
            error.put("code", bizEx.getCode());
            error.put("message", bizEx.getMessage());
            error.put("timestamp", LocalDateTime.now().toString());
            return Response.status(Response.Status.OK).entity(error).build();
        }

        // 其他异常，返回 500
        Map<String, Object> error = new HashMap<>();
        error.put("code", 500);
        error.put("message", e.getMessage() != null ? e.getMessage() : "服务器内部错误");
        error.put("timestamp", LocalDateTime.now().toString());

        // 开发环境返回完整堆栈，方便复制给 Claude 修正
        if ("dev".equals(profile)) {
            StringWriter sw = new StringWriter();
            e.printStackTrace(new PrintWriter(sw));
            error.put("error", sw.toString());
        }

        return Response.status(Response.Status.INTERNAL_SERVER_ERROR).entity(error).build();
    }
}
