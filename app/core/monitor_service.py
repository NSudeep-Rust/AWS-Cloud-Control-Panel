import threading
import time

class MonitorService:

    def __init__(self, monitor, interval=60):
        self.monitor = monitor
        self.interval = interval
        self.running = False
        self.thread = None

    def _loop(self):
        print("🟢 Monitoring Started...")
        while self.running:
            try:
                self.monitor.run_once()
            except Exception as e:
                print(f"❌ Monitor error: {e}")

            time.sleep(self.interval)

    def start(self):
        if self.running:
            return "Already running"

        self.running = True
        self.thread = threading.Thread(target=self._loop, daemon=True)
        self.thread.start()

        return "Monitoring started"

    def stop(self):
        self.running = False
        return "Monitoring stopped"