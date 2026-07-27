// 한글 표기형(완성형/분해형) 차이를 흡수하는 텍스트 비교.
//
// 한글은 완성형(NFC, '한' = 1글자)과 분해형(NFD, 'ㅎ+ㅏ+ㄴ' = 3글자) 두 가지로 저장될 수
// 있고 화면에는 똑같이 보인다. 맥에서 다른 앱의 글을 붙여넣으면 분해형으로 들어오는데,
// 서버는 줄을 저장할 때 완성형으로 정규화한다(youtube-backend/api/models.py 의 _nfc 검증기).
//
// 그래서 "사용자 눈엔 같은 글자인데 저장된 표기가 다른" 상태가 실제로 생긴다. 그대로 !== 로
// 비교하면 그 줄이 영원히 '수정됨'으로 남아, 음성을 다시 만들어도 길이가 표시되지 않고
// 버튼이 '새로 만들어 재생'에서 바뀌지 않는다. 백엔드의 line_text_hash_matches 와 같은 목적.

export function sameText(a: string | undefined | null, b: string | undefined | null): boolean {
  return (a ?? "").normalize("NFC") === (b ?? "").normalize("NFC");
}

// 서버에 저장될 형태. 보낼 때와 로컬 상태에 넣을 때 모두 이걸 거쳐야 둘이 어긋나지 않는다.
export function toStoredForm(s: string): string {
  return (s ?? "").normalize("NFC");
}
