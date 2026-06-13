from app.ai.diff import diff_policy, CORE_FIELDS

def test_diff_marks_changed_and_unchanged():
    extracted = {"frs": 230000, "bhs": 79000}
    active = {"frs": 220400, "bhs": 79000}
    rows = {r["field"]: r for r in diff_policy(extracted, active)}
    assert rows["frs"]["current"] == 220400 and rows["frs"]["extracted"] == 230000
    assert rows["frs"]["changed"] is True
    assert rows["bhs"]["changed"] is False
    # every CORE_FIELD present
    assert set(rows.keys()) == set(CORE_FIELDS)

def test_diff_missing_keys_are_none():
    rows = {r["field"]: r for r in diff_policy({}, {})}
    assert rows["frs"]["current"] is None and rows["frs"]["extracted"] is None
    assert rows["frs"]["changed"] is False
