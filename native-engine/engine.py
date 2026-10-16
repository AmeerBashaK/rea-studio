# SPDX-License-Identifier: AGPL-3.0-only
"""Bounded, read-only PE analysis. Target bytes are never loaded as executable code."""
import argparse
from collections import deque
import hashlib
import json
import os
from pathlib import Path
import re
import struct
import sys
import time

import capstone as cs
from capstone.x86 import X86_OP_IMM, X86_OP_MEM, X86_REG_RIP, X86_REG_EIP
import pefile

VERSION = "0.1.0"
MAX_FILE = 128 * 1024 * 1024


def hx(value):
    return f"0x{value:x}"


def progress(message):
    print(json.dumps({"rea_progress": {"phase": "native_analysis", "message": message}}), file=sys.stderr, flush=True)


def peak_memory_bytes():
    if os.name != 'nt':
        return None
    import ctypes
    from ctypes import wintypes
    class Counters(ctypes.Structure):
        _fields_ = [('cb', wintypes.DWORD), ('PageFaultCount', wintypes.DWORD)] + [(name, ctypes.c_size_t) for name in
            ('PeakWorkingSetSize', 'WorkingSetSize', 'QuotaPeakPagedPoolUsage', 'QuotaPagedPoolUsage', 'QuotaPeakNonPagedPoolUsage', 'QuotaNonPagedPoolUsage', 'PagefileUsage', 'PeakPagefileUsage')]
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.GetCurrentProcess.restype = wintypes.HANDLE
    psapi = ctypes.WinDLL('psapi', use_last_error=True)
    psapi.GetProcessMemoryInfo.argtypes = [wintypes.HANDLE, ctypes.POINTER(Counters), wintypes.DWORD]
    values = Counters(); values.cb = ctypes.sizeof(values)
    return int(values.PeakWorkingSetSize) if psapi.GetProcessMemoryInfo(kernel.GetCurrentProcess(), ctypes.byref(values), values.cb) else None


class AnalysisError(Exception):
    pass


class Image:
    def __init__(self, filename):
        with open(filename, "rb") as stream:
            size = os.fstat(stream.fileno()).st_size
            if size > MAX_FILE:
                raise AnalysisError("Input exceeds the 128 MB file limit.")
            self.data = stream.read(MAX_FILE + 1)
        if len(self.data) > MAX_FILE:
            raise AnalysisError("Input grew beyond the file limit while reading.")
        if len(self.data) < 64 or self.data[:2] != b"MZ":
            raise AnalysisError("Expected a Windows PE executable or DLL with an MZ header.")
        self.pe = pefile.PE(data=self.data, fast_load=True)
        machine = self.pe.FILE_HEADER.Machine
        if machine not in (0x14c, 0x8664):
            raise AnalysisError(f"Unsupported machine {hx(machine)}. This engine supports x86 and x64 PE files.")
        self.bits = 64 if machine == 0x8664 else 32
        expected_magic = 0x20b if self.bits == 64 else 0x10b
        if self.pe.OPTIONAL_HEADER.Magic != expected_magic:
            raise AnalysisError("PE optional-header format does not match the machine architecture.")
        if self.pe.FILE_HEADER.NumberOfSections > 96 or len(self.pe.sections) != self.pe.FILE_HEADER.NumberOfSections:
            raise AnalysisError("Section table is incomplete or exceeds 96 sections.")
        dirs = self.pe.OPTIONAL_HEADER.DATA_DIRECTORY
        if len(dirs) > 14 and dirs[14].VirtualAddress:
            raise AnalysisError("Managed PE/CLI assembly detected. Use the .NET metadata workflow; native decoding would be misleading.")
        self.base = int(self.pe.OPTIONAL_HEADER.ImageBase)
        self.entry = self.base + self.pe.OPTIONAL_HEADER.AddressOfEntryPoint
        self.sections = []
        for s in self.pe.sections:
            start, length = int(s.PointerToRawData), int(s.SizeOfRawData)
            if length and (start < self.pe.OPTIONAL_HEADER.SizeOfHeaders or start + length > len(self.data)):
                raise AnalysisError("A section's raw bytes overlap headers or extend outside the file.")
            virtual_size = max(int(s.Misc_VirtualSize), length)
            if int(s.VirtualAddress) + virtual_size > 0x100000000:
                raise AnalysisError("A section exceeds the PE RVA address space.")
            self.sections.append({"name": s.Name.rstrip(b"\0").decode("utf8", "replace"),
                                  "rva": int(s.VirtualAddress), "virtual_size": virtual_size,
                                  "offset": start, "size": length,
                                  "executable": bool(s.Characteristics & 0x20000000),
                                  "writable": bool(s.Characteristics & 0x80000000)})
        for a, b in zip(sorted(self.sections, key=lambda s: s["rva"]), sorted(self.sections, key=lambda s: s["rva"])[1:]):
            if a["rva"] + a["virtual_size"] > b["rva"]:
                raise AnalysisError("Overlapping virtual sections are ambiguous and not supported.")
        raw = sorted((s for s in self.sections if s["size"]), key=lambda s: s["offset"])
        for a, b in zip(raw, raw[1:]):
            if a["offset"] + a["size"] > b["offset"]:
                raise AnalysisError("Overlapping raw sections are ambiguous and not supported.")

    def locate(self, address, executable=False):
        rva = address - self.base
        for section in self.sections:
            delta = rva - section["rva"]
            if 0 <= delta < section["size"] and (not executable or section["executable"]):
                return section["offset"] + delta, section["size"] - delta
        return None

    def address_of_offset(self, offset):
        for section in self.sections:
            if section["offset"] <= offset < section["offset"] + section["size"]:
                return self.base + section["rva"] + offset - section["offset"]
        return None


