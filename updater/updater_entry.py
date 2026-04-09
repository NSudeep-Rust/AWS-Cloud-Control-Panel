import multiprocessing
multiprocessing.freeze_support()
from updater import UpdaterUI
if __name__ == "__main__":
    UpdaterUI().run()
