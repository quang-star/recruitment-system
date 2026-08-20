from fastapi import FastAPI

from app.shared.api import install_api_conventions
from app.cv.api import router as parsed_cv_router
from app.task.api import router as task_router

app = FastAPI(title="Smart Recruitment AI Service", version="0.0.1")
install_api_conventions(app)
app.include_router(task_router)
app.include_router(parsed_cv_router)


@app.get("/actuator/health", tags=["system"])
def health() -> dict[str, str]:
    return {"status": "UP"}