def basic_blocks(instructions):
    """Partition decoded instruction successors, retaining unresolved/out-of-function edges."""
    if not instructions:
        return []
    lookup = {i["address"]: i for i in instructions}
    incoming = {}
    for ins in instructions:
        for edge in ins["successors"]:
            if edge["target"] in lookup:
                incoming.setdefault(edge["target"], []).append((ins["address"], edge["kind"]))
    leaders = {instructions[0]["address"]}
    for addr, edges in incoming.items():
        if len(edges) != 1 or edges[0][1] != "fallthrough":
            leaders.add(addr)
    assigned, blocks = set(), []
    for start in [i["address"] for i in instructions if i["address"] in leaders] + list(lookup):
        if start in assigned:
            continue
        block = {"address": start, "instructions": [], "edges": []}
        cursor = start
        while cursor in lookup and cursor not in assigned:
            ins = lookup[cursor]
            assigned.add(cursor)
            block["instructions"].append(cursor)
            succ = ins["successors"]
            if len(succ) != 1 or succ[0]["kind"] != "fallthrough" or succ[0]["target"] in leaders:
                block["edges"] = succ
                break
            cursor = succ[0]["target"]
            if cursor not in lookup or cursor in assigned:
                block["edges"] = succ
                break
        blocks.append(block)
    return blocks


