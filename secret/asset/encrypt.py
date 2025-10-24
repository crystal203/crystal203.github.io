# encrypt_down_block.py
import os
import numpy as np
from PIL import Image

KEY = "your-secret-key-2025"  # ← 必须与前端 DECRYPT_KEY 一致
BLOCK_SIZE = 128

# === 纯数学哈希：djb2 变种，返回 uint32 ===
def simple_hash_u32(s: str) -> int:
    h = 5381
    for c in s.encode('utf-8'):
        h = ((h * 33) ^ c) & 0xFFFFFFFF
    return h

def simple_hash_byte(s: str) -> int:
    return simple_hash_u32(s) & 0xFF

# === LCG 随机数生成器 ===
def lcg_next(state: int) -> int:
    return (1664525 * state + 1013904223) & 0xFFFFFFFF

# === 生成块置换 ===
def generate_perm(n: int, seed: int) -> list:
    if seed == 0:
        seed = 1
    state = seed
    perm = list(range(n))
    for i in range(n - 1, 0, -1):
        state = lcg_next(state)
        j = state % (i + 1)
        perm[i], perm[j] = perm[j], perm[i]
    return perm

# === 主加密函数 ===
def encrypt_down_block(input_path: str, output_path: str, key: str):
    img = Image.open(input_path).convert('RGBA')
    w, h = img.size
    arr = np.array(img)  # (h, w, 4)
    output_arr = arr.copy()  # 默认原样复制，只改完整块

    block_h = h // BLOCK_SIZE  # ← 只取完整块数
    block_w = w // BLOCK_SIZE

    if block_w == 0 or block_h == 0:
        # 图像太小，无完整块，直接保存原图
        result_img = Image.fromarray(arr, 'RGBA')
        result_img.save(output_path, format='PNG', compress_level=0, optimize=False)
        print(f"Image too small, skipped encryption: {input_path}")
        return

    total_blocks = block_h * block_w

    # 提取完整块（无需填充）
    blocks = []
    for by in range(block_h):
        for bx in range(block_w):
            x0, y0 = bx * BLOCK_SIZE, by * BLOCK_SIZE
            x1, y1 = x0 + BLOCK_SIZE, y0 + BLOCK_SIZE
            block = arr[y0:y1, x0:x1].copy()
            blocks.append(block)

    # 生成置换
    perm_seed = simple_hash_u32(key + "_block_perm")
    perm = generate_perm(total_blocks, perm_seed)

    # 写回加密块
    for idx, p in enumerate(perm):
        block_data = blocks[p]
        #xor_val = simple_hash_byte(key + f"_xor_{idx}")
        xor_val = 0
        xor_vec = np.array([xor_val, xor_val, xor_val, xor_val], dtype=np.uint8)
        confused = np.bitwise_xor(block_data, xor_vec)

        dst_bx = idx % block_w
        dst_by = idx // block_w
        x0, y0 = dst_bx * BLOCK_SIZE, dst_by * BLOCK_SIZE
        x1, y1 = x0 + BLOCK_SIZE, y0 + BLOCK_SIZE
        output_arr[y0:y1, x0:x1] = confused

    # 保存
    result_img = Image.fromarray(output_arr, 'RGBA')
    result_img.save(output_path, format='PNG')
    print(f"Encrypted: {input_path} -> {output_path}")

# === 批量处理 ===
if __name__ == "__main__":
    asset_root = "asset"
    #for char_dir in os.listdir(asset_root):
    #    char_path = os.path.join(asset_root, char_dir)
    char_path = "./eugene"
    #if not os.path.isdir(char_path):
        #continue
    down_path = os.path.join(char_path, "down.png")
    if os.path.isfile(down_path):
        bak_path = down_path + ".bak"
        if not os.path.exists(bak_path):
            os.replace(down_path, bak_path)
        encrypt_down_block(bak_path, down_path, KEY)
