# SPDX-License-Identifier: AGPL-3.0-only
"""Repeatable local measurements. First observed run is not claimed to be disk-cold."""
from pathlib import Path
import json
import statistics
import subprocess
import time

root = Path(__file__).resolve().parent.parent
worker = root / 'desktop-resources/studio-native/studio-native.exe'
targets = [root/'verification/native-x64.exe', root/'verification/native-x86.exe',
           Path('C:/Windows/System32/kernel32.dll'), Path('C:/Program Files/nodejs/node.exe')]
report = {'engine':'Studio Native 0.1.0', 'method':'Three sequential fresh-worker runs per target; OS file cache is not controlled. Worker CPU and peak working set exclude the desktop UI. End-to-end wall time includes process startup and JSON output. All results are bounded static analyses, not full recovery benchmarks.', 'targets':[]}
for target in targets:
    runs=[]
    for i in range(3):
        start=time.perf_counter()
        p=subprocess.run([str(worker),str(target)],capture_output=True,text=True,encoding='utf8',timeout=90)
        wall=round((time.perf_counter()-start)*1000,2)
        if p.returncode:
            raise RuntimeError(p.stdout or p.stderr)
        data=json.loads(p.stdout)
        runs.append({'end_to_end_ms':wall,**data['metrics']})
    report['targets'].append({'name':target.name,'path':str(target),'sha256':data['subject']['sha256'],'bytes':data['subject']['size'],
        'functions':len(data['functions']),'instructions':data['coverage']['instructions'],'imports':len(data['imports']),
        'references':len(data['references']),'coverage':data['coverage'],'runs':runs,
        'median_end_to_end_ms':statistics.median(r['end_to_end_ms'] for r in runs)})
output=root/'verification/native-benchmark.json'
output.write_text(json.dumps(report,indent=2),encoding='utf8')
print(json.dumps([{k:v for k,v in t.items() if k in ('name','bytes','functions','instructions','median_end_to_end_ms')} for t in report['targets']],indent=2))
