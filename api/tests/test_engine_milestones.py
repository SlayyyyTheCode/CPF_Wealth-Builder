from decimal import Decimal
from datetime import date
from types import SimpleNamespace
from app.engines.domain import AccountState, MonthState
from app.engines.milestones import compute_milestones

POLICY = {"bhs": Decimal("79000"), "frs": Decimal("220400"),
          "ers": Decimal("440800"), "cpf_life_eligibility_min": Decimal("60000")}
def resolve(_y): return POLICY

def _m(age, oa=0, sa=0, ma=0, ra=0):
    return MonthState(2000 + age, 1, age,
                      AccountState(), AccountState(OA=Decimal(str(oa)), SA=Decimal(str(sa)),
                                                   MA=Decimal(str(ma)), RA=Decimal(str(ra))))

def test_milestone_ages_first_occurrence():
    months = [
        _m(40, ma=50000, sa=100000),                 # nothing hit
        _m(45, ma=79000, sa=200000),                 # BHS hit at 45
        _m(50, ma=80000, sa=220400),                 # FRS via SA at 50
        _m(56, ma=80000, sa=0, ra=70000),            # CPF LIFE elig (RA>=60k) at 56
        _m(60, ma=80000, ra=440800),                 # ERS at 60
    ]
    res = SimpleNamespace(months=months)
    r = compute_milestones(res, date(1960, 1, 1), resolve)
    assert r == {"bhs_age": 45, "frs_age": 50, "ers_age": 60, "cpf_life_eligible_age": 56}

def test_milestones_none_when_never_reached():
    res = SimpleNamespace(months=[_m(40, ma=1000, sa=1000)])
    r = compute_milestones(res, date(1986, 1, 1), resolve)
    assert r == {"bhs_age": None, "frs_age": None, "ers_age": None, "cpf_life_eligible_age": None}
