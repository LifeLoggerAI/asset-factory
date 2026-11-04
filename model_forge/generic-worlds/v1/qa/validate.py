#!/usr/bin/env python3
"""Independent structural/geometry QA for embedded static GLB2 world packages.

This validator never grants visual, historical, runtime, or device acceptance.
It reads exported bytes rather than trusting generator-side mesh summaries.
Dependencies: Python 3.10+, numpy, Pillow. See README.md for scope and limits.
"""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
from io import BytesIO
import json
from pathlib import Path
import re
import struct
import sys
from typing import Any

import numpy as np
from PIL import Image

VERSION = "urai-generic-world-glb-qa-v1"
SPEC = "https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html"
DTYPES = {5120: "i1", 5121: "u1", 5122: "<i2", 5123: "<u2", 5125: "<u4", 5126: "<f4"}
COMPONENTS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT2": 4, "MAT3": 9, "MAT4": 16}
SUPPORTED_EXTENSIONS = {"KHR_materials_unlit", "KHR_lights_punctual", "KHR_texture_transform"}


class InvalidAsset(Exception):
    def __init__(self, code: str, path: str, message: str):
        self.code, self.path, self.message = code, path, message


def require(condition: bool, code: str, path: str, message: str) -> None:
    if not condition:
        raise InvalidAsset(code, path, message)


def integer(value: Any, path: str, minimum: int = 0) -> int:
    require(type(value) is int and value >= minimum, "INTEGER", path, f"Expected an integer >= {minimum}")
    return value


def vector(value: Any, count: int, path: str) -> np.ndarray:
    require(isinstance(value, list) and len(value) == count, "VECTOR", path, f"Expected {count} numeric components")
    require(all(type(x) in (int, float) for x in value), "VECTOR", path, "Components must be numeric")
    result = np.asarray(value, dtype=np.float64)
    require(bool(np.isfinite(result).all()), "NONFINITE", path, "NaN or infinity is forbidden")
    return result


def object_value(value: Any, path: str) -> dict:
    require(isinstance(value, dict), "OBJECT", path, "Expected an object")
    return value


def reject_json_constant(value: str):
    raise ValueError(f"Nonstandard JSON constant {value}")


def unique_json_object(pairs: list[tuple[str, Any]]) -> dict:
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"Duplicate JSON key {key!r}")
        result[key] = value
    return result


def parse_glb(data: bytes) -> tuple[dict, bytes, list[dict]]:
    require(len(data) >= 20, "GLB_HEADER", "$", "File is too short for a GLB2 JSON chunk")
    magic, version, declared = struct.unpack_from("<4sII", data)
    require(magic == b"glTF", "GLB_MAGIC", "$", "Invalid GLB magic")
    require(version == 2, "GLB_VERSION", "$", f"GLB version {version} is unsupported")
    require(declared == len(data), "GLB_LENGTH", "$", f"Declared {declared} bytes, actual {len(data)}")
    chunks, cursor = [], 12
    while cursor < len(data):
        require(cursor + 8 <= len(data), "CHUNK_HEADER", "$", "Truncated GLB chunk header")
        size, kind = struct.unpack_from("<II", data, cursor)
        require(size % 4 == 0, "CHUNK_ALIGNMENT", "$", "Chunk byteLength must be a multiple of four")
        start, end = cursor + 8, cursor + 8 + size
        require(end <= len(data), "CHUNK_BOUNDS", "$", "Chunk extends beyond file")
        chunks.append((kind, data[start:end], start))
        cursor = end
    require(chunks and chunks[0][0] == 0x4E4F534A, "JSON_CHUNK", "$", "First chunk must be JSON")
    require(sum(c[0] == 0x4E4F534A for c in chunks) == 1, "JSON_CHUNK", "$", "Exactly one JSON chunk is required")
    require(sum(c[0] == 0x004E4942 for c in chunks) <= 1, "BIN_CHUNK", "$", "At most one BIN chunk is allowed")
    if any(c[0] == 0x004E4942 for c in chunks):
        require(len(chunks) >= 2 and chunks[1][0] == 0x004E4942, "BIN_ORDER", "$", "BIN must immediately follow JSON")
    try:
        document = json.loads(chunks[0][1].decode("utf-8"), parse_constant=reject_json_constant,
                              object_pairs_hook=unique_json_object)
    except (UnicodeDecodeError, ValueError) as error:
        raise InvalidAsset("JSON_PARSE", "$", str(error)) from error
    object_value(document, "$")
    binary = next((c[1] for c in chunks if c[0] == 0x004E4942), b"")
    metadata = [{"type": hex(c[0]), "bytes": len(c[1]), "dataOffset": c[2]} for c in chunks]
    return document, binary, metadata


