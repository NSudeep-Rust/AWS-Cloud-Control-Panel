

def make_json_safe(obj):
    if isinstance(obj, dict):
        return {k: make_json_safe(v) for k, v in obj.items()}

    elif isinstance(obj, list):
        return [make_json_safe(v) for v in obj]

    elif hasattr(obj, "isoformat"):  # datetime
        return obj.isoformat()

    return obj

def extract_metadata(row):
    metadata = row.meta if isinstance(row.meta, dict) else {}
    inner = metadata.get("metadata")
    return inner if isinstance(inner, dict) else metadata