import pytest
from scripts.publication_contract import assert_publication_coverage, METRICS

def test_long_horizon_collapse_blocks_publication():
    funds = {str(i): {"active": True, **{key: 1 for key in METRICS}} for i in range(10)}
    baseline = assert_publication_coverage(funds)
    for fund in funds.values(): fund["r1y"] = None
    with pytest.raises(ValueError, match="r1y"):
        assert_publication_coverage(funds, baseline)

def test_new_funds_do_not_require_nonexistent_history():
    funds = {str(i): {"active": True, **{key: 1 if i < 8 else None for key in METRICS}} for i in range(10)}
    assert assert_publication_coverage(funds)["r5y"] == 8