class Validator:
    def __init__(self, file: Path, *, max_triangles: int = 2_000_000,
                 max_bytes: int = 200_000_000, max_texture_size: int = 4096,
                 max_extent: float = 1000.0, kind: str = "auto", max_texture_memory: int | None = None):
        self.file = Path(file)
        self.limits = {"sceneTriangles": max_triangles, "fileBytes": max_bytes,
                       "textureDimension": max_texture_size, "sceneExtentMeters": max_extent,
                       "textureRgba8MipBytesEstimated": max_texture_memory}
        self.kind = ("collision" if "collision" in self.file.stem.lower() else "render") if kind == "auto" else kind
        self.findings: list[dict] = []
        self.arrays: dict[int, tuple[np.ndarray, np.ndarray]] = {}
        self.metrics: dict = {}
        self.meshes: dict[int, dict] = {}
        self.texture_coords: dict[int, set[int]] = {}
        self.g: dict = {}
        self.binary = b""

    def finding(self, severity: str, code: str, path: str, message: str) -> None:
        self.findings.append({"severity": severity, "code": code, "path": path, "message": message})

    def collection(self, name: str) -> list:
        result = self.g.get(name, [])
        require(isinstance(result, list), "ARRAY", f"$.{name}", "Expected an array")
        for index, item in enumerate(result):
            object_value(item, f"$.{name}[{index}]")
        return result

    def reference(self, name: str, index: Any, path: str) -> dict:
        index = integer(index, path)
        items = self.collection(name)
        require(index < len(items), "REFERENCE", path, f"{name} index {index} exceeds collection length {len(items)}")
        return items[index]

    def section(self, method) -> None:
        try:
            method()
        except InvalidAsset as error:
            self.finding("ERROR", error.code, error.path, error.message)

    def validate(self) -> dict:
        data = b""
        try:
            data = self.file.read_bytes()
            self.g, self.binary, chunks = parse_glb(data)
            self.metrics["chunks"] = chunks
            if len(data) > self.limits["fileBytes"]:
                self.finding("ERROR", "FILE_BUDGET", "$", f"{len(data)} bytes exceed {self.limits['fileBytes']}")
            self.section(self.validate_structure)
            self.section(self.validate_buffers)
            self.section(self.validate_accessors)
            self.section(self.validate_images_materials)
            self.section(self.validate_meshes)
            self.section(self.validate_scene)
            self.section(self.validate_names)
        except InvalidAsset as error:
            self.finding("ERROR", error.code, error.path, error.message)
        except (OSError, ValueError, TypeError, OverflowError, KeyError, IndexError) as error:
            self.finding("ERROR", "UNREADABLE_OR_INVALID_SCHEMA", "$", f"{type(error).__name__}: {error}")
        errors = sum(f["severity"] == "ERROR" for f in self.findings)
        return {
            "schemaVersion": VERSION,
            "validatedAt": datetime.now(timezone.utc).isoformat(),
            "validatorSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            "file": str(self.file), "sha256": hashlib.sha256(data).hexdigest() if data else None,
            "bytes": len(data), "kind": self.kind, "limits": self.limits,
            "passed": errors == 0,
            "verdict": "MACHINE_VALIDATED_WITHIN_DECLARED_SCOPE" if errors == 0 else "NEEDS_REWORK",
            "errorCount": errors, "warningCount": sum(f["severity"] == "WARNING" for f in self.findings),
            "findings": self.findings, "metrics": self.metrics,
            "evidenceBoundary": {
                "structuralGeometryMaterialChecks": "measured from exported bytes",
                "units": "glTF meters convention; source scale/era correctness not established",
                "orientation": "glTF right-handed +Y-up, +Z asset-front; camera-forward -Z",
                "textureMemory": "estimated RGBA8 storage with complete mip chain, not measured GPU allocation",
                "frameRate": "NOT_MEASURED", "loadTime": "NOT_MEASURED",
                "runtimeIntegration": "NOT_VERIFIED", "collisionBehavior": "NOT_VERIFIED",
                "visualAcceptance": "NOT_GRANTED", "historicalAuthenticity": "NOT_GRANTED",
                "deviceCertification": "NOT_GRANTED", "independentApproval": "NOT_GRANTED",
            },
            "specification": SPEC,
        }

    def validate_structure(self) -> None:
        asset = object_value(self.g.get("asset"), "$.asset")
        require(asset.get("version") == "2.0", "ASSET_VERSION", "$.asset.version", "Expected glTF asset.version 2.0")
        if "minVersion" in asset:
            require(asset["minVersion"] == "2.0", "MIN_VERSION", "$.asset.minVersion", "Unsupported minimum version")
        used, required = self.g.get("extensionsUsed", []), self.g.get("extensionsRequired", [])
        for label, extensions in (("extensionsUsed", used), ("extensionsRequired", required)):
            require(isinstance(extensions, list) and all(isinstance(e, str) for e in extensions), "EXTENSIONS", f"$.{label}", "Expected extension-name array")
            require(len(extensions) == len(set(extensions)), "EXTENSIONS", f"$.{label}", "Duplicate extension names")
        require(set(required) <= set(used), "EXTENSIONS", "$.extensionsRequired", "Required extensions must also be listed in extensionsUsed")
        for extension in required:
            require(extension in SUPPORTED_EXTENSIONS, "UNSUPPORTED_REQUIRED_EXTENSION", "$.extensionsRequired", f"Cannot validate mandatory extension {extension}")
        for extension in set(used) - SUPPORTED_EXTENSIONS:
            self.finding("WARNING", "OPTIONAL_EXTENSION_UNCHECKED", "$.extensionsUsed", f"Optional extension {extension} is outside this checker")
        for collection in ("buffers", "bufferViews", "accessors", "meshes", "materials", "images", "textures", "samplers", "nodes", "scenes"):
            self.collection(collection)
        for collection in ("skins", "animations"):
            if self.collection(collection):
                self.finding("ERROR", "STATIC_PROFILE", f"$.{collection}", "Skinning/animation is outside the static-world QA profile")
        self.metrics["extensionsUsed"] = used
        self.metrics["extensionsRequired"] = required

    def validate_buffers(self) -> None:
        buffers = self.collection("buffers")
        require(len(buffers) == 1, "BUFFER_COUNT", "$.buffers", "Embedded world GLB requires exactly one buffer")
        require("uri" not in buffers[0], "EXTERNAL_DEPENDENCY", "$.buffers[0].uri", "World GLBs must embed their binary buffer")
        size = integer(buffers[0].get("byteLength"), "$.buffers[0].byteLength", 1)
        require(size <= len(self.binary) <= size + 3, "BUFFER_LENGTH", "$.buffers[0]", "BIN length must equal buffer byteLength plus at most 3 padding bytes")
        require(not any(self.binary[size:]), "BUFFER_PADDING", "$.buffers[0]", "BIN padding must be zero")
        self.binary = self.binary[:size]
        for index, view in enumerate(self.collection("bufferViews")):
            path = f"$.bufferViews[{index}]"
            require(view.get("buffer") == 0, "REFERENCE", path + ".buffer", "bufferView must refer to buffer 0")
            start = integer(view.get("byteOffset", 0), path + ".byteOffset")
            length = integer(view.get("byteLength"), path + ".byteLength", 1)
            require(start + length <= size, "VIEW_BOUNDS", path, "bufferView exceeds binary buffer")
            if "target" in view:
                require(view["target"] in (34962, 34963), "VIEW_TARGET", path + ".target", "Invalid WebGL buffer target")
            if "byteStride" in view:
                stride = integer(view["byteStride"], path + ".byteStride", 4)
                require(stride <= 252 and stride % 4 == 0, "STRIDE", path, "byteStride must be 4..252 and divisible by 4")

    def view_bytes(self, index: int, path: str) -> bytes:
        view = self.reference("bufferViews", index, path)
        start = integer(view.get("byteOffset", 0), path)
        length = integer(view.get("byteLength"), path, 1)
        require(view.get("buffer") == 0 and start + length <= len(self.binary), "VIEW_BOUNDS", path, "bufferView exceeds embedded buffer")
        return self.binary[start:start + length]

    def read_elements(self, view_index: int, offset: int, count: int, component_type: int,
                      accessor_type: str, path: str, sparse: bool = False) -> np.ndarray:
        view = self.reference("bufferViews", view_index, path)
        dtype = np.dtype(DTYPES[component_type])
        component_size = dtype.itemsize
        components = COMPONENTS[accessor_type]
        absolute_offset = integer(view.get("byteOffset", 0), path) + offset
        require(offset % component_size == 0 and absolute_offset % component_size == 0,
                "ACCESSOR_ALIGNMENT", path, "Accessor offsets must align to component width")
        if accessor_type.startswith("MAT"):
            dimension = int(accessor_type[-1])
            column_bytes = dimension * component_size
            padded_column = (column_bytes + 3) // 4 * 4
            component_offsets = [col * padded_column + row * component_size for col in range(dimension) for row in range(dimension)]
            element_size = dimension * padded_column
        else:
            component_offsets = list(range(0, components * component_size, component_size))
            element_size = components * component_size
        stride = integer(view.get("byteStride", element_size), path, 1)
        require(stride >= element_size and stride % component_size == 0, "ACCESSOR_STRIDE", path, "Stride is smaller than element size or misaligned")
        if sparse:
            require("byteStride" not in view and "target" not in view, "SPARSE_VIEW", path, "Sparse bufferViews must omit target and byteStride")
        last_byte = offset + stride * (count - 1) + component_offsets[-1] + component_size
        require(last_byte <= integer(view.get("byteLength"), path, 1), "ACCESSOR_BOUNDS", path, "Accessor elements exceed bufferView")
        require(absolute_offset + stride * (count - 1) + component_offsets[-1] + component_size <= len(self.binary), "ACCESSOR_BOUNDS", path, "Accessor exceeds binary buffer")
        result = np.empty((count, components), dtype=dtype)
        for component, byte_offset in enumerate(component_offsets):
            result[:, component] = np.ndarray((count,), dtype=dtype, buffer=self.binary,
                                              offset=absolute_offset + byte_offset, strides=(stride,))
        return result

    def accessor(self, index: int, path: str) -> tuple[np.ndarray, np.ndarray]:
        if index in self.arrays:
            return self.arrays[index]
        accessor = self.reference("accessors", index, path)
        base_path = f"$.accessors[{index}]"
        component_type, accessor_type = accessor.get("componentType"), accessor.get("type")
        require(component_type in DTYPES and accessor_type in COMPONENTS, "ACCESSOR_TYPE", base_path, "Unsupported componentType or accessor type")
        count = integer(accessor.get("count"), base_path + ".count", 1)
        require(count * COMPONENTS[accessor_type] * np.dtype(DTYPES[component_type]).itemsize <= max(len(self.binary), self.limits["fileBytes"]) * 4,
                "ACCESSOR_DECODE_BUDGET", base_path, "Decoded accessor exceeds safety budget; refuse unbounded allocation")
        normalized = accessor.get("normalized", False)
        require(type(normalized) is bool, "NORMALIZED", base_path, "normalized must be boolean")
        require(not normalized or component_type in (5120, 5121, 5122, 5123), "NORMALIZED", base_path, "Only byte/short integer attributes can be normalized")
        offset = integer(accessor.get("byteOffset", 0), base_path + ".byteOffset")
        if "bufferView" in accessor:
            raw = self.read_elements(accessor["bufferView"], offset, count, component_type, accessor_type, base_path)
        else:
            require(offset == 0, "ACCESSOR_OFFSET", base_path, "Accessor without bufferView cannot have nonzero byteOffset")
            raw = np.zeros((count, COMPONENTS[accessor_type]), dtype=np.dtype(DTYPES[component_type]))
        if "sparse" in accessor:
            sparse = object_value(accessor["sparse"], base_path + ".sparse")
            sparse_count = integer(sparse.get("count"), base_path + ".sparse.count", 1)
            require(sparse_count <= count, "SPARSE_COUNT", base_path, "Sparse count exceeds accessor count")
            indices = object_value(sparse.get("indices"), base_path + ".sparse.indices")
            index_type = indices.get("componentType")
            require(index_type in (5121, 5123, 5125), "SPARSE_TYPE", base_path, "Sparse indices require unsigned integer type")
            sparse_indices = self.read_elements(indices.get("bufferView"), integer(indices.get("byteOffset", 0), base_path), sparse_count, index_type, "SCALAR", base_path, sparse=True).reshape(-1)
            require(int(sparse_indices[-1]) < count and bool(np.all(sparse_indices[1:] > sparse_indices[:-1])), "SPARSE_INDICES", base_path, "Sparse indices must be strictly increasing and in range")
            values = object_value(sparse.get("values"), base_path + ".sparse.values")
            sparse_values = self.read_elements(values.get("bufferView"), integer(values.get("byteOffset", 0), base_path), sparse_count, component_type, accessor_type, base_path, sparse=True)
            raw[sparse_indices] = sparse_values
        require(bool(np.isfinite(raw).all()), "NONFINITE_ACCESSOR", base_path, "Binary accessor contains NaN or infinity")
        for label, actual in (("min", raw.min(axis=0)), ("max", raw.max(axis=0))):
            if label in accessor:
                claimed = vector(accessor[label], COMPONENTS[accessor_type], base_path + "." + label)
                match = np.allclose(claimed, actual, rtol=1e-6, atol=1e-6) if component_type == 5126 else np.array_equal(claimed, actual)
                require(bool(match), "ACCESSOR_MINMAX", base_path + "." + label, "Declared bounds differ from binary values")
        decoded = raw.astype(np.float64)
        if normalized:
            info = np.iinfo(raw.dtype)
            decoded = np.maximum(decoded / info.max, -1.0) if info.min < 0 else decoded / info.max
        self.arrays[index] = (raw, decoded)
        return raw, decoded

    def validate_accessors(self) -> None:
        for index in range(len(self.collection("accessors"))):
            self.section(lambda index=index: self.accessor(index, f"$.accessors[{index}]"))
        self.metrics["accessorCount"] = len(self.collection("accessors"))
        self.metrics["decodedAccessorBytes"] = sum(raw.nbytes for raw, _ in self.arrays.values())

    def texture_info(self, info: Any, path: str, coords: set[int]) -> None:
        info = object_value(info, path)
        self.reference("textures", info.get("index"), path + ".index")
        coord = integer(info.get("texCoord", 0), path + ".texCoord")
        transform = info.get("extensions", {}).get("KHR_texture_transform")
        if transform is not None:
            transform = object_value(transform, path + ".extensions.KHR_texture_transform")
            for key, default in (("offset", [0, 0]), ("scale", [1, 1])):
                vector(transform.get(key, default), 2, path + "." + key)
            rotation = transform.get("rotation", 0)
            require(type(rotation) in (int, float) and np.isfinite(rotation), "TEXTURE_TRANSFORM", path, "Texture rotation must be finite")
            coord = integer(transform.get("texCoord", coord), path + ".texCoord")
        coords.add(coord)

    def validate_images_materials(self) -> None:
        image_metrics = []
        hashes = Counter()
        for index, image in enumerate(self.collection("images")):
            path = f"$.images[{index}]"
            require("uri" not in image, "EXTERNAL_DEPENDENCY", path, "Images must be embedded in world GLBs")
            require(image.get("mimeType") in ("image/png", "image/jpeg"), "IMAGE_MIME", path, "Only embedded PNG/JPEG is supported by this QA profile")
            view = self.reference("bufferViews", image.get("bufferView"), path + ".bufferView")
            require("byteStride" not in view and "target" not in view, "IMAGE_VIEW", path, "Image bufferView must omit target and byteStride")
            encoded = self.view_bytes(image["bufferView"], path)
            try:
                with Image.open(BytesIO(encoded)) as decoded:
                    decoded.verify()
                with Image.open(BytesIO(encoded)) as decoded:
                    decoded.load()
                    width, height, mode, image_format = *decoded.size, decoded.mode, decoded.format
            except Exception as error:
                raise InvalidAsset("IMAGE_DECODE", path, f"Cannot decode embedded image: {error}") from error
            require(image_format == {"image/png": "PNG", "image/jpeg": "JPEG"}[image["mimeType"]], "IMAGE_MIME", path, "Declared MIME does not match image encoding")
            require(max(width, height) <= self.limits["textureDimension"], "TEXTURE_BUDGET", path, f"{width}x{height} exceeds maximum texture dimension {self.limits['textureDimension']}")
            digest = hashlib.sha256(encoded).hexdigest()
            hashes[digest] += 1
            image_metrics.append({"index": index, "width": width, "height": height, "mode": mode,
                                  "encodedBytes": len(encoded), "sha256": digest,
                                  "rgba8BytesEstimated": width * height * 4,
                                  "rgba8MipBytesEstimated": sum(max(1, width >> l) * max(1, height >> l) * 4 for l in range(max(width, height).bit_length()))})
        for digest, count in hashes.items():
            if count > 1:
                self.finding("WARNING", "DUPLICATE_IMAGE_HASH", "$.images", f"{count} embedded images share SHA-256 {digest}; reuse one image where possible")
        self.metrics["images"] = image_metrics
        self.metrics["textureRgba8MipBytesEstimated"] = sum(x["rgba8MipBytesEstimated"] for x in image_metrics)
        texture_memory_limit = self.limits["textureRgba8MipBytesEstimated"]
        if texture_memory_limit is not None:
            require(self.metrics["textureRgba8MipBytesEstimated"] <= texture_memory_limit, "TEXTURE_MEMORY_BUDGET", "$.images",
                    f"Estimated RGBA8 mip bytes {self.metrics['textureRgba8MipBytesEstimated']} exceed {texture_memory_limit}")
        for index, sampler in enumerate(self.collection("samplers")):
            path = f"$.samplers[{index}]"
            for key, allowed in (("magFilter", {9728, 9729}), ("minFilter", {9728, 9729, 9984, 9985, 9986, 9987}), ("wrapS", {33071, 33648, 10497}), ("wrapT", {33071, 33648, 10497})):
                if key in sampler:
                    require(sampler[key] in allowed, "SAMPLER_ENUM", path + "." + key, "Invalid sampler enum")
        for index, texture in enumerate(self.collection("textures")):
            self.reference("images", texture.get("source"), f"$.textures[{index}].source")
            if "sampler" in texture:
                self.reference("samplers", texture["sampler"], f"$.textures[{index}].sampler")
        for index, material in enumerate(self.collection("materials")):
            path, coords = f"$.materials[{index}]", set()
            pbr = object_value(material.get("pbrMetallicRoughness", {}), path + ".pbrMetallicRoughness")
            for key in ("metallicFactor", "roughnessFactor"):
                value = pbr.get(key, 1.0)
                require(type(value) in (int, float) and np.isfinite(value) and 0 <= value <= 1, "MATERIAL_FACTOR", path + "." + key, "PBR factor must be finite and in [0,1]")
            color = vector(pbr.get("baseColorFactor", [1, 1, 1, 1]), 4, path + ".baseColorFactor")
            require(bool(((color >= 0) & (color <= 1)).all()), "MATERIAL_FACTOR", path, "baseColorFactor must be in [0,1]")
            emissive = vector(material.get("emissiveFactor", [0, 0, 0]), 3, path + ".emissiveFactor")
            require(bool(((emissive >= 0) & (emissive <= 1)).all()), "MATERIAL_FACTOR", path, "emissiveFactor must be in [0,1] without an emissive-strength extension")
            for key in ("baseColorTexture", "metallicRoughnessTexture"):
                if key in pbr:
                    self.texture_info(pbr[key], path + "." + key, coords)
            for key in ("normalTexture", "occlusionTexture", "emissiveTexture"):
                if key in material:
                    self.texture_info(material[key], path + "." + key, coords)
            require(material.get("alphaMode", "OPAQUE") in ("OPAQUE", "MASK", "BLEND"), "ALPHA_MODE", path, "Invalid alphaMode")
            require(type(material.get("doubleSided", False)) is bool, "DOUBLE_SIDED", path, "doubleSided must be boolean")
            self.texture_coords[index] = coords
        self.metrics["materials"] = len(self.collection("materials"))
        self.metrics["externalDependencies"] = []

    def validate_meshes(self) -> None:
        require(bool(self.collection("meshes")), "MESHES", "$.meshes", "No meshes exist")
        geometry_triangles, vertices, all_primitive_metrics = 0, 0, []
        vertex_views: dict[int, set[int]] = {}
        for mesh_index, mesh in enumerate(self.collection("meshes")):
            path = f"$.meshes[{mesh_index}]"
            primitives = mesh.get("primitives")
            require(isinstance(primitives, list) and primitives, "PRIMITIVES", path, "Mesh requires nonempty primitives array")
            mesh_positions, mesh_triangles = [], 0
            for primitive_index, primitive in enumerate(primitives):
                primitive = object_value(primitive, path + ".primitives")
                ppath = f"{path}.primitives[{primitive_index}]"
                attrs = object_value(primitive.get("attributes"), ppath + ".attributes")
                require("POSITION" in attrs, "POSITION", ppath, "POSITION attribute is required")
                position_accessor = self.reference("accessors", attrs["POSITION"], ppath + ".POSITION")
                require(position_accessor.get("type") == "VEC3" and position_accessor.get("componentType") == 5126 and not position_accessor.get("normalized", False), "POSITION_TYPE", ppath, "Static profile POSITION must be FLOAT VEC3")
                require("min" in position_accessor and "max" in position_accessor, "POSITION_BOUNDS", ppath, "POSITION accessor must declare min and max")
                _, positions = self.accessor(attrs["POSITION"], ppath)
                vertex_count = len(positions)
                for semantic, accessor_index in attrs.items():
                    accessor = self.reference("accessors", accessor_index, ppath + "." + semantic)
                    require(accessor.get("count") == vertex_count, "ATTRIBUTE_COUNT", ppath + "." + semantic, "Vertex attribute count differs from POSITION")
                    _, values = self.accessor(accessor_index, ppath + "." + semantic)
                    view = self.reference("bufferViews", accessor.get("bufferView"), ppath + "." + semantic) if "bufferView" in accessor else {}
                    if "bufferView" in accessor:
                        vertex_views.setdefault(accessor["bufferView"], set()).add(accessor_index)
                    require(integer(accessor.get("byteOffset", 0), ppath) % 4 == 0 and integer(view.get("byteStride", 4), ppath) % 4 == 0, "VERTEX_ALIGNMENT", ppath + "." + semantic, "Vertex attributes must align to four-byte boundaries")
                    require(view.get("target", 34962) == 34962, "VERTEX_TARGET", ppath, "Vertex attributes cannot use ELEMENT_ARRAY_BUFFER target")
                    if semantic in ("NORMAL", "TANGENT"):
                        components = 3 if semantic == "NORMAL" else 4
                        require(accessor.get("type") == f"VEC{components}" and accessor.get("componentType") == 5126, "NORMAL_TYPE", ppath, "Normals/tangents require float vectors in static profile")
                        require(bool(np.all(np.abs(np.linalg.norm(values[:, :3], axis=1) - 1) <= 0.002)), "UNIT_NORMAL", ppath + "." + semantic, "Normal/tangent direction is not unit length")
                        if semantic == "TANGENT":
                            require(bool(np.all(np.isin(values[:, 3], [-1, 1]))), "TANGENT_W", ppath, "Tangent handedness must be +/-1")
                    if semantic.startswith("TEXCOORD_"):
                        require(accessor.get("type") == "VEC2" and (accessor.get("componentType") == 5126 or accessor.get("normalized") and accessor.get("componentType") in (5121, 5123)), "UV_TYPE", ppath, "UVs require FLOAT VEC2 or normalized unsigned VEC2")
                        if float(np.abs(values).max()) > 10_000:
                            self.finding("WARNING", "UV_EXTREME", ppath, "UV magnitude exceeds 10000; tiling/precision needs visual review")
                if self.kind == "render":
                    require("NORMAL" in attrs, "NORMAL_MISSING", ppath, "Render profile requires explicit normals")
                if "targets" in primitive:
                    require(not primitive["targets"], "STATIC_PROFILE", ppath, "Morph targets are outside this static-world checker")
                if "material" in primitive:
                    self.reference("materials", primitive["material"], ppath + ".material")
                    for coord in self.texture_coords.get(primitive["material"], set()):
                        require(f"TEXCOORD_{coord}" in attrs, "UV_MISSING", ppath, f"Material requires TEXCOORD_{coord}")
                mode = primitive.get("mode", 4)
                require(mode == 4, "PRIMITIVE_MODE", ppath, "World QA profile requires triangle primitives")
                if "indices" in primitive:
                    index_accessor = self.reference("accessors", primitive["indices"], ppath + ".indices")
                    require(index_accessor.get("type") == "SCALAR" and index_accessor.get("componentType") in (5121, 5123, 5125) and not index_accessor.get("normalized", False), "INDEX_TYPE", ppath, "Indices require unsigned scalar integers")
                    view = self.reference("bufferViews", index_accessor.get("bufferView"), ppath + ".indices") if "bufferView" in index_accessor else {}
                    require("byteStride" not in view and view.get("target", 34963) == 34963, "INDEX_VIEW", ppath, "Index view must omit byteStride and cannot use vertex target")
                    indices = self.accessor(primitive["indices"], ppath)[0].reshape(-1).astype(np.int64)
                    require(int(indices.max()) < vertex_count, "INDEX_RANGE", ppath, "Index references absent vertex")
                    restart = np.iinfo(np.dtype(DTYPES[index_accessor["componentType"]])).max
                    require(not bool(np.any(indices == restart)), "INDEX_RESTART", ppath, "glTF forbids primitive-restart index value")
                else:
                    indices = np.arange(vertex_count)
                require(len(indices) % 3 == 0, "TRIANGLE_COUNT", ppath, "Triangle primitive count must be divisible by three")
                triangle_indices = indices.reshape(-1, 3)
                triangles = positions[triangle_indices]
                cross = np.cross(triangles[:, 1] - triangles[:, 0], triangles[:, 2] - triangles[:, 0])
                doubled_areas = np.linalg.norm(cross, axis=1)
                require(bool(np.all(doubled_areas > 1e-10)), "DEGENERATE_TRIANGLE", ppath, f"{int(np.sum(doubled_areas <= 1e-10))} triangles have zero/negligible area")
                if "NORMAL" in attrs:
                    normals = self.accessor(attrs["NORMAL"], ppath)[1][triangle_indices].mean(axis=1)
                    negative = np.einsum("ij,ij->i", normals, cross) < -1e-10
                    if np.any(negative):
                        self.finding("WARNING", "WINDING_NORMAL_DISAGREEMENT", ppath, f"{int(negative.sum())} triangles face opposite their averaged normals")
                for coord in self.texture_coords.get(primitive.get("material"), set()):
                    uv = self.accessor(attrs[f"TEXCOORD_{coord}"], ppath)[1][triangle_indices]
                    du, dv = uv[:, 1] - uv[:, 0], uv[:, 2] - uv[:, 0]
                    areas = np.abs(du[:, 0] * dv[:, 1] - du[:, 1] * dv[:, 0])
                    require(bool(np.any(areas > 1e-12)), "UV_COLLAPSED", ppath, "All textured triangles have collapsed UVs")
                    count = int(np.sum(areas <= 1e-12))
                    if count:
                        self.finding("WARNING", "UV_DEGENERATE", ppath, f"{count} textured triangles have collapsed UV area")
                mesh_positions.append(positions)
                count = len(triangle_indices)
                mesh_triangles += count
                vertices += vertex_count
                all_primitive_metrics.append({"mesh": mesh_index, "primitive": primitive_index,
                                              "vertices": vertex_count, "triangles": count,
                                              "boundsMin": positions.min(axis=0).tolist(), "boundsMax": positions.max(axis=0).tolist(),
                                              "minimumTriangleAreaSquareMeters": float(doubled_areas.min() / 2)})
            merged = np.concatenate(mesh_positions)
            self.meshes[mesh_index] = {"positions": merged, "triangles": mesh_triangles}
            geometry_triangles += mesh_triangles
        for view_index, accessor_indices in vertex_views.items():
            require(len(accessor_indices) < 2 or "byteStride" in self.collection("bufferViews")[view_index],
                    "SHARED_VERTEX_VIEW_STRIDE", f"$.bufferViews[{view_index}]", "Two or more attribute accessors in one bufferView require byteStride")
        self.metrics.update({"meshCount": len(self.meshes), "uniqueMeshTriangles": geometry_triangles,
                             "primitiveVertexCount": vertices, "primitives": all_primitive_metrics})

    def local_transform(self, node: dict, path: str) -> np.ndarray:
        if "matrix" in node:
            require(not any(k in node for k in ("translation", "rotation", "scale")), "TRANSFORM", path, "matrix and TRS cannot coexist")
            result = vector(node["matrix"], 16, path + ".matrix").reshape((4, 4), order="F")
            require(bool(np.allclose(result[3], [0, 0, 0, 1], atol=1e-7)), "TRANSFORM", path, "Matrix must be affine")
            basis = result[:3, :3]
            lengths = np.linalg.norm(basis, axis=0)
            require(bool(np.all(lengths > 1e-10)), "ZERO_SCALE", path, "World profile forbids collapsed transforms")
            normalized = basis / lengths
            require(bool(np.allclose(normalized.T @ normalized, np.eye(3), atol=1e-5)), "MATRIX_SHEAR", path, "Matrix cannot contain shear")
            return result
        translation = vector(node.get("translation", [0, 0, 0]), 3, path + ".translation")
        scale = vector(node.get("scale", [1, 1, 1]), 3, path + ".scale")
        require(bool(np.all(np.abs(scale) > 1e-10)), "ZERO_SCALE", path, "World profile forbids collapsed transforms")
        quaternion = vector(node.get("rotation", [0, 0, 0, 1]), 4, path + ".rotation")
        require(abs(float(np.linalg.norm(quaternion)) - 1) <= 1e-5, "QUATERNION", path, "Node rotation must be a unit quaternion")
        x, y, z, w = quaternion
        rotation = np.array([[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)],
                             [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)],
                             [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]])
        result = np.eye(4)
        result[:3, :3], result[:3, 3] = rotation @ np.diag(scale), translation
        return result

    def validate_scene(self) -> None:
        nodes = self.collection("nodes")
        require(bool(nodes), "NODES", "$.nodes", "World GLB requires scene nodes")
        parents, transforms, child_lists = {}, {}, {}
        for index, node in enumerate(nodes):
            path = f"$.nodes[{index}]"
            transforms[index] = self.local_transform(node, path)
            if "mesh" in node:
                self.reference("meshes", node["mesh"], path + ".mesh")
            children = node.get("children", [])
            require(isinstance(children, list), "CHILDREN", path, "children must be an array")
            require(all(type(c) is int for c in children), "CHILDREN", path, "children must contain node indices")
            require(len(children) == len(set(children)), "DUPLICATE_CHILD", path, "Duplicate child node")
            for child in children:
                self.reference("nodes", child, path + ".children")
                require(child not in parents, "MULTIPLE_PARENTS", path, "Node appears under multiple parents")
                parents[child] = index
            child_lists[index] = children
            if "skin" in node:
                self.finding("ERROR", "STATIC_PROFILE", path + ".skin", "Skinned world nodes are outside this checker")
            light = node.get("extensions", {}).get("KHR_lights_punctual", {}).get("light")
            if light is not None:
                lights = self.g.get("extensions", {}).get("KHR_lights_punctual", {}).get("lights", [])
                require(isinstance(lights, list) and type(light) is int and 0 <= light < len(lights), "LIGHT_REFERENCE", path, "Invalid punctual light reference")
        # Examine every component; cycles cannot hide outside the selected scene.
        state = {}
        for start in range(len(nodes)):
            if state.get(start) == 2:
                continue
            stack = [(start, False)]
            while stack:
                index, finish = stack.pop()
                if finish:
                    state[index] = 2
                elif state.get(index) == 1:
                    raise InvalidAsset("NODE_CYCLE", f"$.nodes[{index}]", "Scene hierarchy contains a cycle")
                elif state.get(index) != 2:
                    state[index] = 1
                    stack.append((index, True))
                    stack.extend((child, False) for child in reversed(child_lists[index]))
        scenes = self.collection("scenes")
        require(bool(scenes), "SCENES", "$.scenes", "World GLB requires a declared scene")
        for index, scene in enumerate(scenes):
            roots = scene.get("nodes", [])
            require(isinstance(roots, list) and all(type(n) is int for n in roots), "SCENE_ROOTS", f"$.scenes[{index}]", "Scene roots must be node-index array")
            require(len(roots) == len(set(roots)), "SCENE_ROOTS", f"$.scenes[{index}]", "Duplicate scene roots")
            for root in roots:
                self.reference("nodes", root, f"$.scenes[{index}].nodes")
                require(root not in parents, "SCENE_ROOT_PARENT", f"$.scenes[{index}]", "Scene roots cannot be children of another node")
        default_scene = self.g.get("scene", 0)
        scene = self.reference("scenes", default_scene, "$.scene")
        lower, upper, triangles, rendered_nodes = [], [], 0, []
        stack = [(root, np.eye(4)) for root in scene.get("nodes", [])]
        while stack:
            index, parent = stack.pop()
            node = nodes[index]
            world = parent @ transforms[index]
            if "mesh" in node and node["mesh"] in self.meshes:
                mesh = self.meshes[node["mesh"]]
                positions = mesh["positions"] @ world[:3, :3].T + world[:3, 3]
                require(bool(np.isfinite(positions).all()), "WORLD_BOUNDS", f"$.nodes[{index}]", "Transformed positions are nonfinite")
                lower.append(positions.min(axis=0))
                upper.append(positions.max(axis=0))
                triangles += mesh["triangles"]
                rendered_nodes.append(index)
            stack.extend((child, world) for child in child_lists[index])
        require(bool(lower), "SCENE_EMPTY", "$.scene", "Selected scene has no validated visible mesh geometry")
        minimum, maximum = np.min(lower, axis=0), np.max(upper, axis=0)
        extent = maximum - minimum
        self.metrics.update({"sceneTriangles": triangles, "sceneMeshInstances": len(rendered_nodes),
                             "sceneBoundsMinMeters": minimum.tolist(), "sceneBoundsMaxMeters": maximum.tolist(),
                             "sceneExtentMeters": extent.tolist(), "sceneCenterMeters": ((minimum + maximum) / 2).tolist()})
        require(float(extent.max()) <= self.limits["sceneExtentMeters"], "SCALE_BOUNDS", "$.scene", f"Scene extent {extent.tolist()} exceeds {self.limits['sceneExtentMeters']} meter profile")
        require(float(np.abs([minimum, maximum]).max()) <= 5000, "ORIGIN_DISTANCE", "$.scene", "Geometry exceeds 5 km from origin; rebase package for runtime precision")
        require(triangles <= self.limits["sceneTriangles"], "TRIANGLE_BUDGET", "$.scene", f"Scene instances total {triangles} triangles, limit {self.limits['sceneTriangles']}")
        unused_meshes = set(range(len(self.collection("meshes")))) - {nodes[n]["mesh"] for n in rendered_nodes}
        if unused_meshes:
            self.finding("WARNING", "UNREACHABLE_MESH", "$.scene", f"Meshes {sorted(unused_meshes)} are absent from selected scene")

    def validate_names(self) -> None:
        for collection in ("nodes", "meshes", "materials"):
            names = Counter()
            for index, item in enumerate(self.collection(collection)):
                name = item.get("name")
                if not isinstance(name, str) or not name.strip():
                    self.finding("WARNING", "NAME_MISSING", f"$.{collection}[{index}]", "Governed asset elements should have stable names")
                else:
                    names[name] += 1
                    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.:/+ -]*", name):
                        self.finding("WARNING", "NAME_CONVENTION", f"$.{collection}[{index}]", "Name includes characters unsuitable for stable scene identifiers")
            for name, count in names.items():
                if count > 1:
                    self.finding("WARNING", "DUPLICATE_NAME", f"$.{collection}", f"Name {name!r} repeats {count} times")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("file", type=Path)
    parser.add_argument("--report", type=Path, help="Write machine-readable JSON; stdout always contains the report")
    parser.add_argument("--max-triangles", type=int, default=2_000_000, help="Maximum scene-instanced triangles")
    parser.add_argument("--max-bytes", type=int, default=200_000_000)
    parser.add_argument("--max-texture-size", type=int, default=4096)
    parser.add_argument("--max-texture-memory", type=int, help="Maximum estimated RGBA8 bytes with mip chain")
    parser.add_argument("--max-extent", type=float, default=1000.0, help="Maximum AABB extent in glTF meters")
    parser.add_argument("--kind", choices=("auto", "render", "collision"), default="auto")
    args = parser.parse_args(argv)
    if min(args.max_triangles, args.max_bytes, args.max_texture_size) < 1 or args.max_extent <= 0 or not np.isfinite(args.max_extent):
        parser.error("Budgets must be positive and finite")
    if args.max_texture_memory is not None and args.max_texture_memory < 1:
        parser.error("Texture memory budget must be positive")
    report = Validator(args.file, max_triangles=args.max_triangles, max_bytes=args.max_bytes,
                       max_texture_size=args.max_texture_size, max_extent=args.max_extent, kind=args.kind,
                       max_texture_memory=args.max_texture_memory).validate()
    output = json.dumps(report, indent=2, allow_nan=False) + "\n"
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(output)
    sys.stdout.write(output)
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
