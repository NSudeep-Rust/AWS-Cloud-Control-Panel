import sys, os
os.chdir('p:/CloudSecurityPanel')
sys.path.insert(0, '.')

from app.database.db import SessionLocal
from app.database.models import Account
from app.core.aws_session import AWSSession
from app.modules.live_guardian.ruleset import DANGEROUS_EVENTS
from datetime import datetime, timedelta, timezone

db = SessionLocal()
account = db.query(Account).filter(Account.id == 1).first()
db.close()

profile  = getattr(account, 'profile_name', None)
has_key  = bool(getattr(account, 'access_key', None))
region   = getattr(account, 'region', 'us-east-1') or 'us-east-1'
print(f"Account: id={account.id} region={region} profile={profile} has_key={has_key}")

aws = AWSSession(
    profile_name=profile,
    role_arn=getattr(account, 'role_arn', None),
    access_key=getattr(account, 'access_key', None),
    secret_key=getattr(account, 'secret_key', None),
    region_name=region,
)
aws.initialize()
print("Session initialized OK")

start = datetime.now(timezone.utc) - timedelta(hours=24)
end   = datetime.now(timezone.utc)

for qregion in list(dict.fromkeys(["us-east-1", region])):
    ct = aws.session.client("cloudtrail", region_name=qregion)
    try:
        resp = ct.lookup_events(StartTime=start, EndTime=end, MaxResults=50)
        evs  = resp.get("Events", [])
        print(f"\n[{qregion}] Total events returned: {len(evs)}")
        for e in evs:
            name  = e.get("EventName", "")
            user  = e.get("Username", "?")
            t     = str(e.get("EventTime", ""))[:19]
            match = "*** MATCH ***" if name in DANGEROUS_EVENTS else "          ---"
            print(f"  {match}  {name:42}  user={user:25}  {t}")
    except Exception as ex:
        print(f"[{qregion}] ERROR: {ex}")

print("\nDangerous event names in ruleset:")
for k in DANGEROUS_EVENTS:
    print(f"  {k}")
