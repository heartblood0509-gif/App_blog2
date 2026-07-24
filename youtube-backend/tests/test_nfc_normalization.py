"""입력 경계 NFC 정규화 — 맥 붙여넣기 대본의 자모 분해형(NFD) 방지.

맥 일부 앱에서 복사한 한글은 "두"가 "ㄷ+ㅜ"(분해형)로 온다. 눈엔 같아도 글자 수가 2배로
세어져 화면-폭 판정이 오탐하고(화면엔 다 들어가는데 "화면보다 길어요"), FFmpeg drawtext 는
자모 합성을 안 해 최종 영상 자막이 깨질 수 있다. 요청 모델·유틸이 입력 경계에서 완성형으로
정규화하는 것을 고정한다.
"""

import unicodedata

from api.models import DraftJobRequest, EditLineRequest, SplitLineRequest
from api.routes.jobs import UpdateDraftMetaRequest
from core.subtitle_utils import display_len, normalize_nfc

NFC = "두 마리를 소개합니다"
NFD = unicodedata.normalize("NFD", NFC)


def test_nfd_and_nfc_differ_but_display_len_equal():
    assert len(NFD) > len(NFC)  # 분해형은 문자열 길이가 더 김
    assert display_len(NFD) == display_len(NFC) == 11


def test_normalize_nfc_helper():
    assert normalize_nfc(NFD) == NFC
    assert normalize_nfc(123) == "123"  # 문자열이 아니어도 안전


def test_edit_line_request_normalizes():
    assert EditLineRequest(line_index=0, text=NFD).text == NFC


def test_split_line_request_normalizes():
    r = SplitLineRequest(line_index=0, before=NFD, after=NFD)
    assert r.before == NFC and r.after == NFC


def test_draft_job_request_normalizes_lines_and_title():
    r = DraftJobRequest(lines=[NFD, "정상"], title_line1=NFD, title_line2="")
    assert r.lines[0] == NFC
    assert r.lines[1] == "정상"
    assert r.title_line1 == NFC


def test_draft_meta_request_normalizes_title():
    r = UpdateDraftMetaRequest(title=NFD, title_line1=NFD, title_line2=None)
    assert r.title == NFC
    assert r.title_line1 == NFC
    assert r.title_line2 is None
