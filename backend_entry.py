import sys, os, multiprocessing, traceback, datetime

# --- FORCE UTF-8 GLOBALLY (fixes charmap codec errors on Windows) ---
# Must be set before any other imports so that botocore JSON reads,
# logging handlers, and all file I/O default to UTF-8.
os.environ['PYTHONUTF8']        = '1'
os.environ['PYTHONIOENCODING']  = 'utf-8'
os.environ['PYTHONLEGACYWINDOWSSTDIO'] = '0'

# Re-wrap stdout/stderr in UTF-8 (in case Python already bound them to cp1252)
import io
for _attr in ('stdout', 'stderr'):
    _s = getattr(sys, _attr, None)
    if _s and hasattr(_s, 'buffer'):
        try:
            setattr(sys, _attr, io.TextIOWrapper(_s.buffer, encoding='utf-8', errors='replace'))
        except Exception:
            pass

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
        if getattr(sys, 'frozen', False):
            _ca = os.path.join(sys._MEIPASS, 'certifi', 'cacert.pem')
        else:
            import certifi
            _ca = certifi.where()
        if os.path.exists(_ca):
            os.environ['SSL_CERT_FILE']      = _ca
            os.environ['REQUESTS_CA_BUNDLE'] = _ca
            os.environ['AWS_CA_BUNDLE']      = _ca
            _log('certifi SSL OK: ' + _ca)
        else:
            _log('certifi cacert.pem NOT FOUND at: ' + _ca)
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
