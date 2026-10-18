# SPDX-License-Identifier: AGPL-3.0-only
import sys
import threading
import os
import json
import tempfile
from pathlib import Path
import unittest
from worker import run_process,WorkerError

class ProcessLimits(unittest.TestCase):
    def test_literal_output_and_failed_exit(self):
        self.assertEqual(run_process([sys.executable,'-c','print("literal & text")']).strip(),'literal & text')
        self.assertEqual(run_process([sys.executable,'-c','import sys;print("out");print("diagnostic",file=sys.stderr)'],stdout_only=True).strip(),'out')
        with self.assertRaisesRegex(WorkerError,'exit 7'):
            run_process([sys.executable,'-c','raise SystemExit(7)'])
    def test_timeout_and_output_overflow(self):
        with self.assertRaisesRegex(WorkerError,'timeout'):
            run_process([sys.executable,'-c','import time;time.sleep(20)'],timeout=.1)
        with self.assertRaisesRegex(WorkerError,'output-limit'):
            run_process([sys.executable,'-c','print("x"*200000)'],output_limit=1000)
    def test_cancel_and_restart(self):
        stopped=threading.Event();timer=threading.Timer(.1,stopped.set);timer.start()
        try:
            with self.assertRaisesRegex(WorkerError,'cancelled'):
                run_process([sys.executable,'-c','import time;time.sleep(20)'],cancelled=stopped.is_set)
        finally:timer.join()
        self.assertEqual(run_process([sys.executable,'-c','print("restart")']).strip(),'restart')

    @unittest.skipUnless(os.name=='nt','Windows descendant cleanup')
    def test_timeout_stops_descendant(self):
        import ctypes
        with tempfile.TemporaryDirectory() as folder:
            marker=Path(folder)/'pid.txt'
            code='import subprocess,sys,time;from pathlib import Path;p=subprocess.Popen([sys.executable,"-c","import time;time.sleep(30)"]);Path('+repr(str(marker))+').write_text(str(p.pid));time.sleep(30)'
            with self.assertRaisesRegex(WorkerError,'timeout'):
                run_process([sys.executable,'-c',code],timeout=1.5)
            self.assertTrue(marker.exists())
            kernel=ctypes.WinDLL('kernel32',use_last_error=True)
            kernel.OpenProcess.restype=ctypes.c_void_p
            kernel.WaitForSingleObject.argtypes=[ctypes.c_void_p,ctypes.c_ulong]
            kernel.CloseHandle.argtypes=[ctypes.c_void_p]
            handle=kernel.OpenProcess(0x100000,False,int(marker.read_text()))
            if handle:
                try:self.assertEqual(kernel.WaitForSingleObject(handle,1000),0)
                finally:kernel.CloseHandle(handle)

if __name__=='__main__':unittest.main()
