import argparse
import datetime as dt
import struct
from pathlib import Path


SCALE = 0.001
HEADER_SIZE = 227
POINT_FORMAT = 2
POINT_RECORD_LENGTH = 26


def padded_ascii(text, size):
    data = text.encode("ascii", errors="ignore")[:size]
    return data + b"\0" * (size - len(data))


def read_point(line):
    parts = [part.strip() for part in line.split(",")]
    if len(parts) < 6:
        return None

    x, y, z = (float(parts[0]), float(parts[1]), float(parts[2]))
    r, g, b = (int(float(parts[3])), int(float(parts[4])), int(float(parts[5])))
    return x, y, z, max(0, min(255, r)), max(0, min(255, g)), max(0, min(255, b))


def scan_xyz(path):
    mins = [float("inf"), float("inf"), float("inf")]
    maxs = [float("-inf"), float("-inf"), float("-inf")]
    count = 0

    with path.open("r", encoding="utf-8", errors="ignore") as src:
        for line in src:
            point = read_point(line)
            if point is None:
                continue

            for index, value in enumerate(point[:3]):
                mins[index] = min(mins[index], value)
                maxs[index] = max(maxs[index], value)

            count += 1

    if count == 0:
        raise ValueError(f"No valid XYZRGB points found in {path}")

    return count, mins, maxs


def make_header(count, mins, maxs, source_name):
    now = dt.datetime.now()
    header = bytearray(HEADER_SIZE)
    padded_mins = [value - (2 * SCALE) for value in mins]
    padded_maxs = [value + (2 * SCALE) for value in maxs]

    struct.pack_into("<4sHHIHH8sBB", header, 0, b"LASF", 0, 0, 0, 0, 0, b"\0" * 8, 1, 2)
    header[26:58] = padded_ascii("JBC Topografia", 32)
    header[58:90] = padded_ascii(f"XYZ to LAS {source_name}", 32)
    struct.pack_into("<HHHIIBHI", header, 90, int(now.strftime("%j")), now.year, HEADER_SIZE, HEADER_SIZE, 0, POINT_FORMAT, POINT_RECORD_LENGTH, count)

    by_return = [count, 0, 0, 0, 0]
    struct.pack_into("<5I", header, 111, *by_return)
    struct.pack_into("<ddd", header, 131, SCALE, SCALE, SCALE)
    struct.pack_into("<ddd", header, 155, mins[0], mins[1], mins[2])
    struct.pack_into("<dddddd", header, 179, padded_maxs[0], padded_mins[0], padded_maxs[1], padded_mins[1], padded_maxs[2], padded_mins[2])

    return header


def convert_xyz_to_las(source, target):
    source = Path(source)
    target = Path(target)
    target.parent.mkdir(parents=True, exist_ok=True)

    count, mins, maxs = scan_xyz(source)
    header = make_header(count, mins, maxs, source.stem)

    with source.open("r", encoding="utf-8", errors="ignore") as src, target.open("wb") as dst:
        dst.write(header)

        for line in src:
            point = read_point(line)
            if point is None:
                continue

            x, y, z, r, g, b = point
            ix = round((x - mins[0]) / SCALE)
            iy = round((y - mins[1]) / SCALE)
            iz = round((z - mins[2]) / SCALE)

            dst.write(
                struct.pack(
                    "<iiiHBBbBHHHH",
                    ix,
                    iy,
                    iz,
                    0,
                    9,
                    1,
                    0,
                    0,
                    0,
                    r * 256,
                    g * 256,
                    b * 256,
                )
            )

    return count, mins, maxs


def main():
    parser = argparse.ArgumentParser(description="Convert comma-separated XYZRGB files to LAS 1.2 point format 2.")
    parser.add_argument("source")
    parser.add_argument("target")
    args = parser.parse_args()

    count, mins, maxs = convert_xyz_to_las(args.source, args.target)
    print(f"wrote {args.target}")
    print(f"points: {count}")
    print(f"bbox_min: {mins}")
    print(f"bbox_max: {maxs}")


if __name__ == "__main__":
    main()
