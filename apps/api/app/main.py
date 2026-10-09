from fastapi import FastAPI

app = FastAPI(title="Origin API")


@app.get("/v1/health")
def health():
    return {"status": "ok", "service": "origin-api"}
