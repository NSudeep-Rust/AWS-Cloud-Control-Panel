class SecurityGroupScanner:

    def __init__(self, aws_session):
        self.aws_session = aws_session

    def scan(self):
        findings = []
        return findings