from app.database.db import SessionLocal
from app.database.models import Account


db = SessionLocal()

account = Account(
    aws_account_id="905221885440",
    profile_name="nsudeepnrust",
    role_arn=None,
    region="us-east-1"
)

db.add(account)
db.commit()

print("Account created with ID:", account.id)

db.close()



