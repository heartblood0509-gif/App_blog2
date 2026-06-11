/**
 * 클립보드 paste 이벤트에서 이미지 File을 꺼낸다.
 *
 * OS 단축키(Mac ⌘V / Windows·Linux Ctrl+V)는 모두 동일한 `paste` 이벤트를 만든다.
 * 키 입력 기반이라 clipboard-read 권한이 필요 없다(= 권한 팝업/거부 없음).
 * ChatWidget.tsx / step-threads-analysis.tsx 의 검증된 패턴과 동일.
 *
 * React onPaste(SyntheticEvent)와 document의 native ClipboardEvent 둘 다 받도록
 * clipboardData만 의존하는 최소 타입으로 받는다.
 */
export function getImageFromClipboardEvent(e: {
  clipboardData: DataTransfer | null;
}): File | null {
  const item = Array.from(e.clipboardData?.items ?? []).find((it) =>
    it.type.startsWith("image/")
  );
  return item ? item.getAsFile() : null;
}
