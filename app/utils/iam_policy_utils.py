def has_wildcard(value):
    if isinstance(value, str):
        return "*" in value
    if isinstance(value, list):
        return any("*" in v for v in value)
    return False


def is_full_admin(action, resource):
    return (
        (action == "*" or action == ["*"]) and
        (resource == "*" or resource == ["*"])
    )


def normalize_statements(policy_doc):
    statements = policy_doc.get("Statement", [])
    if not isinstance(statements, list):
        statements = [statements]
    return statements