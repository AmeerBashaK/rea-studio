# SPDX-License-Identifier: AGPL-3.0-only
"""Sample one Windows process tree; shared pages can be counted more than once."""
import ctypes
from ctypes import wintypes as w
import json
from pathlib import Path
import sys
import time

class Entry(ctypes.Structure):
    _fields_ = [('dwSize',w.DWORD),('cntUsage',w.DWORD),('pid',w.DWORD),('heap',ctypes.c_size_t),('module',w.DWORD),('threads',w.DWORD),('parent',w.DWORD),('priority',w.LONG),('flags',w.DWORD),('name',w.WCHAR*260)]
class Memory(ctypes.Structure):
    _fields_ = [('cb',w.DWORD),('faults',w.DWORD)] + [(n,ctypes.c_size_t) for n in ['peak_working_set','working_set','peak_paged','paged','peak_nonpaged','nonpaged','pagefile','peak_pagefile','private_bytes']]
k=ctypes.WinDLL('kernel32',use_last_error=True)
p=ctypes.WinDLL('psapi',use_last_error=True)
k.CreateToolhelp32Snapshot.argtypes=[w.DWORD,w.DWORD];k.CreateToolhelp32Snapshot.restype=w.HANDLE
k.Process32FirstW.argtypes=[w.HANDLE,ctypes.POINTER(Entry)];k.Process32NextW.argtypes=k.Process32FirstW.argtypes
k.OpenProcess.argtypes=[w.DWORD,w.BOOL,w.DWORD];k.OpenProcess.restype=w.HANDLE
k.CloseHandle.argtypes=[w.HANDLE]
k.GetProcessTimes.argtypes=[w.HANDLE]+[ctypes.POINTER(w.FILETIME)]*4

def ticks(value):
    return (value.dwHighDateTime << 32) | value.dwLowDateTime
p.GetProcessMemoryInfo.argtypes=[w.HANDLE,ctypes.POINTER(Memory),w.DWORD]
def sample(root):
    snapshot=k.CreateToolhelp32Snapshot(2,0)
    if snapshot==ctypes.c_void_p(-1).value: raise OSError('Process snapshot failed')
    entry=Entry();entry.dwSize=ctypes.sizeof(entry);parents={};names={}
    try:
        ok=k.Process32FirstW(snapshot,ctypes.byref(entry))
        while ok:
            parents[int(entry.pid)]=int(entry.parent);names[int(entry.pid)]=entry.name
            ok=k.Process32NextW(snapshot,ctypes.byref(entry))
    finally: k.CloseHandle(snapshot)
    family={root}
    while True:
        children={pid for pid,parent in parents.items() if parent in family}
        if children<=family: break
        family|=children
    working=private=count=missed=0;details=[]
    for pid in family:
        handle=k.OpenProcess(0x1000|0x10,False,pid)
        if not handle: missed+=1;continue
        try:
            m=Memory();m.cb=ctypes.sizeof(m)
            if p.GetProcessMemoryInfo(handle,ctypes.byref(m),m.cb):
                working+=m.working_set;private+=m.private_bytes;count+=1
                created,exited,kernel,user=(w.FILETIME() for _ in range(4))
                cpu=None;identity=None
                if k.GetProcessTimes(handle,ctypes.byref(created),ctypes.byref(exited),ctypes.byref(kernel),ctypes.byref(user)):
                    identity=str(pid)+':'+str(ticks(created))
                    cpu=(ticks(kernel)+ticks(user))/10000
                details.append({'pid':pid,'name':names.get(pid,'unknown'),'identity':identity,'cpu_lifetime_ms':cpu,'working_set_bytes':m.working_set,'private_bytes':m.private_bytes})
            else: missed+=1
        finally: k.CloseHandle(handle)
    return {'working_set_bytes':working,'private_bytes':private,'process_count':count,'unreadable_processes':missed,'processes':details}
if __name__=='__main__':
    root=int(sys.argv[1]);output=Path(sys.argv[2]);stop=Path(sys.argv[3]);start=time.perf_counter();rows=[]
    while not stop.exists() and time.perf_counter()-start<180:
        rows.append({'elapsed_ms':round((time.perf_counter()-start)*1000),**sample(root)});time.sleep(.1)
    processes={}
    for row in rows:
        for item in row['processes']:
            key=item['identity']
            if key is None: continue
            if key not in processes:
                processes[key]={'pid':item['pid'],'name':item['name'],'first_cpu_ms':item['cpu_lifetime_ms'],'last_cpu_ms':item['cpu_lifetime_ms'],'peak_sampled_private_bytes':0,'peak_sampled_working_set_bytes':0}
            observed=processes[key]
            observed['last_cpu_ms']=item['cpu_lifetime_ms']
            for metric in ['private_bytes','working_set_bytes']:
                observed['peak_sampled_'+metric]=max(observed['peak_sampled_'+metric],item[metric])
    for observed in processes.values():
        observed['observed_cpu_ms']=max(0,observed['last_cpu_ms']-observed['first_cpu_ms'])
    output.write_text(json.dumps({'process_summaries':list(processes.values()),'observed_cpu_ms':sum(p['observed_cpu_ms'] for p in processes.values()),'cpu_method':'Kernel plus user CPU deltas between first and last observed sample per PID/creation-time identity; excludes work before/after observation and missed children; not CPU utilization.','method':'100ms requested interval, sampled current process-tree sums after Electron launch; not exact peaks; shared pages may be counted repeatedly; terminated children may be missed','samples':len(rows),'peak_sampled_working_set_bytes':max((r['working_set_bytes'] for r in rows),default=0),'peak_sampled_private_bytes':max((r['private_bytes'] for r in rows),default=0),'maximum_process_count':max((r['process_count'] for r in rows),default=0),'rows':rows},indent=2),encoding='utf-8')
