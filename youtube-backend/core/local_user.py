"""로컬 단일 사용자 모드 헬퍼 — Electron 데스크톱 임베드 전용.

블로그앱(Next.js + Electron)이 youtube-backend 를 두 번째 로컬 백엔드로 띄우고
iframe 으로 임베드한다. 이때 `LOCAL_SINGLE_USER=1` 이면 로그인/회원가입/OAuth 를
거치지 않고 고정 로컬 계정 1개로만 동작한다.

즉, "혼자 쓰는 데스크톱 앱"이므로 문지기(로그인) 없이 항상 같은 사용자로 들어간다.
Electron 이 STORAGE_DIR / BGM_DIR / JWT_SECRET 과 API 키를 env 로 주입한다.
"""

from sqlalchemy.orm import Session

from db.models import User
from config import settings


def get_or_create_local_user(db: Session) -> User:
    """고정 로컬 사용자를 반환(없으면 생성). 항상 approved, 일반 user 권한.

    role 을 admin 으로 두지 않는 이유: 단일 사용자 모드에선 관리자 콘솔이 의미가 없고
    (B4) 프런트의 '관리' 링크도 role!=admin 이면 자동으로 숨겨지기 때문.
    """
    user = (
        db.query(User)
        .filter(User.email == settings.LOCAL_USER_EMAIL)
        .first()
    )
    if user is None:
        user = User(
            email=settings.LOCAL_USER_EMAIL,
            nickname="로컬 사용자",
            role="user",
            provider="local",
            approved=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    _seed_api_keys_from_env(db, user)
    return user


def _seed_api_keys_from_env(db: Session, user: User) -> None:
    """Electron 이 env 로 넘긴 키를 암호화해 사용자 row 에 채운다.

    resolve_user_api_keys() 는 서버 기본 키로 폴백하지 않고 DB 의 암호화 키만 읽는다(B2).
    따라서 env 키만으로는 생성이 동작하지 않으므로, 부팅 시 1회 DB 에 시드한다.

    이미 키가 채워져 있으면 덮어쓰지 않는다 → youtube-backend 자체 설정 화면에서
    사용자가 직접 넣은 키를 보존(= 설정 화면이 source of truth, env 는 초기 시드).
    """
    from core.security import encrypt_api_key

    changed = False
    if settings.GEMINI_API_KEY and not user.gemini_api_key_enc:
        user.gemini_api_key_enc = encrypt_api_key(settings.GEMINI_API_KEY)
        changed = True
    if settings.TYPECAST_API_KEY and not user.typecast_api_key_enc:
        user.typecast_api_key_enc = encrypt_api_key(settings.TYPECAST_API_KEY)
        changed = True
    if settings.ELEVENLABS_API_KEY and not user.elevenlabs_api_key_enc:
        user.elevenlabs_api_key_enc = encrypt_api_key(settings.ELEVENLABS_API_KEY)
        changed = True
    if settings.FAL_KEY and not user.fal_key_enc:
        user.fal_key_enc = encrypt_api_key(settings.FAL_KEY)
        changed = True
    if changed:
        db.commit()
