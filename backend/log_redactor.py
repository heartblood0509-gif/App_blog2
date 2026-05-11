"""§G-2 — Python 로깅 redaction filter.

logging.Filter 서브클래스. record.msg 와 record.args 의 문자열들을 정규식으로 마스킹.
APP_TOKEN, GEMINI_API_KEY, naver_pw, X-App-Token 등이 stdout/파일 로그에 누설되지 않게 한다.
"""
from __future__ import annotations

import logging
import re

_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"((?:APP_TOKEN|APP_SESSION_TOKEN|GEMINI_API_KEY)=)([^\s'\"]+)"), r"\1***"),
    (re.compile(r"(X-App-(?:Token|Session)\s*[:=]\s*)([^\s'\",}]+)", re.IGNORECASE), r"\1***"),
    (re.compile(r"(Authorization\s*[:=]\s*)([^\s'\",}]+)", re.IGNORECASE), r"\1***"),
    (re.compile(r'("?naver_pw"?\s*[:=]\s*)("?)([^,"\n}]+)'), r"\1\2***"),
    (re.compile(r'("?naver_pw_encrypted"?\s*[:=]\s*)("?)([A-Za-z0-9+/=]+)'), r"\1\2***"),
]


def _redact(text: str) -> str:
    out = text
    for pat, repl in _PATTERNS:
        out = pat.sub(repl, out)
    return out


class RedactingFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        # msg 가 문자열이면 마스킹. 다른 타입이면 건드리지 않음.
        if isinstance(record.msg, str):
            record.msg = _redact(record.msg)
        # args 안의 문자열도 마스킹.
        if record.args:
            new_args = []
            if isinstance(record.args, tuple):
                for arg in record.args:
                    new_args.append(_redact(arg) if isinstance(arg, str) else arg)
                record.args = tuple(new_args)
            elif isinstance(record.args, dict):
                record.args = {
                    k: (_redact(v) if isinstance(v, str) else v) for k, v in record.args.items()
                }
        return True
