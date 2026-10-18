# SPDX-License-Identifier: AGPL-3.0-only
"""Bounded Windows Ghidra worker. Static analysis only; never launches the input."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import queue
import re
import signal
import subprocess
import tempfile
import threading
import time
from result import validate

class WorkerError(RuntimeError):
    pass


def run_process(command, *, env=None, timeout=180, output_limit=131072, cancelled=lambda: False, stdout_only=False):
    """Capture bounded combined output; stop only this child and its descendants."""
    if cancelled():
        raise WorkerError('cancelled')
    child = subprocess.Popen(command, env=env, stdin=subprocess.DEVNULL,
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                             shell=False, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    chunks = queue.Queue(maxsize=16)
    done = threading.Event()
    def reader(stream,is_error):
        try:
            while True:
                block = stream.read1(8192)
                if not block: break
                while not done.is_set():
                    try: chunks.put((block,is_error), timeout=.05); break
                    except queue.Full: pass
        finally:
            stream.close()
    readers = [threading.Thread(target=reader,args=stream,daemon=True) for stream in [(child.stdout,False),(child.stderr,True)]]
    for reader_thread in readers: reader_thread.start()
    deadline = time.monotonic()+timeout
    capture = bytearray()
    received = 0
    reason = None
    try:
        while child.poll() is None or any(t.is_alive() for t in readers) or not chunks.empty():
            if cancelled(): reason='cancelled'
            elif time.monotonic() >= deadline: reason='timeout'
            if reason: break
            try:
                block,is_error = chunks.get(timeout=.03)
                received += len(block)
                if received>output_limit:
                    reason='output-limit'; break
                if not stdout_only or not is_error: capture.extend(block)
            except queue.Empty: pass
    finally:
        done.set()
        if reason or child.poll() is None:
            if os.name == 'nt':
                try: subprocess.run(['taskkill.exe','/PID',str(child.pid),'/T','/F'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=10)
                except (OSError,subprocess.TimeoutExpired): pass
            if child.poll() is None: child.kill()
        child.wait(timeout=15)
        for reader_thread in readers: reader_thread.join(timeout=2)
    text = capture.decode('utf-8',errors='replace')
    if reason: raise WorkerError(reason)
    if child.returncode: raise WorkerError('process failed (exit '+str(child.returncode)+'): '+text[-4000:])
    return text


def decompile(*,ghidra,java,target,expected_sha256,address,work,cancelled=lambda:False,timeout=180):
    deadline=time.monotonic()+timeout
    def remaining():
        if cancelled(): raise WorkerError('cancelled')
        left=deadline-time.monotonic()
        if left<=0: raise WorkerError('timeout')
        return left
    if os.name != 'nt': raise WorkerError('Windows worker only')
    if not re.fullmatch(r'[0-9a-fA-F]{64}',expected_sha256) or not re.fullmatch(r'0x[0-9a-fA-F]{1,16}',address):
        raise WorkerError('Expected SHA256 and hexadecimal address are required')
    ghidra,java,target,work = [Path(p).resolve() for p in (ghidra,java,target,work)]
    utility=ghidra/'Ghidra/Framework/Utility/lib/Utility.jar'
    support=ghidra/'support/LaunchSupport.jar'
    if not all(p.is_file() for p in (java,target,utility,support)) or java.name.lower()!='java.exe':
        raise WorkerError('Select java.exe, a Ghidra release directory, and an existing input')
    work.mkdir(parents=True,exist_ok=True)
    run=Path(tempfile.mkdtemp(prefix='decompiler-',dir=work))
    for name in ['home','tmp','projects','config','cache','data']: (run/name).mkdir()
    env=os.environ.copy()
    env.update(APPDATA=str(run/'config'),LOCALAPPDATA=str(run/'cache'),XDG_CONFIG_HOME=str(run/'config'),XDG_CACHE_HOME=str(run/'cache'),XDG_DATA_HOME=str(run/'data'))
    # Copy and hash in one pass; no fixed input-size ceiling.
    copied=run/'input.exe';digest=hashlib.sha256()
    with target.open('rb') as src,copied.open('wb') as dst:
        while block:=src.read(1024*1024):
            remaining()
            dst.write(block);digest.update(block)
    if digest.hexdigest()!=expected_sha256.lower(): raise WorkerError('Input hash mismatch')
    options=run_process([str(java),'-Duser.home='+str(run/'home'),'-cp',str(support),'LaunchSupport',str(ghidra),'-vmargs'],env=env,timeout=min(20,remaining()),output_limit=65536,cancelled=cancelled,stdout_only=True)
    vmargs=[v for v in options.splitlines() if v]
    if any(not v.startswith('-') or '\0' in v for v in vmargs): raise WorkerError('Invalid Ghidra JVM options')
    output=run/'result.json'
    command=[str(java),*vmargs,'-Xmx2G','-Djava.awt.headless=true','-Duser.home='+str(run/'home'),'-Djava.io.tmpdir='+str(run/'tmp'),'-Dapplication.settingsdir='+str(run/'config'),'-Dapplication.cachedir='+str(run/'cache'),'-cp',str(utility),'ghidra.Ghidra','ghidra.app.util.headless.AnalyzeHeadless',str(run/'projects'),'input','-import',str(copied),'-analysisTimeoutPerFile','90','-max-cpu','2','-scriptPath',str(Path(__file__).resolve().parent),'-postScript','StudioDecompile.java',address,str(output),'-deleteProject']
    log=run_process(command,env=env,timeout=remaining(),output_limit=131072,cancelled=cancelled)
    (run/'headless.log').write_text(log,encoding='utf-8')
    remaining()
    # Revalidate the current source after analysis, guarding replacement while busy.
    final_hash=hashlib.sha256()
    with target.open('rb') as stream:
        while block:=stream.read(1024*1024):
            remaining()
            final_hash.update(block)
    if final_hash.hexdigest()!=expected_sha256.lower(): raise WorkerError('Input changed during decompilation')
    with output.open('rb') as stream: raw=stream.read(3*1024*1024+1)
    remaining()
    report=validate(raw,expected_sha256,address)
    report['workerRun']=str(run)
    return report


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    for key in ['ghidra','java','target','expected-sha256','address','work']: parser.add_argument('--'+key,required=True)
    parser.add_argument('--cancel-file',type=Path)
    args=vars(parser.parse_args());cancel_file=args.pop('cancel_file')
    stopped=threading.Event()
    for sig in (signal.SIGINT,signal.SIGTERM): signal.signal(sig,lambda *_:stopped.set())
    args['cancelled']=lambda: stopped.is_set() or (cancel_file is not None and cancel_file.exists())
    try: print(json.dumps(decompile(**args)))
    except (WorkerError,OSError,ValueError) as error:
        print(json.dumps({'schema':'studio-decompiler-worker-error/1','error':str(error)}));raise SystemExit(1)

if __name__=='__main__': main()
