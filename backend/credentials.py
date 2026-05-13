"""§C — 비밀번호 암호화 / 마이그레이션 (Electron credential-broker 경유).

설계:
  - accounts.json 의 새 스키마: id, label, naver_id, naver_pw_encrypted (base64 DPAPI).
    plaintext naver_pw 필드는 디스크에 절대 안 적힘.
  - 평문 → 잠근값 변환은 Electron main 에서만 가능 (safeStorage). backend 는 HTTP 로 위임.
  - APP_CREDENTIAL_BROKER_URL env 가 없고 ALLOW_INSECURE_DEV_PW=1 이면 평문 fallback (dev only).
  - 마이그레이션은 atomic rename + 백업으로 손상 방지.

공개 API:
  encrypt_pw(plaintext: str) -> str   # base64 ciphertext
  decrypt_pw_for_account(account_id: str) -> str  # plaintext
  migrate_legacy_plaintext_pw()       # startup event 에서 호출

전반적으로 plaintext 값은 함수 반환값으로만 잠시 흘리고, 어디에도 영구 저장하지 않는다.
"""
from __future__ import annotations

import json
import logging
import os
import shutil
import time
from pathlib import Path

import urllib.request
import urllib.error

logger = logging.getLogger(__name__)


class BrokerError(Exception):
    """credential-broker 와의 통신 실패. 메시지는 일반화된 코드만 포함."""


def _broker_url() -> str | None:
    return os.environ.get("APP_CREDENTIAL_BROKER_URL")


def _app_token() -> str | None:
    return os.environ.get("APP_TOKEN")


def _allow_insecure_pw() -> bool:
    return os.environ.get("ALLOW_INSECURE_DEV_PW") == "1"


