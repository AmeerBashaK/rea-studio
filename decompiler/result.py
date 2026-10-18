# SPDX-License-Identifier: AGPL-3.0-only
"""Validate decompiler output before a future desktop integration consumes it."""
import json
import re

STATUSES = {'complete', 'no-function', 'failed', 'timeout', 'output-limit'}

def validate(raw, expected_sha256, expected_address):
    if not isinstance(raw, bytes) or len(raw) > 3 * 1024 * 1024:
        raise ValueError('Decompiler report exceeds output budget')
    if not isinstance(expected_sha256, str) or not re.fullmatch(r'[0-9a-fA-F]{64}', expected_sha256):
        raise ValueError('Expected input hash is required')
    if not isinstance(expected_address, str) or not re.fullmatch(r'0x[0-9a-fA-F]{1,16}', expected_address):
        raise ValueError('Expected hexadecimal address is required')
    data = json.loads(raw)
    if not isinstance(data, dict) or data.get('schema') != 'studio-decompiler/1' or data.get('engine') != 'Ghidra':
        raise ValueError('Unknown decompiler report')
    if not isinstance(data.get('sha256'), str) or data['sha256'].lower() != expected_sha256.lower():
        raise ValueError('Decompiler input hash mismatch')
    address = data.get('address')
    if not isinstance(address, str) or not re.fullmatch(r'0x[0-9a-fA-F]{1,16}', address) or int(address, 16) != int(expected_address, 16):
        raise ValueError('Decompiler address mismatch')
    if data.get('status') not in STATUSES or not isinstance(data.get('engineVersion'), str) or not data['engineVersion']:
        raise ValueError('Invalid decompiler outcome')
    if data['status'] == 'complete':
        if not isinstance(data.get('code'), str) or not data['code'].strip() or len(data['code'].encode('utf-8')) > 2 * 1024 * 1024:
            raise ValueError('Invalid pseudocode')
    elif 'code' in data:
        raise ValueError('Failed outcomes cannot contain pseudocode')
    return data
