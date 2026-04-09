import sys, os, multiprocessing, traceback, datetime
multiprocessing.freeze_support()

if getattr(sys, 'frozen', False):
    if sys._MEIPASS not in sys.path:
        sys.path.insert(0, sys._MEIPASS)
    os.chdir(sys._MEIPASS)

_d = os.path.join(os.environ.get('APPDATA', os.path.expanduser('~')), 'CloudSecurityPanel')
os.makedirs(os.path.join(_d, 'logs'), exist_ok=True)
_lf = os.path.join(_d, 'logs', 'backend.log')
def _log(m):
    ts = datetime.datetime.now().strftime('%H:%M:%S')
    open(_lf, 'a', encoding='utf-8').write('[' + ts + '] ' + str(m) + chr(10))

try:
    _log('Backend starting')
    _log('sys.path[0]: ' + (sys.path[0] if sys.path else 'empty'))
    _log('frozen: ' + str(getattr(sys, 'frozen', False)))
    try:
        import certifi
        _ca = certifi.where()
        os.environ.setdefault('SSL_CERT_FILE', _ca)
        os.environ.setdefault('REQUESTS_CA_BUNDLE', _ca)
        os.environ.setdefault('AWS_CA_BUNDLE', _ca)
        _log('certifi SSL: ' + _ca)
    except Exception as _ce:
        _log('certifi skip: ' + str(_ce))
    import uvicorn
    _log('uvicorn OK')
    _log('Importing app.api.main...')
    import app.api.main as _m
    _log('app.api.main OK')
    if __name__ == '__main__':
        _log('Launching uvicorn on 127.0.0.1:8000')
        uvicorn.run(_m.app, host='127.0.0.1', port=8000, reload=False, log_level='info', access_log=False)
        _log('uvicorn exited normally')
except SystemExit as e:
    _log('SystemExit: ' + str(e.code))
    sys.exit(e.code)
except Exception as e:
    _log('FATAL: ' + str(e))
    _log(traceback.format_exc())
    sys.exit(1)
