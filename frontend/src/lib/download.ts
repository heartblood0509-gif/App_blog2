// 브라우저에서 Blob 을 파일로 저장시키는 최소 유틸.
// export-zip 과 분리한 이유: 그쪽은 JSZip 을 상단에서 import 하므로, 단순 다운로드만
// 필요한 화면(쇼츠 편집 등)이 export-zip 에서 가져오면 JSZip 번들이 딸려온다.

/** Blob 을 파일로 다운로드시킨다. (Electron: will-download 핸들러가 저장 위치 선택 창을 띄움) */
export function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 다운로드가 시작될 시간을 준 뒤 정리
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
