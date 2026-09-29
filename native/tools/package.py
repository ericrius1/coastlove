"""Create a standalone local app from the compiled native executable and data.

python3 native/tools/package.py
No Node, browser, Rust toolchain, or network is required to run the result.
"""
from pathlib import Path
import platform
import plistlib
import shutil
import subprocess

root = Path(__file__).resolve().parents[2]
native = root / 'native'
mac = platform.system() == 'Darwin'
exe = native / 'target/release' / ('coastlove-native.exe' if platform.system() == 'Windows' else 'coastlove-native')
if not exe.exists() or not (native / 'assets/rendering/complete.json').exists() or not (native / 'assets/coast-mask.bin').exists():
    raise SystemExit('First run npm run native:assets and cargo build --release --manifest-path native/Cargo.toml')
dest = native / 'dist' / ('Coastlove.app' if mac else 'Coastlove')
if mac:
    binary_dir = dest / 'Contents/MacOS'
    data_dir = dest / 'Contents/Resources'
else:
    binary_dir = data_dir = dest
binary_dir.mkdir(parents=True, exist_ok=True)
data_dir.mkdir(parents=True, exist_ok=True)
shutil.copy2(exe, binary_dir / exe.name)
for source, target in [(root / 'public/geodata', data_dir / 'public/geodata'),
                       (root / 'public/audio', data_dir / 'public/audio'),
                       (native / 'assets', data_dir / 'native/assets')]:
    shutil.copytree(source, target, dirs_exist_ok=True)
for name in ['README.md', 'PORT_STATUS.md', 'PERFORMANCE.md']:
    shutil.copy2(native / name, data_dir / name)
for name in ['LICENSE', 'CREDITS.md']:
    if (root / name).exists():
        shutil.copy2(root / name, data_dir / name)
if mac:
    info = {'CFBundleName': 'Coastlove', 'CFBundleDisplayName': 'Coastlove',
            'CFBundleIdentifier': 'love.coastlove.native', 'CFBundleVersion': '1',
            'CFBundleShortVersionString': '0.1.0', 'CFBundlePackageType': 'APPL',
            'CFBundleExecutable': exe.name, 'NSHighResolutionCapable': True,
            'LSMinimumSystemVersion': '12.0', 'NSHumanReadableCopyright': 'Coastlove contributors'}
    with (dest / 'Contents/Info.plist').open('wb') as f:
        plistlib.dump(info, f)
    subprocess.run(['codesign', '--force', '--deep', '--sign', '-', str(dest)], check=True)
print(dest)
