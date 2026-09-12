#!/usr/bin/env python3
"""Independent hashlib verifier for fixed proof fixtures; no nonce search."""
import hashlib
import json
import struct
import sys


def verify(header, solution, n, k):
    digit = n // (k + 1)
    assert len(header) == 140 and len(solution) * 8 == (1 << k) * (digit + 1)
    bits = int.from_bytes(solution, 'big')
    mask = (1 << (digit + 1)) - 1
    indices = [(bits >> ((1 << k) - i - 1) * (digit + 1)) & mask for i in range(1 << k)]
    assert len(set(indices)) == len(indices), 'duplicate indices'
    per_hash = 512 // n
    personal = b'ZcashPoW' + struct.pack('<II', n, k)

    def tree(values, depth):
        if depth == 0:
            index = values[0]
            digest = hashlib.blake2b(header + struct.pack('<I', index // per_hash),
                                     digest_size=per_hash*n//8, person=personal).digest()
            offset = (index % per_hash) * n // 8
            return int.from_bytes(digest[offset:offset+n//8], 'big')
        half = len(values) // 2
        assert values[0] < values[half], 'noncanonical subtree order'
        result = tree(values[:half], depth-1) ^ tree(values[half:], depth-1)
        required = n if depth == k else depth * digit
        assert result >> (n-required) == 0, 'collision prefix does not vanish'
        return result

    assert tree(indices, k) == 0


path = sys.argv[1]
fixture = json.load(open(path))
if 'header_hex' in fixture:
    raw = bytes.fromhex(fixture['header_hex'])
    assert raw[140:143] == bytes.fromhex('fd9001')
    assert hashlib.sha256(hashlib.sha256(raw).digest()).digest()[::-1].hex() == fixture['block_hash']
    verify(raw[:140], raw[143:], 192, 7)
    print('PASS independent mainnet block hash and Equihash192,7 verification')
else:
    n, k = (192, 7) if fixture['kind'] == 'historical' else (96, 5)
    for entry in fixture['proofs']:
        verify(bytes(entry['header']), bytes(entry['proof']), n, k)
    print(f"PASS independent verification of {len(fixture['proofs'])} GPU-generated {n},{k} proof(s)")
