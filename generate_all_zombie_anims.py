"""
Generate animation spritesheets for zombie variants with a layout
that fits within WebGL's MAX_TEXTURE_SIZE (safe at 4096×4096).

16 zombie variants (evenly sampled from the 64 in the source sheet).
Each gets 8 idle + 8 walk frames = 16 frames per row.

IMPORTANT: Animations move the WHOLE sprite as one piece (no splitting).
This guarantees no body parts (hands, feet) are ever cropped.

Output cells are 128×256 (wider than the 96px source to allow sway room).
Zombies are centered horizontally in the cell.

Output: assets/zombie_all_anim_spritesheet.png
Layout: 16 columns × 16 rows = 2048×4096
  Phaser: frameWidth=128, frameHeight=256
  Variant V (0-15):
    Idle frames:  V*16 + 0..7
    Walk frames:  V*16 + 8..15
"""

from PIL import Image
import math

SPRITESHEET = 'assets/zombie_spritesheet.png'
OUTPUT = 'assets/zombie_all_anim_spritesheet.png'

SRC_CELL_W = 96
SRC_CELL_H = 256
OUT_CELL_W = 128
OUT_CELL_H = 256
PAD_X = (OUT_CELL_W - SRC_CELL_W) // 2  # 16px padding each side

SRC_COLS = 16
SRC_ROWS = 4
TOTAL_SRC_ZOMBIES = SRC_COLS * SRC_ROWS  # 64

NUM_ANIM_FRAMES = 8
NUM_VARIANTS = 16
FRAMES_PER_VARIANT = NUM_ANIM_FRAMES * 2  # 16

OUT_COLS = FRAMES_PER_VARIANT  # 16
OUT_ROWS = NUM_VARIANTS        # 16


def extract_zombie(sheet, idx):
    col = idx % SRC_COLS
    row = idx // SRC_COLS
    x = col * SRC_CELL_W
    y = row * SRC_CELL_H
    cell = sheet.crop((x, y, x + SRC_CELL_W, y + SRC_CELL_H))
    return clean_stray_pixels(cell)


def clean_stray_pixels(img):
    """
    Remove stray pixels on the edges that aren't connected to the main body.
    For each row, scan inward from left and right edges. If there's a horizontal
    gap (run of transparent pixels) between edge content and the main body,
    erase everything outside that gap.
    """
    img = img.copy()
    pixels = img.load()
    w, h = img.size
    gap_threshold = 4  # minimum transparent gap to consider content "disconnected"

    for y in range(h):
        # Find all opaque pixel positions in this row
        opaque = [x for x in range(w) if pixels[x, y][3] > 10]
        if len(opaque) < 2:
            continue

        # Find the largest connected run of opaque pixels (the main body)
        # by finding the longest stretch without a gap >= gap_threshold
        runs = []
        run_start = opaque[0]
        prev = opaque[0]
        for x in opaque[1:]:
            if x - prev > gap_threshold:
                runs.append((run_start, prev))
                run_start = x
            prev = x
        runs.append((run_start, prev))

        if len(runs) <= 1:
            continue

        # The main body is the longest run
        main_run = max(runs, key=lambda r: r[1] - r[0])

        # Erase everything outside the main run
        for run in runs:
            if run == main_run:
                continue
            for x in range(run[0], run[1] + 1):
                pixels[x, y] = (0, 0, 0, 0)

    return img


def make_breathing_frame(zombie_img, frame_idx, total_frames):
    """
    Breathing: whole sprite sways horizontally very slightly.
    NO vertical offset — source zombies fill the full 256px height,
    so any vertical shift would crop the top or bottom.
    """
    frame = Image.new('RGBA', (OUT_CELL_W, OUT_CELL_H), (0, 0, 0, 0))
    phase = (frame_idx / total_frames) * 2 * math.pi
    # Subtle horizontal sway only (±1px)
    sway_x = round(math.sin(phase) * 1)
    frame.paste(zombie_img, (PAD_X + sway_x, 0), zombie_img)
    return frame


def make_walking_frame(zombie_img, frame_idx, total_frames):
    """
    Walking: whole sprite sways horizontally with more amplitude.
    NO vertical offset — source zombies fill the full 256px height,
    so any vertical shift would crop the top or bottom.
    """
    frame = Image.new('RGBA', (OUT_CELL_W, OUT_CELL_H), (0, 0, 0, 0))
    phase = (frame_idx / total_frames) * 2 * math.pi
    # Horizontal sway (±3px)
    sway_x = round(math.sin(phase) * 3)
    frame.paste(zombie_img, (PAD_X + sway_x, 0), zombie_img)
    return frame


def main():
    sheet = Image.open(SPRITESHEET)
    print(f"Source: {sheet.size[0]}x{sheet.size[1]}, {TOTAL_SRC_ZOMBIES} zombies")

    # Only the first 16 zombies (indices 0-15, row 0 of source) are uncropped.
    # Zombies from row 1+ (indices 16-63) are already clipped at T=0 in the source.
    variant_indices = list(range(16))
    print(f"Using variants at indices: {variant_indices}")

    out_w = OUT_COLS * OUT_CELL_W   # 16 * 128 = 2048
    out_h = OUT_ROWS * OUT_CELL_H   # 16 * 256 = 4096
    print(f"Output size: {out_w}x{out_h} (cell: {OUT_CELL_W}x{OUT_CELL_H})")
    output = Image.new('RGBA', (out_w, out_h), (0, 0, 0, 0))

    for v_idx, src_idx in enumerate(variant_indices):
        zombie = extract_zombie(sheet, src_idx)

        row_y = v_idx * OUT_CELL_H

        for i in range(NUM_ANIM_FRAMES):
            idle_frame = make_breathing_frame(zombie, i, NUM_ANIM_FRAMES)
            output.paste(idle_frame, (i * OUT_CELL_W, row_y))

            walk_frame = make_walking_frame(zombie, i, NUM_ANIM_FRAMES)
            output.paste(walk_frame, ((i + NUM_ANIM_FRAMES) * OUT_CELL_W, row_y))

        print(f"  Variant {v_idx} (src zombie #{src_idx}) done")

    output.save(OUTPUT)
    print(f"\nSaved to {OUTPUT}")
    print(f"  Dimensions: {out_w}x{out_h}")
    print(f"  Cell size: {OUT_CELL_W}x{OUT_CELL_H}")
    print(f"  {NUM_VARIANTS} variants, {FRAMES_PER_VARIANT} frames each")
    print(f"  Phaser: frameWidth={OUT_CELL_W}, frameHeight={OUT_CELL_H}")


if __name__ == '__main__':
    main()
