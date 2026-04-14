/**
 * HTTP 응답의 charset을 감지하고 올바르게 디코딩합니다.
 * EUC-KR 등 비-UTF-8 인코딩을 처리합니다.
 */
export async function decodeResponse(response: Response): Promise<string> {
  const buffer = await response.arrayBuffer();

  const contentType = response.headers.get("content-type") || "";
  const headerCharset = extractCharset(contentType);

  if (headerCharset && !isUtf8(headerCharset)) {
    return new TextDecoder(headerCharset).decode(buffer);
  }

  const preview = new TextDecoder("ascii", { fatal: false }).decode(
    buffer.slice(0, 4096)
  );
  const metaCharset =
    preview.match(/<meta[^>]+charset=["']?([^"'\s;>]+)/i)?.[1] ||
    preview.match(/<meta[^>]+content=["'][^"']*charset=([^"'\s;>]+)/i)?.[1];

  if (metaCharset && !isUtf8(metaCharset)) {
    return new TextDecoder(metaCharset).decode(buffer);
  }

  return new TextDecoder("utf-8").decode(buffer);
}

function isUtf8(charset: string): boolean {
  return charset.toLowerCase().replace(/[-_]/g, "") === "utf8";
}

function extractCharset(contentType: string): string | null {
  const match = contentType.match(/charset=([^\s;]+)/i);
  return match ? match[1].trim() : null;
}
