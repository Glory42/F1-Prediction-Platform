import json


def log_job_failure(job: str, error: Exception, **context) -> None:
    """Structured failure log per CLAUDE.md: {"job": ..., "status": "failed", "error": ...}."""
    payload = {"job": job, "status": "failed", "error": str(error), **context}
    print(json.dumps(payload))
