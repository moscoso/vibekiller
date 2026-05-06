"""
Extract a single zombie from the zombie_spritesheet.png and generate
animation frames for idle (breathing) and walking.

Output: assets/zombie_anim_spritesheet.png
Layout: 8 columns, 2 rows
  Row 0: idle/breathing (8 frames)
  Row 1: walking (8 frames)

Each frame is 96x256 (same cell size as original).
"""

from PIL import Image, ImageDraw
import math

SPRITESHEET = 'assets/zombie_spritesheet.png'
OUTPUT = 'assets/zombie_anim_spritesheet.png'

CELL_W = 96
CELL_H = 256

# Pick zombie at column 2, row 0 (the one with the backwards cap)
ZOMBIE_COL = 2
ZOMBIE_ROW = 0

NUM_FRAMES = 8


def extract_zombie(sheet, col, row):
    """Extract a single zombie cell from the spritesheet."""
    x = col * CELL_W
    y = row * CELL_H
    return sheet.crop((x, y, x + CELL_W, y + CELL_H))


def find_content_bounds(img):
    """Find the bounding box of non-transparent pixels."""
    pixels = img.load()
    w, h = img.size
    top, bottom, left, right = h, 0, w, 0
    for y in range(h):
        for x in range(w):
            if pixels[x, y][3] > 10:  # non-transparent
                top = min(top, y)
                bottom = max(bottom, y)
                left = min(left, x)
                right = max(right, x)
    return left, top, right, bottom


def split_zombie(zombie_img):
    """
    Split zombie into upper body and lower body (legs) for animation.
    We find the content bounds, then split roughly at 60% height from top
    (hip line) for the walking animation.
    """
    left, top, right, bottom = find_content_bounds(zombie_img)
    content_h = bottom - top
    # Split point: approximately 60% down = hip/waist area
    split_y = top + int(content_h * 0.62)
    return {
        'top': top,
        'bottom': bottom,
        'left': left,
        'right': right,
        'split_y': split_y,
        'content_h': content_h
    }


def make_breathing_frame(zombie_img, frame_idx, total_frames, bounds):
    """
    Create a breathing frame by subtly shifting the upper body up/down
    and slightly scaling to simulate chest expansion.
    """
    frame = Image.new('RGBA', (CELL_W, CELL_H), (0, 0, 0, 0))
    
    # Breathing cycle: sinusoidal bob of 1-2 pixels
    phase = (frame_idx / total_frames) * 2 * math.pi
    bob_y = round(math.sin(phase) * 1.5)  # ±1-2 pixel vertical shift
    
    # Split at hip line
    split_y = bounds['split_y']
    
    # Lower body (legs) stays in place
    lower = zombie_img.crop((0, split_y, CELL_W, CELL_H))
    frame.paste(lower, (0, split_y), lower)
    
    # Upper body bobs up/down
    upper = zombie_img.crop((0, 0, CELL_W, split_y))
    frame.paste(upper, (0, bob_y), upper)
    
    return frame


def make_walking_frame(zombie_img, frame_idx, total_frames, bounds):
    """
    Create a walking frame by:
    - Shifting legs alternately left/right to simulate stepping
    - Adding a slight body lean/bob
    - Swaying the upper body
    """
    frame = Image.new('RGBA', (CELL_W, CELL_H), (0, 0, 0, 0))
    
    phase = (frame_idx / total_frames) * 2 * math.pi
    
    split_y = bounds['split_y']
    mid_x = CELL_W // 2
    
    # Body bob — up on mid-stride, down on foot-plant
    body_bob = round(math.sin(phase * 2) * 1.5)
    # Body lean — slight horizontal sway
    body_lean = round(math.sin(phase) * 1.5)
    
    # --- Lower body: split into left and right legs ---
    leg_region = zombie_img.crop((0, split_y, CELL_W, CELL_H))
    leg_w, leg_h = leg_region.size
    
    # Split legs at the center
    left_leg = leg_region.crop((0, 0, mid_x, leg_h))
    right_leg = leg_region.crop((mid_x, 0, leg_w, leg_h))
    
    # Alternate leg positions (forward/back simulated by vertical offset)
    left_leg_offset_y = round(math.sin(phase) * 2)
    right_leg_offset_y = round(math.sin(phase + math.pi) * 2)
    
    # Horizontal stride
    left_leg_offset_x = round(math.sin(phase) * 1.5)
    right_leg_offset_x = round(math.sin(phase + math.pi) * 1.5)
    
    frame.paste(left_leg, (0 + left_leg_offset_x, split_y + left_leg_offset_y), left_leg)
    frame.paste(right_leg, (mid_x + right_leg_offset_x, split_y + right_leg_offset_y), right_leg)
    
    # --- Upper body: lean + bob ---
    upper = zombie_img.crop((0, 0, CELL_W, split_y))
    frame.paste(upper, (body_lean, body_bob), upper)
    
    return frame


def main():
    sheet = Image.open(SPRITESHEET)
    zombie = extract_zombie(sheet, ZOMBIE_COL, ZOMBIE_ROW)
    bounds = split_zombie(zombie)
    
    print(f"Zombie content bounds: top={bounds['top']}, bottom={bounds['bottom']}, "
          f"split_y={bounds['split_y']}, height={bounds['content_h']}")
    
    # Create output spritesheet: 8 cols × 2 rows
    out_w = CELL_W * NUM_FRAMES
    out_h = CELL_H * 2
    output = Image.new('RGBA', (out_w, out_h), (0, 0, 0, 0))
    
    # Row 0: breathing/idle
    for i in range(NUM_FRAMES):
        frame = make_breathing_frame(zombie, i, NUM_FRAMES, bounds)
        output.paste(frame, (i * CELL_W, 0))
    
    # Row 1: walking
    for i in range(NUM_FRAMES):
        frame = make_walking_frame(zombie, i, NUM_FRAMES, bounds)
        output.paste(frame, (i * CELL_W, CELL_H))
    
    output.save(OUTPUT)
    print(f"Saved animated zombie spritesheet to {OUTPUT}")
    print(f"  Dimensions: {out_w}x{out_h} ({NUM_FRAMES} cols × 2 rows)")
    print(f"  Row 0: idle/breathing animation")
    print(f"  Row 1: walking animation")


if __name__ == '__main__':
    main()
