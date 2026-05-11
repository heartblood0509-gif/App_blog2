from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers.publish import router as publish_router
from routers.accounts import router as accounts_router
from routers.brand_profiles import router as brand_profiles_router
from routers.analysis_records import router as analysis_records_router, ensure_builtin_seeds
from config import HOST, PORT

app = FastAPI(title="후기성 블로그 - 자동 포스팅 서버")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(publish_router, prefix="/publish", tags=["publish"])
app.include_router(accounts_router, prefix="/accounts", tags=["accounts"])
app.include_router(brand_profiles_router, prefix="/brand-profiles", tags=["brand-profiles"])
app.include_router(analysis_records_router, prefix="/analysis-records", tags=["analysis-records"])

# 첫 기동 시 builtin 분석 레코드 시드 (이미 있으면 덮어쓰지 않음)
ensure_builtin_seeds()


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=HOST, port=PORT)
