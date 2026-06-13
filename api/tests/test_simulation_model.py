from decimal import Decimal
from datetime import date

from app.models.member import MemberProfile
from app.models.simulation import SimulationRun


def test_simulation_run_round_trips(db_session):
    m = MemberProfile(
        name="Tan", dob=date(1986, 1, 1), monthly_gross_wage=Decimal("6000"),
        employment_status="employee", balances={"OA": 0, "SA": 0, "MA": 0, "RA": 0},
    )
    db_session.add(m)
    db_session.commit()

    run = SimulationRun(
        member_id=m.id, end_age=41, retirement_sum_target="FRS",
        annual_bonus=Decimal("0"), policy_snapshot_id=None,
        result={"final": {"OA": 15293.25}},
    )
    db_session.add(run)
    db_session.commit()

    fetched = db_session.get(SimulationRun, run.id)
    assert fetched.member_id == m.id
    assert fetched.result["final"]["OA"] == 15293.25
