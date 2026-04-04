class DiffEngine:

    @staticmethod
    def compare(previous_findings, current_findings):
        prev_ids = set(f["id"] for f in previous_findings)
        curr_ids = set(f["id"] for f in current_findings)

        new = curr_ids - prev_ids
        resolved = prev_ids - curr_ids
        unchanged = curr_ids & prev_ids

        return {
            "new": list(new),
            "resolved": list(resolved),
            "unchanged": list(unchanged)
        }