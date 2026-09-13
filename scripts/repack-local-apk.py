#!/usr/bin/env python3
"""Repack a known-good APK with a new bundle, manifest and launcher artwork.

The native shell stays unchanged. Stored entries are explicitly aligned so
Hermes, resources.arsc and native libraries remain safe to memory-map.
"""

import argparse
import hashlib
import struct
import tarfile
import zipfile
from pathlib import Path


LAUNCHER_PATTERNS = ("ic_launcher.webp", "ic_launcher_round.webp", "ic_launcher_foreground.webp", "ic_launcher_monochrome.webp")


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def launcher_sources(root: Path) -> list[Path]:
    res = root / "android/app/src/main/res"
    return sorted(path for path in res.glob("mipmap-*/*") if path.name in LAUNCHER_PATTERNS)


def baseline_resources(archive_path: Path) -> dict[str, bytes]:
    resources: dict[str, bytes] = {}
    with tarfile.open(archive_path, "r:gz") as archive:
        for member in archive.getmembers():
            path = Path(member.name.removeprefix("./"))
            parts = path.parts
            if "android" not in parts:
                continue
            path = Path(*parts[parts.index("android"):])
            relative = str(path)
            wanted = path.parent.name.startswith("mipmap-") and path.name in LAUNCHER_PATTERNS
            if not member.isfile() or not wanted:
                continue
            source = archive.extractfile(member)
            if source is not None:
                resources[relative] = source.read()
    return resources


def build_replacements(base_apk: Path, baseline_archive: Path, source_root: Path) -> dict[str, bytes]:
    old_by_path = baseline_resources(baseline_archive)
    new_by_path = {
        str(path.relative_to(source_root)): path.read_bytes()
        for path in launcher_sources(source_root)
    }
    with zipfile.ZipFile(base_apk) as archive:
        apk_hashes: dict[str, list[str]] = {}
        for info in archive.infolist():
            if info.is_dir():
                continue
            apk_hashes.setdefault(digest(archive.read(info)), []).append(info.filename)

    replacements: dict[str, bytes] = {}
    for path, old_bytes in old_by_path.items():
        candidates = apk_hashes.get(digest(old_bytes), [])
        if path not in new_by_path:
            raise RuntimeError(f"Updated launcher resource is missing: {path}")
        if len(candidates) == 1:
            replacements[candidates[0]] = new_by_path[path]
            continue
        matching_paths = [candidate_path for candidate_path, candidate_bytes in old_by_path.items() if digest(candidate_bytes) == digest(old_bytes)]
        updated_digests = {digest(new_by_path[candidate_path]) for candidate_path in matching_paths if candidate_path in new_by_path}
        if candidates and len(candidates) == len(matching_paths) and len(updated_digests) == 1:
            for candidate in candidates:
                replacements[candidate] = new_by_path[path]
            continue
        raise RuntimeError(f"Could not deterministically map {path} into the baseline APK: {candidates}")
    return replacements


def aligned_extra(current_offset: int, name: str, alignment: int) -> bytes:
    base_offset = current_offset + 30 + len(name.encode("utf-8"))
    padding = (-(base_offset + 4)) % alignment
    return struct.pack("<HH", 0xA11E, padding) + bytes(padding)


def clone_info(info: zipfile.ZipInfo) -> zipfile.ZipInfo:
    cloned = zipfile.ZipInfo(info.filename, info.date_time)
    cloned.compress_type = info.compress_type
    cloned.comment = info.comment
    cloned.create_system = info.create_system
    cloned.create_version = info.create_version
    cloned.extract_version = info.extract_version
    cloned.external_attr = info.external_attr
    cloned.internal_attr = info.internal_attr
    cloned.flag_bits = info.flag_bits & ~0x08
    return cloned


def alignment_for(name: str, compression: int) -> int:
    if compression != zipfile.ZIP_STORED:
        return 1
    if name.startswith("lib/") and name.endswith(".so"):
        return 4096
    return 4


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-apk", type=Path, required=True)
    parser.add_argument("--baseline-source", type=Path, required=True)
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--bundle", type=Path, required=True)
    parser.add_argument("--app-config", type=Path, help="Replace the embedded public Expo configuration")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--skip-launcher", action="store_true", help="Retain launcher resources from the base APK")
    args = parser.parse_args()
    native_location = args.source_root / "android/app/src/main/java/com/aerobrief/android/AeroBriefLocationPackage.kt"
    if native_location.exists():
        raise RuntimeError("This source includes a new native GPS module. Build Android with Gradle; repacking an older APK cannot compile/register it or verify its permissions.")

    replacements = {} if args.skip_launcher else build_replacements(args.base_apk, args.baseline_source, args.source_root)
    launcher_count = len(replacements)
    replacements["AndroidManifest.xml"] = args.manifest.read_bytes()
    replacements["assets/index.android.bundle"] = args.bundle.read_bytes()
    if args.app_config is not None:
        replacements["assets/app.config"] = args.app_config.read_bytes()
    skipped = set(replacements)

    with zipfile.ZipFile(args.base_apk) as source, zipfile.ZipFile(args.output, "w", allowZip64=True) as target:
        for original in source.infolist():
            name = original.filename
            if name.startswith("META-INF/") or name in skipped:
                continue
            info = clone_info(original)
            alignment = alignment_for(name, info.compress_type)
            if alignment > 1:
                info.extra = aligned_extra(target.fp.tell(), name, alignment)
            target.writestr(info, source.read(original), compress_type=info.compress_type)

        for name, payload in replacements.items():
            original = source.getinfo(name)
            info = clone_info(original)
            if name == "assets/index.android.bundle":
                info.compress_type = zipfile.ZIP_STORED
            alignment = alignment_for(name, info.compress_type)
            if alignment > 1:
                info.extra = aligned_extra(target.fp.tell(), name, alignment)
            target.writestr(info, payload, compress_type=info.compress_type)

    print(f"Repacked {args.output} with {launcher_count} launcher resources.")


if __name__ == "__main__":
    main()
