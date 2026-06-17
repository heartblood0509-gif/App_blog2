"""작업 상태 관리"""

from db.database import SessionLocal
from db.models import Job
from core.time_utils import utc_now_naive


# 한번 도달하면 진행률 갱신으로 되돌리면 안 되는 종료 상태.
# (병렬 이미지 생성에서 한 장이 실패해 job이 failed로 찍힌 뒤,
#  아직 돌고 있던 다른 장이 progress를 갱신해 failed를 generating_images로 되살리는 경합 방지.)
_TERMINAL_STATUSES = {"failed"}


def update_job_progress(job_id: str, status: str, progress: float, step: str):
    """작업 상태를 DB에 업데이트.

    이미 종료 상태(failed)인 job은 비-종료 상태로 덮어쓰지 않는다 — in-flight 잔여
    작업이 실패한 job을 다시 진행 중으로 되돌리는 것을 막기 위함.
    """
    db = SessionLocal()
    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if job:
            if job.status in _TERMINAL_STATUSES and status not in _TERMINAL_STATUSES:
                return
            job.status = status
            job.progress = progress
            job.current_step = step
            if status == "completed":
                job.completed_at = utc_now_naive()
            db.commit()
    finally:
        db.close()


def mark_job_failed(job_id: str, error_message: str):
    """작업 실패 처리"""
    db = SessionLocal()
    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if job:
            job.status = "failed"
            job.error_message = error_message
            job.current_step = "에러 발생"
            db.commit()
    finally:
        db.close()


def set_video_path(job_id: str, video_path: str):
    """완성 영상 경로 저장"""
    db = SessionLocal()
    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if job:
            job.video_path = video_path
            db.commit()
    finally:
        db.close()
