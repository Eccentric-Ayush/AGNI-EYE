"""Minimal Mapbox Vector Tile (MVT) point decoder - prototype to verify GIBS fire data attributes."""
import struct
import json


def read_varint(data, pos):
    result = 0
    shift = 0
    while True:
        b = data[pos]
        result |= (b & 0x7F) << shift
        pos += 1
        if not (b & 0x80):
            break
        shift += 7
    return result, pos


def zigzag_decode(n):
    return (n >> 1) ^ (-(n & 1))


def decode_value(data):
    pos = 0
    val = None
    while pos < len(data):
        tag, pos = read_varint(data, pos)
        field_num = tag >> 3
        wire_type = tag & 0x07
        if wire_type == 0:
            v, pos = read_varint(data, pos)
            if field_num == 1:
                val = v == 1  # bool_value
            elif field_num == 2:
                val = v       # uint_value
            elif field_num == 3:
                val = zigzag_decode(v)  # sint_value
            elif field_num == 5:
                val = v       # int_value
        elif wire_type == 5:
            val = struct.unpack('<f', data[pos:pos + 4])[0]
            pos += 4
        elif wire_type == 1:
            val = struct.unpack('<d', data[pos:pos + 8])[0]
            pos += 8
        elif wire_type == 2:
            length, pos = read_varint(data, pos)
            val = data[pos:pos + length].decode('utf-8')
            pos += length
        else:
            break
    return val


def decode_feature(data):
    pos = 0
    tags = []
    geom_type = None
    while pos < len(data):
        tag, pos = read_varint(data, pos)
        field_num = tag >> 3
        wire_type = tag & 0x07
        if wire_type == 0:
            v, pos = read_varint(data, pos)
            if field_num == 3:
                geom_type = v
        elif wire_type == 2:
            length, pos = read_varint(data, pos)
            payload = data[pos:pos + length]
            pos += length
            if field_num == 2:
                p = 0
                while p < len(payload):
                    k, p = read_varint(payload, p)
                    v, p = read_varint(payload, p)
                    tags.extend([k, v])
        elif wire_type == 1:
            pos += 8
        elif wire_type == 5:
            pos += 4
        else:
            break
    if geom_type != 1:
        return None
    return tags


def decode_layer_full(data):
    name = None
    keys = []
    values = []
    features = []
    pos = 0
    while pos < len(data):
        tag, pos = read_varint(data, pos)
        field_num = tag >> 3
        wire_type = tag & 0x07
        if wire_type == 2:
            length, pos = read_varint(data, pos)
            payload = data[pos:pos + length]
            pos += length
            if field_num == 1:
                name = payload.decode()
            elif field_num == 2:
                features.append(payload)
            elif field_num == 3:
                keys.append(payload.decode())
            elif field_num == 4:
                values.append(decode_value(payload))
        elif wire_type == 0:
            _, pos = read_varint(data, pos)
        else:
            break
    return name, keys, values, features


def decode_tile_points(data, keep_geom=True):
    """Return {layer_name: [ {attrs..., x, y} ]} for point features."""
    out = {}
    pos = 0
    while pos < len(data):
        tag, pos = read_varint(data, pos)
        field_num = tag >> 3
        wire_type = tag & 0x07
        if wire_type == 2:
            length, pos = read_varint(data, pos)
            payload = data[pos:pos + length]
            pos += length
            if field_num == 3:
                lname, keys, values, fpayloads = decode_layer_full(payload)
                feats = []
                for fp in fpayloads:
                    tags = decode_feature(fp)
                    if tags is None:
                        continue
                    attrs = {}
                    for i in range(0, len(tags), 2):
                        attrs[keys[tags[i]]] = values[tags[i + 1]]
                    feats.append(attrs)
                out[lname] = feats
        elif wire_type == 0:
            _, pos = read_varint(data, pos)
        else:
            break
    return out


if __name__ == '__main__':
    raw = open('/home/z/my-project/test_tile.mvt', 'rb').read()
    if raw[:2] == b'\x1f\x8b':
        import gzip
        raw = gzip.decompress(raw)
    layers = decode_tile_points(raw)
    for lname, feats in layers.items():
        print(f"LAYER {lname}: {len(feats)} points")
        if feats:
            print("SAMPLE ATTRS:", json.dumps(feats[0], default=str))
            break
