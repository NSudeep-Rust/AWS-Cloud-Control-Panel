block_cipher = None
a = Analysis(["updater_entry.py"], pathex=["."], binaries=[], datas=[],
    hiddenimports=["tkinter","tkinter.ttk","urllib.request","zipfile","shutil","threading"],
    excludes=[], cipher=block_cipher, noarchive=False)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)
exe = EXE(pyz, a.scripts, a.binaries, a.zipfiles, a.datas, [],
    name="CloudShield-Updater",
    debug=False, strip=False, upx=True,
    console=False, onefile=True,
    icon="../installer/images/icon.ico")