def analyze(filename, max_functions=256, max_instructions=20000, max_seconds=30, *, address=None, expected_sha256=None):
    wall, cpu = time.perf_counter(), time.process_time()
    deadline = wall + max_seconds
    progress("Validating PE headers and section mappings")
    image = Image(filename)
    pe = image.pe
    digest = hashlib.sha256(image.data).hexdigest()
    if address is not None:
        if not isinstance(expected_sha256, str) or not re.fullmatch(r"[0-9a-fA-F]{64}", expected_sha256):
            raise AnalysisError("Focused analysis requires the original input SHA-256.")
        if digest != expected_sha256.lower():
            raise AnalysisError("Input SHA-256 changed; reopen the binary before using saved addresses.")
        if not isinstance(address, int) or isinstance(address, bool) or not image.locate(address, True):
            raise AnalysisError("Requested address is not backed by executable bytes in this input.")
    elif expected_sha256 is not None:
        raise AnalysisError("An expected SHA-256 requires a focused address.")
    limitations = ["Function boundaries and code discovery are conservative candidates, not complete recovery.",
                   "Indirect branches, jump tables, exception flow and obfuscated code are not resolved.",
                   "This engine provides assembly, not decompiled source, and never executes the target.",
                   "References describe decoded operands, not proven runtime access or execution."]
    cutoffs = []
    # Parse only directories used by this engine; never request broad unbounded directory analysis.
    pe.parse_data_directories(directories=[pefile.DIRECTORY_ENTRY['IMAGE_DIRECTORY_ENTRY_IMPORT'], pefile.DIRECTORY_ENTRY['IMAGE_DIRECTORY_ENTRY_EXPORT']])
    imports = []
    for module in getattr(pe, "DIRECTORY_ENTRY_IMPORT", []):
        for symbol in module.imports:
            if len(imports) >= 4096:
                cutoffs.append("Import table capped at 4096 entries")
                break
            imports.append({"module": module.dll.decode("utf8", "replace"), "name": symbol.name.decode("utf8", "replace") if symbol.name else "ordinal_" + str(symbol.ordinal), "address": hx(symbol.address)})
        if len(imports) >= 4096:
            break
    import_at = {int(i["address"], 16): i for i in imports}
    seeds, queue, queued = {}, deque(), set()

    def seed(address, name, reason, priority=False):
        if not image.locate(address, True):
            return
        if address not in seeds:
            if len(seeds) >= 8192:
                if "Function seed inventory capped at 8192" not in cutoffs:
                    cutoffs.append("Function seed inventory capped at 8192")
                return
            seeds[address] = {"name": name, "basis": reason}
        if address not in queued:
            (queue.appendleft if priority else queue.append)(address)
            queued.add(address)

    if address is not None:
        seed(address, "sub_" + format(address, "x"), "user-requested address")
    seed(image.entry, "entry_point", "PE entry point")
    exports = []
    export_symbols = getattr(getattr(pe, "DIRECTORY_ENTRY_EXPORT", None), "symbols", [])
    if len(export_symbols) > 4096:
        cutoffs.append("Export inventory capped at 4096")
    for symbol in export_symbols[:4096]:
        name = symbol.name.decode("utf8", "replace") if symbol.name else "ordinal_" + str(symbol.ordinal)
        address = image.base + symbol.address
        forwarded = symbol.forwarder.decode("utf8", "replace") if symbol.forwarder else None
        exports.append({"name": name, "address": hx(address), "forwarder": forwarded})
        if not forwarded:
            seed(address, name, "PE export")
    # x64 runtime-function records provide declared entry seeds, not proof of an entire source function.
    if image.bits == 64 and len(pe.OPTIONAL_HEADER.DATA_DIRECTORY) > 3:
        directory = pe.OPTIONAL_HEADER.DATA_DIRECTORY[3]
        located = image.locate(image.base + directory.VirtualAddress)
        if directory.Size and located:
            offset, available = located
            count = min(int(directory.Size), available, 8192 * 12) // 12
            if int(directory.Size) > count * 12:
                cutoffs.append("Runtime-function inventory was bounded or truncated")
            for i in range(count):
                begin, end, unwind = struct.unpack_from("<III", image.data, offset + i * 12)
                if begin < end and image.locate(image.base + end - 1, True):
                    seed(image.base + begin, "sub_" + format(image.base + begin, "x"), "x64 runtime-function entry")
    if address is not None:
        requested_address = address
        queue.clear()
        queue.append(requested_address)
        max_functions = 1
    else:
        requested_address = None
    progress("Collecting strings and import references")
    strings = []
    for pattern, encoding in ([] if requested_address is not None else [(rb"[\x20-\x7e]{5,}", "ascii"), (rb"(?:[\x20-\x7e]\x00){5,}", "utf-16-le")]):
        for match in re.finditer(pattern, image.data):
            if len(strings) >= 2000 or time.perf_counter() > deadline:
                cutoffs.append("String extraction stopped at its count or time limit")
                break
            addr = image.address_of_offset(match.start())
            strings.append({"address": hx(addr) if addr is not None else None, "offset": hx(match.start()), "encoding": encoding,
                            "text": match.group()[:512].decode(encoding, "replace"), "truncated": len(match.group()) > 512})
    decoder = cs.Cs(cs.CS_ARCH_X86, cs.CS_MODE_64 if image.bits == 64 else cs.CS_MODE_32)
    decoder.detail = True
    functions, done, instruction_count, references = [], set(), 0, []
    while queue and len(functions) < max_functions and instruction_count < max_instructions:
        if time.perf_counter() > deadline:
            cutoffs.append("Analysis time limit reached")
            break
        address = queue.popleft()
        if address in done:
            continue
        done.add(address)
        if len(functions) % 20 == 0:
            progress(f"Decoding function candidate {len(functions) + 1}; {instruction_count} instructions retained")
        pending, seen, owned_bytes = deque([address]), {}, set()
        conflicts, decode_failures, function_cutoff = [], [], False
        while pending and len(seen) < 2048 and instruction_count < max_instructions:
            cursor = pending.popleft()
            while cursor not in seen and len(seen) < 2048 and instruction_count < max_instructions:
                if time.perf_counter() > deadline:
                    function_cutoff = True
                    pending.clear()
                    break
                if cursor != address and cursor in seeds:
                    break
                located = image.locate(cursor, True)
                if not located:
                    break
                offset, available = located
                ins = next(decoder.disasm(image.data[offset:offset + min(15, available)], cursor, count=1), None)
                if ins is None:
                    decode_failures.append(hx(cursor))
                    break
                byte_range = range(cursor, cursor + ins.size)
                if any(b in owned_bytes for b in byte_range):
                    conflicts.append(hx(cursor))
                    break
                owned_bytes.update(byte_range)
                branch, call, ret = ins.group(cs.CS_GRP_JUMP), ins.group(cs.CS_GRP_CALL), ins.group(cs.CS_GRP_RET)
                destination = int(ins.operands[0].imm) & ((1 << image.bits) - 1) if (branch or call) and ins.operands and ins.operands[0].type == X86_OP_IMM else None
                row = {"address": hx(cursor), "offset": hx(offset), "bytes": bytes(ins.bytes).hex(" "), "size": ins.size,
                       "mnemonic": ins.mnemonic, "operands": ins.op_str, "successors": [], "references": []}
                if branch or call:
                    reference = {"source": hx(cursor), "target": hx(destination) if destination is not None else None, "kind": "call" if call else "branch", "resolved": destination is not None}
                    references.append(reference); row["references"].append(reference)
                    if call and destination is not None:
                        seed(destination, "sub_" + format(destination, "x"), "direct call target", True)
                for operand in ins.operands:
                    candidate = None
                    if operand.type == X86_OP_MEM:
                        mem = operand.mem
                        if mem.base in (X86_REG_RIP, X86_REG_EIP) and mem.index == 0:
                            candidate = (cursor + ins.size + mem.disp) & ((1 << image.bits) - 1)
                        elif mem.base == 0 and mem.index == 0:
                            candidate = int(mem.disp) & ((1 << image.bits) - 1)
                    if candidate is not None and (image.locate(candidate) or candidate in import_at):
                        imported = import_at.get(candidate)
                        ref = {"source": hx(cursor), "target": hx(candidate), "kind": "import" if imported else "memory", "resolved": True,
                               "label": imported["module"] + "!" + imported["name"] if imported else None}
                        references.append(ref); row["references"].append(ref)
                following = cursor + ins.size
                if branch:
                    row["successors"].append({"target": hx(destination) if destination is not None else None, "kind": "branch"})
                    if destination is not None and destination not in seen:
                        pending.append(destination)
                    if ins.mnemonic not in ("jmp", "ljmp"):
                        row["successors"].append({"target": hx(following), "kind": "fallthrough"})
                elif not ret and ins.mnemonic not in ("int3", "ud2", "hlt", "iret", "iretd", "iretq"):
                    row["successors"].append({"target": hx(following), "kind": "fallthrough"})
                seen[cursor] = row
                instruction_count += 1
                if ret or not row["successors"] or (branch and ins.mnemonic in ("jmp", "ljmp")):
                    break
                cursor = following
        if pending or len(seen) >= 2048 or instruction_count >= max_instructions:
            function_cutoff = True
        instructions = sorted(seen.values(), key=lambda i: int(i["address"], 16))
        functions.append({"address": hx(address), **seeds[address], "instructions": instructions, "blocks": basic_blocks(instructions),
                          "coverage": "bounded", "limit_reached": function_cutoff, "decode_failures": decode_failures, "overlapping_paths": conflicts})
    if queue and requested_address is None:
        cutoffs.append("Function, instruction or elapsed-time budget left candidates unanalyzed")
    if any(f["limit_reached"] for f in functions):
        cutoffs.append("One or more functions reached an analysis budget")
    warnings = pe.get_warnings()[:20]
    sections = [{**s, "address": hx(image.base + s["rva"]), "rva": hx(s["rva"]), "offset": hx(s["offset"])} for s in image.sections]
    result = {"schema": "studio-native/1", "engine": {"name": "Studio Native", "version": VERSION, "decoder": "Capstone " + cs.__version__},
              "subject": {"name": Path(filename).name, "path": str(Path(filename).resolve()), "sha256": digest, "size": len(image.data), "architecture": "x64" if image.bits == 64 else "x86", "image_base": hx(image.base), "entry_point": hx(image.entry)},
              "scope": {"kind": "focused" if requested_address is not None else "discovery", "requested_address": hx(requested_address) if requested_address is not None else None, "strings_scanned": requested_address is None},
              "seeds": [{"address": hx(a), **info, "analyzed": a in done} for a, info in seeds.items()],
              "sections": sections, "imports": imports, "exports": exports, "strings": strings, "functions": functions, "references": references,
              "coverage": {"status": "partial", "candidate_functions": len(seeds), "analyzed_functions": len(functions), "instructions": instruction_count,
                           "limits": list(dict.fromkeys(cutoffs)), "max_functions": max_functions, "max_instructions": max_instructions, "max_seconds": max_seconds},
              "metrics": {"elapsed_ms": round((time.perf_counter() - wall) * 1000, 2), "cpu_ms": round((time.process_time() - cpu) * 1000, 2), "peak_working_set_bytes": peak_memory_bytes()},
              "limitations": limitations + warnings}
    pe.close()
    return result


