from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers.publish import router as publish_router
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


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=HOST, port=PORT)
