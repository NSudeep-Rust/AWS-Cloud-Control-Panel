from datetime import datetime


def format_response(module: str, mode: str, data=None, errors=None):
    return {
        "status": "success" if not errors else "error",
        "module": module,
        "mode": mode,
        "data": data if data is not None else {},   # NOTE: was "data or {}" which coerced [] to {}
        "errors": errors or [],
        "timestamp": datetime.utcnow().isoformat()
    }