def main():
    parser = argparse.ArgumentParser(description="Studio Native: static x86/x64 Windows PE inspection")
    parser.add_argument("path")
    parser.add_argument("--max-functions", type=int, default=256)
    parser.add_argument("--max-instructions", type=int, default=20000)
    parser.add_argument("--max-seconds", type=int, default=30)
    parser.add_argument("--address", type=lambda value: int(value, 16), help="Virtual address in hexadecimal; decode one candidate")
    parser.add_argument("--expected-sha256", help="Required original file hash for focused analysis")
    args = parser.parse_args()
    try:
        if not 1 <= args.max_functions <= 512 or not 1 <= args.max_instructions <= 40000 or not 1 <= args.max_seconds <= 60:
            raise AnalysisError("Requested analysis budget exceeds the supported range.")
        result = analyze(args.path, args.max_functions, args.max_instructions, args.max_seconds, address=args.address, expected_sha256=args.expected_sha256)
        print(json.dumps(result, ensure_ascii=True, separators=(",", ":")))
        return 0
    except (AnalysisError, pefile.PEFormatError, OSError, ValueError, struct.error) as exc:
        print(json.dumps({"error": "Native analysis could not complete", "code": "native_input_error", "message": str(exc)}))
        return 1
    except Exception as exc:
        print(json.dumps({"error": "Native engine failure", "code": "native_engine_error", "message": str(exc)}))
        return 2


if __name__ == "__main__":
    sys.exit(main())