def _broker_call(path: str, payload: dict) -> dict:
    base = _broker_url()
    if not base:
        raise BrokerError("broker-url-missing")
    token = _app_token() or ""
    req = urllib.request.Request(
        url=f"{base}{path}",
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={
            "Content-Type": "application/json",
            "X-App-Token": token,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            body = resp.read().decode("utf-8")
            return json.loads(body)
    except urllib.error.HTTPError as e:
        # 응답 본문에 일반화된 error 코드만. 메시지 detail 은 안 적음.
        try:
            err_body = e.read().decode("utf-8")
            err_code = json.loads(err_body).get("error", "broker-http-error")
        except Exception:
            err_code = "broker-http-error"
        raise BrokerError(err_code)
    except urllib.error.URLError as e:
        logger.exception("broker URLError")
        raise BrokerError("broker-network-error") from None
    except Exception:
        logger.exception("broker call unexpected")
        raise BrokerError("broker-unexpected") from None


def encrypt_pw(plaintext: str) -> str:
    """plaintext → base64-ciphertext. dev fallback 에선 plaintext 그대로 (저장 시점에서 다시 평문이 되긴 함)."""
    if not _broker_url():
        if _allow_insecure_pw():
            logger.warning("INSECURE DEV MODE: encrypt_pw fallback to plaintext")
            return ""  # 호출 측은 naver_pw_encrypted="" 보면 평문 폴백 분기
        raise BrokerError("broker-url-missing")
    out = _broker_call("/encrypt", {"plaintext": plaintext})
    ct = out.get("ciphertext_b64")
    if not isinstance(ct, str):
        raise BrokerError("encrypt-invalid-response")
    return ct


def decrypt_pw_for_account(account: dict) -> str:
    """주어진 account dict 에서 평문 비밀번호 복원. dev fallback 시 naver_pw 평문 필드 사용."""
    if "naver_pw_encrypted" in account and account["naver_pw_encrypted"]:
        out = _broker_call("/decrypt", {"ciphertext_b64": account["naver_pw_encrypted"]})
        pw = out.get("plaintext")
        if not isinstance(pw, str):
            raise BrokerError("decrypt-invalid-response")
        return pw
    # dev fallback
    if _allow_insecure_pw() and "naver_pw" in account:
        logger.warning("INSECURE DEV MODE: decrypt_pw fallback to plaintext")
        return str(account["naver_pw"])
    raise BrokerError("credential-decrypt-failed")


def _atomic_write_json(path: Path, data: list | dict) -> None:
    """temp 파일에 쓰고 fsync 후 atomic rename."""
    tmp = path.with_suffix(path.suffix + ".tmp")
    raw = json.dumps(data, ensure_ascii=False, indent=2)
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(raw)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def migrate_legacy_plaintext_pw(accounts_file: Path) -> None:
    """accounts.json 안에 naver_pw 평문 필드가 있는 계정을 잠근 형태로 변환.

    실패 시 backup 은 보존, 원본은 손상 안 됨 (atomic rename).
    """
    if not accounts_file.exists():
        return
    if not _broker_url():
        # dev fallback 활성 시 마이그레이션 skip — 평문 그대로 사용.
        return

    try:
        original = json.loads(accounts_file.read_text(encoding="utf-8"))
    except Exception:
        logger.exception("migration: accounts.json read failed")
        return

    if not isinstance(original, list):
        return

    legacy_count = sum(
        1
        for acc in original
        if isinstance(acc, dict)
        and "naver_pw" in acc
        and "naver_pw_encrypted" not in acc
    )
    if legacy_count == 0:
        return

    # 백업 먼저
    timestamp = time.strftime("%Y%m%dT%H%M%S")
    backup = accounts_file.with_name(f"{accounts_file.name}.bak-before-encryption-{timestamp}")
    try:
        shutil.copy2(accounts_file, backup)
    except Exception:
        logger.exception("migration: backup failed; abort")
        return

    migrated: list[dict] = []
    for acc in original:
        if not isinstance(acc, dict):
            continue
        if "naver_pw" in acc and "naver_pw_encrypted" not in acc:
            plain = acc.get("naver_pw") or ""
            try:
                ct = encrypt_pw(str(plain))
            except BrokerError:
                logger.exception("migration: encrypt failed for %s; keeping legacy entry", acc.get("id"))
                migrated.append(acc)
                continue
            new_acc = {k: v for k, v in acc.items() if k != "naver_pw"}
            new_acc["naver_pw_encrypted"] = ct
            migrated.append(new_acc)
        else:
            migrated.append(acc)

    try:
        _atomic_write_json(accounts_file, migrated)
        logger.info("migration: %d legacy account(s) encrypted, backup at %s", legacy_count, backup.name)
    except Exception:
        logger.exception("migration: atomic write failed; backup preserved at %s", backup)
        return

    _cleanup_old_backups(accounts_file)


def _cleanup_old_backups(accounts_file: Path, keep_days: int = 30) -> None:
    cutoff = time.time() - keep_days * 86400
    for bak in accounts_file.parent.glob(f"{accounts_file.name}.bak-*"):
        try:
            if bak.stat().st_mtime < cutoff:
                bak.unlink()
        except Exception:
            pass


def list_accounts_with_disabled(accounts_file: Path) -> list[dict]:
    """공개 API — disabled 플래그 포함 응답용. 복호화 실패하는 계정만 disabled=True."""
    if not accounts_file.exists():
        return []
    try:
        accounts = json.loads(accounts_file.read_text(encoding="utf-8"))
    except Exception:
        return []
    if not isinstance(accounts, list):
        return []

    result: list[dict] = []
    for acc in accounts:
        if not isinstance(acc, dict):
            continue
        disabled = False
        if _broker_url():
            try:
                _broker_call("/decrypt", {"ciphertext_b64": acc.get("naver_pw_encrypted", "")})
            except BrokerError:
                disabled = True
        elif _allow_insecure_pw():
            disabled = not ("naver_pw" in acc and acc["naver_pw"])
        result.append({
            "id": acc.get("id"),
            "label": acc.get("label"),
            "naver_id": acc.get("naver_id"),
            "disabled": disabled,
        })
    return result
