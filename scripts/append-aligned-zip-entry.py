#!/usr/bin/env python3
"""Append one stored APK entry with a four-byte-aligned data offset."""

import struct
import sys
import zipfile
from pathlib import Path


def main() -> None:
    if len(sys.argv) != 4:
        raise SystemExit("Usage: append-aligned-zip-entry.py <apk> <source> <entry-name>")
    apk_path = Path(sys.argv[1])
    source_path = Path(sys.argv[2])
    entry_name = sys.argv[3]
    payload = source_path.read_bytes()

    with zipfile.ZipFile(apk_path, "a", allowZip64=True) as archive:
        header_offset = archive.start_dir
        encoded_name = entry_name.encode("utf-8")
        base_offset = header_offset + 30 + len(encoded_name)
        padding_length = (-(base_offset + 4)) % 4
        info = zipfile.ZipInfo(entry_name)
        info.compress_type = zipfile.ZIP_STORED
        info.extra = struct.pack("<HH", 0xA11E, padding_length) + bytes(padding_length)
        archive.writestr(info, payload)

    with apk_path.open("rb") as apk, zipfile.ZipFile(apk_path) as archive:
        info = archive.getinfo(entry_name)
        apk.seek(info.header_offset + 26)
        name_length, extra_length = struct.unpack("<HH", apk.read(4))
        data_offset = info.header_offset + 30 + name_length + extra_length
        if info.compress_type != zipfile.ZIP_STORED or data_offset % 4:
            raise RuntimeError(f"{entry_name} is not stored and four-byte aligned: {data_offset}")
        print(f"Appended {entry_name} at aligned data offset {data_offset}.")


if __name__ == "__main__":
    main()
