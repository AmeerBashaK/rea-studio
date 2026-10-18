# SPDX-License-Identifier: AGPL-3.0-only
"""Development-only real Ghidra smoke check; never executes the fixture."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
from result import validate

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--ghidra', type=Path, required=True)
parser.add_argument('--java', type=Path, required=True)
parser.add_argument('--fixture', type=Path, required=True)
parser.add_argument('--work', type=Path, required=True)
parser.add_argument('--functions', type=Path, required=True, help='JSON object mapping names to hex addresses')
args = parser.parse_args()
args.work.mkdir(parents=True, exist_ok=True)
run = Path(tempfile.mkdtemp(prefix='decompiler-', dir=args.work.resolve()))
for name in ['home','tmp','projects','config','cache','data']: (run/name).mkdir()
env=os.environ.copy()
env.update(APPDATA=str(run/'config'),LOCALAPPDATA=str(run/'cache'),XDG_CONFIG_HOME=str(run/'config'),XDG_CACHE_HOME=str(run/'cache'),XDG_DATA_HOME=str(run/'data'))
source = args.fixture.resolve()
expected = hashlib.file_digest(source.open('rb'), 'sha256').hexdigest()
target = run / 'fixture.exe'; shutil.copyfile(source, target)
if hashlib.file_digest(target.open('rb'), 'sha256').hexdigest() != expected:
    raise RuntimeError('Copied fixture hash mismatch')
functions = json.loads(args.functions.read_text(encoding='utf-8'))
support = subprocess.run([str(args.java.resolve()), '-Duser.home='+str(run/'home'), '-cp', str(args.ghidra.resolve()/'support/LaunchSupport.jar'), 'LaunchSupport', str(args.ghidra.resolve()), '-vmargs'], capture_output=True, text=True, timeout=20, check=True, env=env)
if len(support.stdout.encode()) > 65536:
    raise RuntimeError('LaunchSupport output exceeds budget')
vmargs = [line for line in support.stdout.splitlines() if line]
if any(not v.startswith('-') or '\0' in v for v in vmargs):
    raise RuntimeError('Invalid Ghidra JVM options')
command = [str(args.java.resolve()), *vmargs, '-Xmx2G', '-Djava.awt.headless=true',
           '-Duser.home='+str(run/'home'), '-Djava.io.tmpdir='+str(run/'tmp'),
           '-Dapplication.settingsdir='+str(run/'config'), '-Dapplication.cachedir='+str(run/'cache'),
           '-cp', str(args.ghidra.resolve()/'Ghidra/Framework/Utility/lib/Utility.jar'),
           'ghidra.Ghidra', 'ghidra.app.util.headless.AnalyzeHeadless',
           str(run/'projects'), 'fixture', '-import', str(target),
           '-analysisTimeoutPerFile', '90', '-max-cpu', '2',
           '-scriptPath', str(Path(__file__).resolve().parent)]
for index, (name, request) in enumerate(functions.items()):
    address = request if isinstance(request, str) else request['address']
    command += ['-postScript', 'StudioDecompile.java', address, str(run/f'{index}.json')]
command += ['-deleteProject']
with (run/'headless.log').open('wb') as log:
    child = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT, shell=False, env=env)
    try:
        code = child.wait(timeout=180)
    except subprocess.TimeoutExpired:
        subprocess.run(['taskkill.exe','/PID',str(child.pid),'/T','/F'], capture_output=True)
        child.wait(timeout=15)
        raise RuntimeError('Headless fixture exceeded 180 seconds; see '+str(run))
if code:
    raise RuntimeError('Headless import failed; see '+str(run))
reports = []
for index, (name, request) in enumerate(functions.items()):
    address = request if isinstance(request, str) else request['address']
    data = validate((run/f'{index}.json').read_bytes(), expected, address)
    expected_status = 'complete' if isinstance(request, str) else request['status']
    if data['status'] != expected_status:
        raise RuntimeError(name+': '+data['status'])
    reports.append({'fixtureName':name,'address':address,'status':data['status'],'codeBytes':len(data.get('code','').encode()),'engineVersion':data['engineVersion']})
if hashlib.file_digest(source.open('rb'),'sha256').hexdigest() != expected:
    raise RuntimeError('Original fixture changed')
(run/'verification.json').write_text(json.dumps({'sha256':expected,'functions':reports,'notice':'Successful extraction only; inspect semantics separately.'},indent=2),encoding='utf-8')
print('PASS real Ghidra extraction; evidence at '+str(run))
